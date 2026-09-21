import { cn } from '@/lib/cn'

export function Gauge({ label, pct, className }: { label: string; pct: number; className?: string }) {
  const tone = pct >= 90 ? 'bg-critical' : pct >= 75 ? 'bg-medium' : 'bg-live'
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
        <span className="font-mono text-ink">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel-inset">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}
