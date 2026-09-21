import type { Incident } from '@/types/domain'

const INCIDENT_TYPES = ['Zone intrusion', 'Loitering', 'Vehicle', 'Suspicious movement', 'Other'] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]
export { INCIDENT_TYPES }

/** Incidents don't carry a single "type" field from the backend - they carry
 * a list of weighted reasons (risk.py). This buckets by the dominant reason
 * so the UI has a filterable "type" without inventing a backend field. */
export function classifyIncidentType(incident: Incident): IncidentType {
  const reasonText = incident.reasons.join(' ').toLowerCase()
  if (reasonText.includes('vehicle')) return 'Vehicle'
  if (reasonText.includes('loitering') || reasonText.includes('lingering')) return 'Loitering'
  if (reasonText.includes('zone intrusion')) return 'Zone intrusion'
  if (reasonText.includes('erratic') || reasonText.includes('moving toward')) return 'Suspicious movement'
  return 'Other'
}
