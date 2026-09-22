import { fetchJson } from '@/api/client'
import { classifyIncidentType } from '@/lib/incidentType'
import { MOCK_ANALYTICS } from '@/mocks/analytics'
import type { Incident } from '@/types/domain'
import type { AnalyticsSummary } from '@/types/extended'

/**
 * Everything below is computed live from real `/incidents` (and `/events`
 * for a real same-day count) whenever the backend answers - only the raw
 * "objects detected" total is always a demo estimate, because the backend
 * never persists per-frame detection counts (see docs/PRD.md §10: only
 * score-crossing events are written). `incidentsByHour` also stays demo:
 * a fresh local dataset rarely has enough same-day incidents to plot a
 * meaningful hourly curve.
 */
export async function getAnalytics(incidents: Incident[], incidentsSource: 'live' | 'demo'): Promise<AnalyticsSummary> {
  if (incidentsSource === 'demo' || incidents.length === 0) {
    return MOCK_ANALYTICS
  }

  let eventsToday = MOCK_ANALYTICS.eventsToday
  try {
    const events = await fetchJson<unknown[]>('/events')
    eventsToday = events.length
  } catch {
    // keep the demo estimate
  }

  const cameraActivity = new Map<string, { cameraId: string; cameraName: string; count: number }>()
  const incidentsByType = new Map<string, number>()
  const riskDistribution: AnalyticsSummary['riskDistribution'] = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }

  for (const incident of incidents) {
    const camEntry = cameraActivity.get(incident.cameraId) ?? {
      cameraId: incident.cameraId,
      cameraName: incident.cameraName,
      count: 0,
    }
    camEntry.count += 1
    cameraActivity.set(incident.cameraId, camEntry)

    const type = classifyIncidentType(incident)
    incidentsByType.set(type, (incidentsByType.get(type) ?? 0) + 1)

    riskDistribution[incident.severity] += 1
  }

  return {
    detectionsToday: MOCK_ANALYTICS.detectionsToday,
    eventsToday,
    highRiskIncidentsToday: incidents.filter((i) => i.severity === 'HIGH' || i.severity === 'CRITICAL').length,
    verifiedIncidentsToday: incidents.filter((i) => i.status === 'VERIFIED').length,
    incidentsByHour: MOCK_ANALYTICS.incidentsByHour,
    incidentsByType: [...incidentsByType.entries()].map(([type, count]) => ({ type, count })),
    cameraActivity: [...cameraActivity.values()],
    riskDistribution,
    source: 'live',
  }
}
