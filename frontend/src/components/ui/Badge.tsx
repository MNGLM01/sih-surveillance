import { Radio, WifiOff } from 'lucide-react'

import { cn } from '@/lib/cn'
import { DATA_SOURCE_CONFIG } from '@/lib/dataSource'
import { SEVERITY_CONFIG } from '@/lib/severity'
import type { CameraStatus, DataSource, Severity } from '@/types'

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const config = SEVERITY_CONFIG[severity]
  const Icon = config.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold tracking-wide',
        config.text,
        config.bg,
        config.border,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {config.label}
    </span>
  )
}

const CAMERA_STATUS_STYLE: Record<CameraStatus, { label: string; dot: string; text: string }> = {
  ONLINE: { label: 'LIVE', dot: 'bg-live', text: 'text-live' },
  STARTING: { label: 'STARTING', dot: 'bg-medium', text: 'text-medium-ink' },
  DEGRADED: { label: 'DEGRADED', dot: 'bg-medium', text: 'text-medium-ink' },
  ERROR: { label: 'ERROR', dot: 'bg-critical', text: 'text-critical-ink' },
  OFFLINE: { label: 'OFFLINE', dot: 'bg-offline', text: 'text-ink-dim' },
  STOPPED: { label: 'STOPPED', dot: 'bg-offline', text: 'text-ink-dim' },
  UNKNOWN: { label: 'UNKNOWN', dot: 'bg-offline', text: 'text-ink-dim' },
}

export function CameraStatusBadge({ status, className }: { status: CameraStatus; className?: string }) {
  const config = CAMERA_STATUS_STYLE[status]
  const isOffline = status === 'OFFLINE' || status === 'ERROR' || status === 'STOPPED'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide', config.text, className)}>
      {isOffline ? <WifiOff className="size-3.5" aria-hidden /> : <StatusDot className={config.dot} pulse={status === 'ONLINE'} />}
      {config.label}
    </span>
  )
}

export function StatusDot({ className, pulse = false }: { className?: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2">
      {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', className)} />}
      <span className={cn('relative inline-flex size-2 rounded-full', className)} />
    </span>
  )
}

export function DataSourceBadge({ source, className }: { source: DataSource; className?: string }) {
  const config = DATA_SOURCE_CONFIG[source]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase',
        config.className,
        className,
      )}
    >
      <Radio className="size-3" aria-hidden />
      {config.label}
    </span>
  )
}
