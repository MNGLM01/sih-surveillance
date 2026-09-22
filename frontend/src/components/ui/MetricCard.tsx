import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  className,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  tone?: 'default' | 'critical' | 'high' | 'medium' | 'low' | 'live'
  className?: string
}) {
  const toneClass =
    tone === 'default'
      ? 'text-ink'
      : {
          critical: 'text-critical-ink',
          high: 'text-high-ink',
          medium: 'text-medium-ink',
          low: 'text-low-ink',
          live: 'text-live',
        }[tone]

  return (
    <div className={cn('rounded-md border border-border bg-panel px-4 py-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-widest text-ink-muted uppercase">{label}</span>
        {Icon && <Icon className="size-4 text-ink-dim" aria-hidden />}
      </div>
      <p className={cn('mt-1.5 font-mono text-2xl font-semibold', toneClass)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-dim">{hint}</p>}
    </div>
  )
}
