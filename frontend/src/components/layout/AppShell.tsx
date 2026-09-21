import {
  Activity,
  BarChart3,
  Car,
  ClipboardList,
  Fingerprint,
  HeartPulse,
  LayoutDashboard,
  Settings,
  Shield,
  ShieldAlert,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { StatusDot } from '@/components/ui'
import { useClock } from '@/hooks/useClock'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/routes'
import { useSurveillance } from '@/store/SurveillanceProvider'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const PRIMARY_NAV: NavItem[] = [
  { to: ROUTES.dashboard, label: 'Command Center', icon: LayoutDashboard },
  { to: ROUTES.cameraFeeds, label: 'Cameras', icon: Video },
  { to: ROUTES.incidentLog, label: 'Incidents', icon: ShieldAlert },
  { to: ROUTES.tracks, label: 'Track Intelligence', icon: Fingerprint },
  { to: ROUTES.vehicles, label: 'Vehicle Intelligence', icon: Car },
  { to: ROUTES.analytics, label: 'Analytics', icon: BarChart3 },
]

const SYSTEM_NAV: NavItem[] = [
  { to: ROUTES.cameraHealth, label: 'Camera Health', icon: HeartPulse },
  { to: ROUTES.audit, label: 'Audit Logs', icon: ClipboardList },
  { to: ROUTES.settings, label: 'Settings', icon: Settings },
]

function NavSection({ items }: { items: NavItem[] }) {
  return (
    <nav className="space-y-0.5">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-panel-raised text-ink' : 'text-ink-muted hover:bg-panel-raised hover:text-ink',
            )
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function SystemStatusPill() {
  const { incidentsSource, liveConnected } = useSurveillance()
  const isLive = incidentsSource === 'live'
  const connected = isLive ? liveConnected : true // the demo ticker is always "up"

  return (
    <div className="flex items-center gap-1.5 rounded border border-border-strong bg-panel-raised px-2.5 py-1 text-xs font-semibold tracking-wide">
      <StatusDot className={connected ? 'bg-live' : 'bg-medium'} pulse={connected} />
      <span className={connected ? 'text-live' : 'text-medium-ink'}>
        {isLive ? (connected ? 'SYSTEM ONLINE' : 'RECONNECTING') : 'DEMO MODE'}
      </span>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const now = useClock()
  const { operatorName } = useSurveillance()

  return (
    <div className="flex h-screen min-h-0 bg-bg text-ink">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <Shield className="size-5 text-low" aria-hidden />
          <span className="text-sm font-bold tracking-wide">BORDER AI</span>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
          <NavSection items={PRIMARY_NAV} />
          <div>
            <p className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">System</p>
            <NavSection items={SYSTEM_NAV} />
          </div>
        </div>
        <div className="border-t border-border px-4 py-3 text-xs text-ink-dim">
          <div className="flex items-center gap-1.5">
            <Activity className="size-3.5" aria-hidden />
            <span>Operator: {operatorName}</span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-panel px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Shield className="size-4 text-low" aria-hidden />
            <h1 className="text-sm font-bold tracking-wide">BORDER AI COMMAND CENTER</h1>
          </div>
          <div className="flex items-center gap-4">
            <SystemStatusPill />
            <span className="font-mono text-xs text-ink-muted">
              {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ·{' '}
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
