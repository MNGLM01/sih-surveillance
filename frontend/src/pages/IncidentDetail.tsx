import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { IncidentActionBar } from '@/components/incidents/IncidentActionBar'
import { Card, CardContent, CardHeader, RiskBar, SeverityBadge } from '@/components/ui'
import { Timeline } from '@/components/ui/Timeline'
import { EvidenceViewer } from '@/components/evidence/EvidenceViewer'
import { formatDateTime, formatIncidentId } from '@/lib/format'
import { buildIncidentTimeline } from '@/lib/incidentTimeline'
import { ROUTES } from '@/routes'
import { useSurveillance } from '@/store/SurveillanceProvider'

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { incidents, setIncidentStatus, logViewedEvidence } = useSurveillance()
  const incident = incidents.find((i) => i.id === id)

  useEffect(() => {
    if (incident) logViewedEvidence(incident.id, incident.cameraId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.id])

  if (!incident) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-ink-muted">Incident not found.</p>
        <Link to={ROUTES.incidentLog} className="text-sm text-low hover:underline">
          Back to Incidents
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-3">
      <button
        type="button"
        onClick={() => navigate(ROUTES.incidentLog)}
        className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-3.5" /> All incidents
      </button>

      <Card>
        <CardHeader
          title={`Incident ${formatIncidentId(incident.id)}`}
          action={<SeverityBadge severity={incident.severity} />}
        />
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Status</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{incident.status.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Location</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{incident.cameraName}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Time</p>
            <p className="mt-0.5 font-mono text-sm text-ink">{formatDateTime(incident.createdAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Object</p>
            <p className="mt-0.5 text-sm font-semibold text-ink capitalize">
              {incident.objectClass} · {incident.trackId}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <p className="mb-1 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Risk score</p>
            <RiskBar score={incident.riskScore} severity={incident.severity} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="Event Analysis" subtitle="Contributing factors (risk.py)" />
          <CardContent>
            <ul className="space-y-2">
              {incident.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-live" aria-hidden />
                  <span className="text-ink-muted">{reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Operator Action" subtitle="Human-in-the-loop - the system assists, you decide" />
          <CardContent>
            <IncidentActionBar incident={incident} onChangeStatus={(status, reason) => setIncidentStatus(incident.id, status, reason)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title={`Evidence #${incident.id}`} />
        <CardContent>
          <EvidenceViewer incident={incident} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Incident Timeline" />
        <CardContent>
          <Timeline nodes={buildIncidentTimeline(incident)} />
        </CardContent>
      </Card>
    </div>
  )
}
