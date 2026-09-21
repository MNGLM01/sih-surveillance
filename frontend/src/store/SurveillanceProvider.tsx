import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'

import { getCameras } from '@/api/cameras'
import { getIncidents, setIncidentStatus as patchIncidentStatus } from '@/api/incidents'
import { connectLiveEvents, type LiveMessage } from '@/api/liveEvents'
import { deriveTrackFromIncident, getTracks } from '@/api/tracks'
import { severityFromScore } from '@/lib/severity'
import { startDemoTicker } from '@/store/liveDemoTicker'
import type { AuditActionType, AuditLogEntry } from '@/types/extended'
import { MOCK_AUDIT_LOG } from '@/mocks/audit'
import type { Camera, DataSource, Incident, IncidentStatus, ObjectClass, Track } from '@/types'

const OPEN_STATUSES: IncidentStatus[] = ['NEW', 'ACKNOWLEDGED', 'INVESTIGATING']

/** A long-running demo (looping sample video, nothing ever auto-expires an
 * incident - see backend/incident.py) accumulates incidents indefinitely.
 * Keep only the most recent MAX_INCIDENTS in memory so every page stays
 * fast regardless of session length; the backend's own store is unaffected. */
const MAX_INCIDENTS = 300

function capIncidents(incidents: Incident[]): Incident[] {
  return incidents.length > MAX_INCIDENTS ? incidents.slice(0, MAX_INCIDENTS) : incidents
}

const STATUS_TO_AUDIT_ACTION: Record<IncidentStatus, AuditActionType | null> = {
  NEW: null,
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  INVESTIGATING: 'INVESTIGATING',
  VERIFIED: 'VERIFIED',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  RESOLVED: 'RESOLVED',
}

interface State {
  loading: boolean
  cameras: Camera[]
  camerasSource: DataSource
  incidents: Incident[]
  incidentsSource: DataSource
  tracks: Track[]
  auditLog: AuditLogEntry[]
  operatorName: string
  selectedCameraId: string | null
  liveConnected: boolean
}

type Action =
  | { type: 'INIT_LOADED'; cameras: Camera[]; camerasSource: DataSource; incidents: Incident[]; incidentsSource: DataSource; tracks: Track[] }
  | { type: 'LIVE_STATUS'; connected: boolean }
  | { type: 'LIVE_MESSAGE'; message: LiveMessage }
  | { type: 'SELECT_CAMERA'; cameraId: string }
  | { type: 'SET_INCIDENT_STATUS'; incidentId: string; status: IncidentStatus; auditEntry: AuditLogEntry }
  | { type: 'ADD_AUDIT_ENTRY'; entry: AuditLogEntry }
  | { type: 'SET_OPERATOR_NAME'; name: string }

function cameraNameMap(cameras: Camera[]): Record<string, string> {
  return Object.fromEntries(cameras.map((c) => [c.id, c.name]))
}

function applyLiveMessage(state: State, message: LiveMessage): Incident[] {
  if (message.type === 'event') return state.incidents

  const payload = message.data
  const id = String(payload.incident_id)
  const nowIso = new Date().toISOString()
  const severity = severityFromScore(payload.risk_score)
  const existingIndex = state.incidents.findIndex((i) => i.id === id)

  if (existingIndex >= 0) {
    const next = [...state.incidents]
    next[existingIndex] = {
      ...next[existingIndex],
      riskScore: payload.risk_score,
      severity,
      status: payload.status as IncidentStatus,
      reasons: payload.reasons,
      updatedAt: nowIso,
    }
    return next
  }

  const newIncident: Incident = {
    id,
    cameraId: payload.camera_id,
    cameraName: cameraNameMap(state.cameras)[payload.camera_id] ?? payload.camera_id,
    trackId: payload.track_id,
    objectClass: payload.object_class as ObjectClass,
    riskScore: payload.risk_score,
    severity,
    status: payload.status as IncidentStatus,
    createdAt: nowIso,
    updatedAt: nowIso,
    reasons: payload.reasons,
    evidencePath: null,
  }
  return capIncidents([newIncident, ...state.incidents])
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT_LOADED':
      return {
        ...state,
        loading: false,
        cameras: action.cameras,
        camerasSource: action.camerasSource,
        incidents: capIncidents(action.incidents),
        incidentsSource: action.incidentsSource,
        tracks: action.tracks,
        selectedCameraId: state.selectedCameraId ?? action.cameras[0]?.id ?? null,
      }
    case 'LIVE_STATUS':
      return { ...state, liveConnected: action.connected }
    case 'LIVE_MESSAGE':
      return { ...state, incidents: applyLiveMessage(state, action.message) }
    case 'SELECT_CAMERA':
      return { ...state, selectedCameraId: action.cameraId }
    case 'SET_INCIDENT_STATUS':
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === action.incidentId ? { ...i, status: action.status, updatedAt: new Date().toISOString() } : i,
        ),
        auditLog: [action.auditEntry, ...state.auditLog],
      }
    case 'ADD_AUDIT_ENTRY':
      return { ...state, auditLog: [action.entry, ...state.auditLog] }
    case 'SET_OPERATOR_NAME':
      try {
        localStorage.setItem('borderai.operatorName', action.name)
      } catch {
        // private browsing / storage disabled - name still updates for this session
      }
      return { ...state, operatorName: action.name }
    default:
      return state
  }
}

function loadOperatorName(): string {
  try {
    return localStorage.getItem('borderai.operatorName') || 'Operator A'
  } catch {
    return 'Operator A'
  }
}

const initialState: State = {
  loading: true,
  cameras: [],
  camerasSource: 'demo',
  incidents: [],
  incidentsSource: 'demo',
  tracks: [],
  auditLog: MOCK_AUDIT_LOG,
  operatorName: loadOperatorName(),
  selectedCameraId: null,
  liveConnected: false,
}

