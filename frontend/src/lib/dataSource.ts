import type { DataSource } from '@/types/dataSource'

/** Every non-trivial data point on screen carries one of these tags so the
 * UI never implies a backend capability that doesn't exist (spec §1, §39). */
export const DATA_SOURCE_CONFIG: Record<DataSource, { label: string; className: string }> = {
  live: { label: 'CONNECTED', className: 'text-live border-live/30 bg-live/10' },
  demo: { label: 'DEMO DATA', className: 'text-medium-ink border-medium/30 bg-medium/10' },
  planned: { label: 'PLANNED', className: 'text-ink-muted border-border-strong bg-panel-raised' },
  not_connected: { label: 'NOT CONNECTED', className: 'text-ink-dim border-border-strong bg-panel-inset' },
}
