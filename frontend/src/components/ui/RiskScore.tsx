import { cn } from '@/lib/cn'
import { SEVERITY_CONFIG } from '@/lib/severity'
import type { Severity } from '@/types'

export function RiskBar({ score, severity, className }: { score: number; severity: Severity; className?: string }) {
  const config = SEVERITY_CONFIG[severity]
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-inset">
        <div
          className={cn('h-full rounded-full transition-[width]', config.dot)}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <span className={cn('w-9 shrink-0 text-right font-mono text-sm font-semibold', config.text)}>{score}</span>
    </div>
  )
}

/** The explainability requirement (spec §11): every risk score renders next
 * to the named, weighted reasons that produced it - never a bare number. */
export function RiskBreakdown({ reasons, className }: { reasons: string[]; className?: string }) {
  if (reasons.length === 0) {
    return <p className={cn('text-xs text-ink-dim italic', className)}>No contributing factors recorded.</p>
  }
  return (
    <ul className={cn('space-y-1', className)}>
      {reasons.map((reason) => {
        const match = reason.match(/^(.*):\s*\+(\d+)$/)
        const label = match ? match[1] : reason
        const points = match ? match[2] : null
        return (
          <li key={reason} className="flex items-baseline justify-between gap-3 font-mono text-xs">
            <span className="text-ink-muted">{label}</span>
            {points && <span className="shrink-0 font-semibold text-ink">+{points}</span>}
          </li>
        )
      })}
    </ul>
  )
}