interface SurveillanceContextValue extends State {
  camerasWithIncidentCounts: Camera[]
  activeIncidentCount: (cameraId: string) => number
  tracksByCamera: (cameraId: string) => Track[]
  selectCamera: (cameraId: string) => void
  setIncidentStatus: (incidentId: string, status: IncidentStatus, reason?: string) => void
  logViewedEvidence: (incidentId: string, cameraId: string) => void
  setOperatorName: (name: string) => void
}

const SurveillanceContext = createContext<SurveillanceContextValue | null>(null)

export function SurveillanceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stopLiveRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const camerasResult = await getCameras()
      if (cancelled) return
      const incidentsResult = await getIncidents(cameraNameMap(camerasResult.data))
      if (cancelled) return
      const tracksResult = await getTracks()
      if (cancelled) return

      dispatch({
        type: 'INIT_LOADED',
        cameras: camerasResult.data,
        camerasSource: camerasResult.source,
        incidents: incidentsResult.data,
        incidentsSource: incidentsResult.source,
        tracks: tracksResult.data,
      })

      if (incidentsResult.source === 'live') {
        stopLiveRef.current = connectLiveEvents(
          (message) => dispatch({ type: 'LIVE_MESSAGE', message }),
          (connected) => dispatch({ type: 'LIVE_STATUS', connected }),
        )
      } else {
        stopLiveRef.current = startDemoTicker((message) => dispatch({ type: 'LIVE_MESSAGE', message }))
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
      stopLiveRef.current?.()
    }
  }, [])

  const selectCamera = useCallback((cameraId: string) => dispatch({ type: 'SELECT_CAMERA', cameraId }), [])

  const setIncidentStatus = useCallback(
    (incidentId: string, status: IncidentStatus, reason?: string) => {
      const incident = state.incidents.find((i) => i.id === incidentId)
      const auditAction = STATUS_TO_AUDIT_ACTION[status]
      const auditEntry: AuditLogEntry = {
        id: `a-${incidentId}-${status}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        operator: state.operatorName,
        action: auditAction ?? 'ACKNOWLEDGED',
        targetType: 'INCIDENT',
        targetId: incidentId,
        cameraId: incident?.cameraId,
        result: 'SUCCESS',
        reason,
        source: 'live',
      }
      dispatch({ type: 'SET_INCIDENT_STATUS', incidentId, status, auditEntry })

      if (state.incidentsSource === 'live') {
        void patchIncidentStatus(incidentId, status)
      }
    },
    [state.incidents, state.incidentsSource, state.operatorName],
  )

  const logViewedEvidence = useCallback(
    (incidentId: string, cameraId: string) => {
      dispatch({
        type: 'ADD_AUDIT_ENTRY',
        entry: {
          id: `a-${incidentId}-viewed-${Date.now()}`,
          timestamp: new Date().toISOString(),
          operator: state.operatorName,
          action: 'VIEWED_EVIDENCE',
          targetType: 'EVIDENCE',
          targetId: incidentId,
          cameraId,
          result: 'SUCCESS',
          source: 'live',
        },
      })
    },
    [state.operatorName],
  )

  const setOperatorName = useCallback((name: string) => dispatch({ type: 'SET_OPERATOR_NAME', name }), [])

  const activeIncidentCount = useCallback(
    (cameraId: string) => state.incidents.filter((i) => i.cameraId === cameraId && OPEN_STATUSES.includes(i.status)).length,
    [state.incidents],
  )

  const camerasWithIncidentCounts = useMemo(
    () => state.cameras.map((cam) => ({ ...cam, incidentCount: activeIncidentCount(cam.id) })),
    [state.cameras, activeIncidentCount],
  )

  const tracksByCamera = useCallback(
    (cameraId: string) => {
      // The curated demo track pool (mocks/tracks.ts) only applies in pure
      // demo mode. In live mode, a raw ByteTrack id (small integers,
      // restarting near 1 on every camera reset) can coincidentally match a
      // demo track's id - if we merged it in here, a real track would
      // silently show fabricated confidence/direction/duration instead of
      // its real (partial) data. See api/tracks.ts.
      const curated = state.incidentsSource === 'live' ? [] : state.tracks.filter((t) => t.cameraId === cameraId)
      const curatedIds = new Set(curated.map((t) => t.trackId))

      // A track can have several open incidents over time (each cooldown
      // expiry starts a fresh one - see backend/incident.py); collapse to
      // the single most-recently-updated incident per track_id so Active
      // Tracks shows one row per object, not one per incident.
      const latestByTrackId = new Map<string, Incident>()
      for (const incident of state.incidents) {
        if (incident.cameraId !== cameraId || !OPEN_STATUSES.includes(incident.status) || curatedIds.has(incident.trackId)) continue
        const existing = latestByTrackId.get(incident.trackId)
        if (!existing || new Date(incident.updatedAt) > new Date(existing.updatedAt)) {
          latestByTrackId.set(incident.trackId, incident)
        }
      }

      return [...curated, ...[...latestByTrackId.values()].map(deriveTrackFromIncident)]
    },
    [state.tracks, state.incidents, state.incidentsSource],
  )

  const value: SurveillanceContextValue = {
    ...state,
    camerasWithIncidentCounts,
    activeIncidentCount,
    tracksByCamera,
    selectCamera,
    setIncidentStatus,
    logViewedEvidence,
    setOperatorName,
  }

  return <SurveillanceContext.Provider value={value}>{children}</SurveillanceContext.Provider>
}

export function useSurveillance(): SurveillanceContextValue {
  const ctx = useContext(SurveillanceContext)
  if (!ctx) throw new Error('useSurveillance must be used within a SurveillanceProvider')
  return ctx
}
