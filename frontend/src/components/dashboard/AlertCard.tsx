import { useNavigate } from 'react-router-dom'

import { Button, RiskBar, RiskBreakdown, SeverityBadge } from '@/components/ui'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/routes'
import { useSurveillance } from '@/store/SurveillanceProvider'
import type { Incident } from '@/types/domain'

export function AlertCard({ incident }: { incident: Incident }) {
  const navigate = useNavigate()
  const { setIncidentStatus } = useSurveillance()
  const emphasisClass =
    incident.severity === 'CRITICAL'
      ? 'border-critical/50 bg-critical/5'
      : incident.severity === 'HIGH'
        ? 'border-high/40 bg-high/5'
        : 'border-border'

  return (
    <div className={cn('space-y-2.5 rounded border p-3', emphasisClass)}>
      <div className="flex items-start justify-between gap-2">
        <SeverityBadge severity={incident.severity} />
        <span className="shrink-0 font-mono text-[11px] text-ink-dim">{formatRelative(incident.createdAt)}</span>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">
          {incident.cameraName} · {incident.objectClass[0].toUpperCase() + incident.objectClass.slice(1)} #{incident.trackId.split('-').pop()}
        </p>
        <p className="font-mono text-[11px] text-ink-dim">{incident.trackId}</p>
      </div>

      <RiskBar score={incident.riskScore} severity={incident.severity} />

      <div>
        <p className="mb-1 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Why?</p>
        <RiskBreakdown reasons={incident.reasons} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.incidentDetail(incident.id))}>
          View
        </Button>
        {incident.status === 'NEW' && (
          <Button size="sm" variant="secondary" onClick={() => setIncidentStatus(incident.id, 'ACKNOWLEDGED')}>
            Acknowledge
          </Button>
        )}
      </div>
    </div>
  )
}
