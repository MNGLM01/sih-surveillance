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
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { OperatorManualDropdown } from '@/components/dashboard/OperatorManualDropdown'
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
  const { operatorName, selectedOptionCount, alarm } = useSurveillance()

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate">
              <Activity className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">Operator: {operatorName}</span>
            </div>
            <span className="shrink-0 rounded border border-border bg-panel-raised px-1.5 py-0.5 font-mono text-[9px] font-bold text-low">
              {selectedOptionCount}/5
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-panel px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Shield className="size-4 text-low" aria-hidden />
            <h1 className="text-sm font-bold tracking-wide">BORDER AI COMMAND CENTER</h1>
          </div>
          <div className="flex items-center gap-3">
            <OperatorManualDropdown align="right" />
            <SystemStatusPill />
            <span className="hidden font-mono text-xs text-ink-muted sm:inline-block">
              {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ·{' '}
              {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </header>

        {/* Global Red Alert Danger & Siren Banner */}
        {alarm.highRiskCount > 0 && (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 border-b px-5 py-2 transition-all',
              alarm.isAlarmActive
                ? 'border-red-500 bg-red-950/85 text-white shadow-[0_0_20px_rgba(225,29,72,0.4)] animate-pulse'
                : 'border-red-900/60 bg-red-950/40 text-red-300',
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex items-center justify-center rounded-full p-1.5',
                  alarm.isAlarmActive ? 'bg-red-600 text-white animate-bounce shadow-lg shadow-red-600/50' : 'bg-red-900/40 text-red-400',
                )}
              >
                <Volume2 className="size-3.5" />
              </span>
              <div>
                <p className="flex items-center gap-1.5 text-xs font-black tracking-wide text-white uppercase">
                  <span className="inline-block size-2 rounded-full bg-red-500 animate-ping" />
                  🚨 RED ALERT DANGER: {alarm.highRiskCount} CRITICAL INCIDENT{alarm.highRiskCount > 1 ? 'S' : ''} DETECTED
                </p>
                <p className="text-[11px] text-red-200">
                  {alarm.isAlarmActive
                    ? 'Loud siren alarm sounding (Virtual fence breach or restricted camera perimeter intrusion).'
                    : 'Alarm audio muted by operator.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={alarm.toggleMute}
                className={cn(
                  'flex items-center gap-1.5 rounded border px-3 py-1 text-xs font-bold transition-all shadow',
                  alarm.isMuted
                    ? 'border-red-500/50 bg-panel-raised text-red-200 hover:bg-panel'
                    : 'border-red-500 bg-red-600 text-white hover:bg-red-500 shadow-[0_0_10px_rgba(225,29,72,0.6)]',
                )}
              >
                {alarm.isMuted ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                <span>{alarm.isMuted ? 'Unmute Siren' : 'Mute Loud Beep'}</span>
              </button>
            </div>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

