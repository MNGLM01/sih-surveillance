import { fetchJson, withDemoFallback } from '@/api/client'
import { severityFromScore } from '@/lib/severity'
import { MOCK_INCIDENTS } from '@/mocks/incidents'
import type { Incident, IncidentStatus, ObjectClass } from '@/types/domain'

/** Mirrors backend/db.py `list_incidents`/`get_incident` (via GET /incidents,
 * PATCH /incidents/{id}) and backend/schemas.py `Incident`. */
interface BackendIncident {
  id: number
  camera_id: string
  track_id: string
  object_class: ObjectClass
  risk_score: number
  severity: string
  status: IncidentStatus
  created_at: string
  updated_at: string
  reasons: string[]
  evidence_path: string | null
}

function mapIncident(raw: BackendIncident, cameraName: string): Incident {
  return {
    id: String(raw.id),
    cameraId: raw.camera_id,
    cameraName,
    trackId: raw.track_id,
    objectClass: raw.object_class,
    riskScore: raw.risk_score,
    // Re-derive severity client-side (severityFromScore) rather than trust
    // the backend's 3-band string, so CRITICAL is available consistently.
    severity: severityFromScore(raw.risk_score),
    status: raw.status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    reasons: raw.reasons,
    evidencePath: raw.evidence_path,
  }
}

export async function getIncidents(cameraNameById: Record<string, string>) {
  return withDemoFallback(
    () =>
      fetchJson<BackendIncident[]>('/incidents').then((raw) =>
        raw.map((inc) => mapIncident(inc, cameraNameById[inc.camera_id] ?? inc.camera_id)),
      ),
    MOCK_INCIDENTS,
  )
}

export async function setIncidentStatus(incidentId: string, status: IncidentStatus): Promise<Incident | null> {
  try {
    const raw = await fetchJson<BackendIncident>(`/incidents/${incidentId}?status=${status}`, { method: 'PATCH' })
    return mapIncident(raw, raw.camera_id)
  } catch {
    return null // caller falls back to a local-only status update
  }
}
