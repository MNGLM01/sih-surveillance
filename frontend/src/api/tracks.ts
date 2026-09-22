import { MOCK_MOVEMENT_HISTORY, MOCK_TRACKS } from '@/mocks/tracks'
import type { Incident, Track } from '@/types/domain'

/** The backend has no live-track endpoint (tracker.py's state is transient,
 * in-process - see docs/architecture.md §3). Full Track Intelligence
 * (confidence, direction, speed, movement history) is therefore always demo
 * data; `getTracks()` never attempts a live fetch. When real incidents are
 * available, the store fills in any track_id missing from this curated set
 * via `deriveTrackFromIncident` below - a minimal, honestly-partial 'live'
 * record instead of silently dropping it from Active Tracks lists. */
export async function getTracks(): Promise<{ data: Track[]; source: 'demo' }> {
  return { data: MOCK_TRACKS, source: 'demo' }
}

export function deriveTrackFromIncident(incident: Incident): Track {
  return {
    trackId: incident.trackId,
    cameraId: incident.cameraId,
    objectType: incident.objectClass === 'person' ? 'PERSON' : 'VEHICLE',
    className: incident.objectClass,
    confidence: 0,
    firstSeen: incident.createdAt,
    lastSeen: incident.updatedAt,
    riskScore: incident.riskScore,
    severity: incident.severity,
    source: 'live',
  }
}

export function getMovementHistory(trackId: string) {
  return MOCK_MOVEMENT_HISTORY[trackId] ?? []
}
