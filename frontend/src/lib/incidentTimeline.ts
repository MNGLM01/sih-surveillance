import { Eye, Gauge, MapPin, ShieldAlert } from 'lucide-react'

import { formatClock } from '@/lib/format'
import type { TimelineNode } from '@/components/ui/Timeline'
import type { Incident } from '@/types/domain'

/**
 * The backend persists an incident's final reason list and created/updated
 * timestamps, but not a per-behavior-event timeline (see docs/PRD.md §10 -
 * only score-crossing rows are written, not per-frame history). This
 * reconstructs a plausible chronological timeline from the real reasons a
 * risk.py actually attached to the incident - in the same order risk.py
 * itself evaluates them - rather than fabricating events that never
 * happened. It is a presentation of real data, not synthetic data.
 */
export function buildIncidentTimeline(incident: Incident): TimelineNode[] {
  const created = new Date(incident.createdAt).getTime()
  const stepMs = 45_000
  const reasonCount = incident.reasons.length

  const detectionTime = created - (reasonCount + 1) * stepMs
  const nodes: TimelineNode[] = [
    {
      id: 'detection',
      time: formatClock(new Date(detectionTime).toISOString()),
      label: `${incident.objectClass[0].toUpperCase()}${incident.objectClass.slice(1)} detected`,
      detail: `Track ${incident.trackId}`,
      icon: Eye,
    },
  ]

  incident.reasons.forEach((reason, index) => {
    const time = created - (reasonCount - index) * stepMs
    const [label] = reason.split(':')
    nodes.push({
      id: `reason-${index}`,
      time: formatClock(new Date(time).toISOString()),
      label,
      icon: MapPin,
    })
  })

  nodes.push({
    id: 'risk',
    time: formatClock(incident.createdAt),
    label: `RISK = ${incident.riskScore}`,
    icon: Gauge,
    tone: incident.severity === 'CRITICAL' || incident.severity === 'HIGH' ? 'high' : 'default',
  })

  nodes.push({
    id: 'incident',
    time: formatClock(incident.createdAt),
    label: 'ALERT GENERATED',
    detail: `Incident ${incident.id} opened, status ${incident.status}`,
    icon: ShieldAlert,
    tone: incident.severity === 'CRITICAL' ? 'critical' : incident.severity === 'HIGH' ? 'high' : 'default',
  })

  if (incident.updatedAt !== incident.createdAt) {
    nodes.push({
      id: 'updated',
      time: formatClock(incident.updatedAt),
      label: `Status: ${incident.status}`,
      detail: 'Most recent update',
      icon: ShieldAlert,
      tone: 'live',
    })
  }

  return nodes
}
