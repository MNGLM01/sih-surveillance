import { useNavigate } from 'react-router-dom'

import { AlertCard } from '@/components/dashboard/AlertCard'
import { EmptyState, SeverityBadge } from '@/components/ui'
import { SEVERITIES, SEVERITY_CONFIG } from '@/lib/severity'
import { formatRelative } from '@/lib/format'
import { ShieldCheck } from 'lucide-react'
import { ROUTES } from '@/routes'
import type { Incident, Severity } from '@/types/domain'

const OPEN_STATUSES = new Set(['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'])

function CompactRow({ incident }: { incident: Incident }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate(ROUTES.incidentDetail(incident.id))}
      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-panel-raised"
    >
      <span className="flex min-w-0 items-center gap-2">
        <SeverityBadge severity={incident.severity} className="shrink-0 px-1.5 py-0" />
        <span className="truncate text-ink-muted">
          {incident.cameraName} · {incident.trackId}
        </span>
      </span>
      <span className="shrink-0 font-mono text-ink-dim">{formatRelative(incident.createdAt)}</span>
    </button>
  )
}

export function AlertCenter({ incidents }: { incidents: Incident[] }) {
  const open = incidents.filter((i) => OPEN_STATUSES.has(i.status))
  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const inc of open) counts[inc.severity] += 1

  const sorted = [...open].sort((a, b) => {
    const sevDiff = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
    if (sevDiff !== 0) return sevDiff
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const emphasized = sorted.filter((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH')
  const rest = sorted.filter((i) => i.severity === 'MEDIUM' || i.severity === 'LOW')

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-4 gap-1.5 border-b border-border p-3">
        {SEVERITIES.map((sev) => (
          <div key={sev} className={`rounded border ${SEVERITY_CONFIG[sev].border} ${SEVERITY_CONFIG[sev].bg} px-1.5 py-1.5 text-center`}>
            <p className={`font-mono text-lg font-bold ${SEVERITY_CONFIG[sev].text}`}>{counts[sev]}</p>
            <p className="text-[9px] font-semibold tracking-wide text-ink-dim">{sev}</p>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {sorted.length === 0 && (
          <EmptyState icon={ShieldCheck} title="No active alerts" detail="All incidents are resolved or closed out." />
        )}

        {emphasized.map((incident) => (
          <AlertCard key={incident.id} incident={incident} />
        ))}

        {rest.length > 0 && (
          <div className="space-y-0.5 border-t border-border pt-2">
            <p className="px-2 pb-1 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Other activity</p>
            {rest.map((incident) => (
              <CompactRow key={incident.id} incident={incident} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
