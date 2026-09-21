import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'

export interface TimelineNode {
  id: string
  time: string
  label: string
  detail?: string
  icon: LucideIcon
  tone?: 'default' | 'critical' | 'high' | 'live'
}

const TONE_CLASS: Record<NonNullable<TimelineNode['tone']>, string> = {
  default: 'border-border-strong bg-panel-raised text-ink-muted',
  high: 'border-high/50 bg-high/10 text-high-ink',
  critical: 'border-critical/50 bg-critical/10 text-critical-ink',
  live: 'border-live/50 bg-live/10 text-live',
}

export function Timeline({ nodes, className }: { nodes: TimelineNode[]; className?: string }) {
  return (
    <ol className={cn('relative space-y-5 border-l border-border pl-6', className)}>
      {nodes.map((node) => {
        const Icon = node.icon
        return (
          <li key={node.id} className="relative">
            <span
              className={cn(
                'absolute top-0 -left-[29px] flex size-6 items-center justify-center rounded-full border',
                TONE_CLASS[node.tone ?? 'default'],
              )}
            >
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs text-ink-dim">{node.time}</span>
              <span className="text-sm font-medium text-ink">{node.label}</span>
            </div>
            {node.detail && <p className="mt-0.5 text-xs text-ink-muted">{node.detail}</p>}
          </li>
        )
      })}
    </ol>
  )
}
