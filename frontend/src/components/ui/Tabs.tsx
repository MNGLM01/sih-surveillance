import { cn } from '@/lib/cn'

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; count?: number }[]
  active: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold tracking-wide whitespace-nowrap',
            active === tab.value
              ? 'border-low text-ink'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="rounded-full bg-panel-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-dim">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
