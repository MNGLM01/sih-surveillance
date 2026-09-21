/**
 * Core pipeline data contracts. These mirror backend/schemas.py 1:1 where the
 * backend already implements the concept (Detection, Track, BehaviorEvent,
 * RiskReason/RiskResult, Incident, IncidentStatus, Zone) - field names and
 * shapes are kept identical so the `api/` layer's live-fetch path needs no
 * translation. See `types/extended.ts` for UI concepts the backend does not
 * (yet) expose, and `lib/dataSource.ts` for how each resource is labeled.
 */

import type { DataSource } from '@/types/dataSource'

export type ObjectClass = 'person' | 'car' | 'motorcycle' | 'bus' | 'truck' | 'object'

export type CameraStatus = 'STARTING' | 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'ERROR' | 'STOPPED' | 'UNKNOWN'

export interface Zone {
  name: string
  rectNorm: [number, number, number, number] // (x1, y1, x2, y2), fractions of frame size
}

export interface Camera {
  id: string
  name: string
  location: string
  status: CameraStatus
  error?: string | null
  lat: number
  lon: number
  zones: Zone[]
  /** Not exposed by the current backend API - only ever present in demo data. */
  fps?: number
  latencyMs?: number
  incidentCount: number
}

export interface Detection {
  bbox: [number, number, number, number]
  className: ObjectClass
  confidence: number
  center: [number, number]
}

export interface TrackPosition {
  timestamp: number
  x: number
  y: number
}

export interface Track {
  trackId: string // camera-scoped, e.g. "cam1:P-7"
  cameraId: string
  objectType: 'PERSON' | 'VEHICLE'
  className: ObjectClass
  confidence: number
  firstSeen: string
  lastSeen: string
  zone?: string
  direction?: string
  speed?: number
  riskScore?: number
  severity?: Severity
  positions?: TrackPosition[]
  /** Only the fields above minus these two are ever recoverable from a real
   * incident - the rest (confidence, direction, speed, positions) are demo
   * unless this is explicitly 'live'. */
  source?: DataSource
}

export const BEHAVIOR_EVENT_TYPES = [
  'ZONE_INTRUSION',
  'LOITERING',
  'AFTER_HOURS',
  'MOVING_TOWARD_RESTRICTED_ZONE',
  'MOVING_AWAY',
  'ERRATIC_SPEED',
  'VEHICLE_STOPPED',
  'REPEATED_ZONE_VISITS',
  'CROWD_FORMATION',
] as const
export type BehaviorEventType = (typeof BEHAVIOR_EVENT_TYPES)[number]

export interface BehaviorEvent {
  eventType: BehaviorEventType
  cameraId: string
  trackId: string
  timestamp: string
  confidence: number
  metadata: Record<string, unknown>
}

export interface RiskReason {
  type: string
  points: number
  label: string
}

/** LOW/MEDIUM/HIGH is what the backend actually computes. CRITICAL is a
 * client-side refinement of the same real 0-100 score for finer operator
 * triage - see `severityFromScore()` in `lib/severity.ts`. */
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface RiskResult {
  score: number
  severity: Severity
  reasons: RiskReason[]
}

export const INCIDENT_STATUSES = [
  'NEW',
  'ACKNOWLEDGED',
  'INVESTIGATING',
  'VERIFIED',
  'FALSE_POSITIVE',
  'RESOLVED',
] as const
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]

export interface Incident {
  id: string
  cameraId: string
  cameraName: string
  trackId: string
  objectClass: ObjectClass
  riskScore: number
  severity: Severity
  status: IncidentStatus
  createdAt: string
  updatedAt: string
  reasons: string[]
  evidencePath?: string | null
}

export interface Evidence {
  incidentId: string
  cameraId: string
  eventLabel: string
  capturedFrom: string
  capturedTo: string
  url?: string | null
  sha256?: string
  integrityVerified: boolean
}
