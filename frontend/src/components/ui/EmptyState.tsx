import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon className="size-8 text-ink-dim" aria-hidden />
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {detail && <p className="max-w-xs text-xs text-ink-dim">{detail}</p>}
    </div>
  )
}
