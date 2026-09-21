import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md'

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-low text-white hover:bg-low/90',
  secondary: 'bg-panel-raised text-ink border border-border-strong hover:bg-border/60',
  outline: 'border border-border-strong text-ink-muted hover:text-ink hover:border-ink-dim bg-transparent',
  ghost: 'text-ink-muted hover:text-ink hover:bg-panel-raised',
  danger: 'bg-critical/15 text-critical-ink border border-critical/40 hover:bg-critical/25',
}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded font-semibold tracking-wide whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    />
  )
}
