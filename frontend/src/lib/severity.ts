import { AlertOctagon, AlertTriangle, Info, ShieldAlert, type LucideIcon } from 'lucide-react'

import type { Severity } from '@/types/domain'

export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

interface SeverityStyle {
  label: string
  text: string
  bg: string
  border: string
  dot: string
  icon: LucideIcon
}

/** The single place severity styling is defined (spec §11) - every
 * severity-aware component (badges, cards, borders, chart colors) reads
 * from here instead of hard-coding a color per usage. */
export const SEVERITY_CONFIG: Record<Severity, SeverityStyle> = {
  CRITICAL: {
    label: 'CRITICAL',
    text: 'text-critical-ink',
    bg: 'bg-critical/10',
    border: 'border-critical/50',
    dot: 'bg-critical',
    icon: AlertOctagon,
  },
  HIGH: {
    label: 'HIGH',
    text: 'text-high-ink',
    bg: 'bg-high/10',
    border: 'border-high/40',
    dot: 'bg-high',
    icon: ShieldAlert,
  },
  MEDIUM: {
    label: 'MEDIUM',
    text: 'text-medium-ink',
    bg: 'bg-medium/10',
    border: 'border-medium/40',
    dot: 'bg-medium',
    icon: AlertTriangle,
  },
  LOW: {
    label: 'LOW',
    text: 'text-low-ink',
    bg: 'bg-low/10',
    border: 'border-low/30',
    dot: 'bg-low',
    icon: Info,
  },
}

/**
 * The backend (risk.py `_severity()`) only ever computes LOW/MEDIUM/HIGH.
 * CRITICAL is a client-side refinement of that same real 0-100 score, added
 * purely for the operator-triage 4-tier system the UI spec calls for - it
 * does not change what the backend considers alert-worthy.
 */
export function severityFromScore(score: number): Severity {
  if (score >= 90) return 'CRITICAL'
  if (score >= 70) return 'HIGH'
  if (score >= 30) return 'MEDIUM'
  return 'LOW'
}
