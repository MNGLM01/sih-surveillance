import type { SelectHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-8 rounded border border-border-strong bg-panel-raised px-2 text-xs text-ink focus:border-low focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}
