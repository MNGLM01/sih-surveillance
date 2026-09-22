import { KeyRound, Lock, ShieldOff, User } from 'lucide-react'
import { useState } from 'react'

import { OperatorManualDropdown } from '@/components/dashboard/OperatorManualDropdown'
import { Button, Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useSurveillance } from '@/store/SurveillanceProvider'
import { OPERATOR_MANUAL_OPTIONS } from '@/types/operatorControls'

export default function SettingsPage() {
  const {
    operatorName,
    setOperatorName,
    incidentsSource,
    operatorOptions,
    restrictedCameraIds,
    toggleRestrictedCamera,
    cameras,
  } = useSurveillance()
  const [draft, setDraft] = useState(operatorName)

  return (
    <div className="space-y-3 p-3">
      <Card>
        <CardHeader title="Operator Identity" subtitle="Local to this browser session only" />
        <CardContent className="flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">
              <User className="size-3" /> Operator name
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 w-full max-w-xs rounded border border-border-strong bg-panel-raised px-2 text-sm text-ink focus:border-low focus:outline-none"
            />
          </label>
          <Button variant="primary" size="sm" onClick={() => setOperatorName(draft.trim() || 'Operator A')}>
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Operator Manual Surveillance Controls"
          subtitle="Manual multi-select modules & perimeter camera restrictions"
          action={<OperatorManualDropdown align="right" compact />}
        />
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {OPERATOR_MANUAL_OPTIONS.map((opt) => {
              const active = operatorOptions[opt.key]
              return (
                <div
                  key={opt.key}
                  className={cn(
                    'flex items-start justify-between rounded border p-2.5 transition-colors',
                    active ? 'border-border-strong bg-panel-raised' : 'border-border bg-panel opacity-60',
                  )}
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-xs font-semibold text-ink">{opt.label}</p>
                    <p className="mt-0.5 text-[10px] text-ink-muted">{opt.description}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.2 font-mono text-[9px] font-bold',
                      active
                        ? 'border border-live/30 bg-live/15 text-live'
                        : 'border border-border bg-panel-inset text-ink-dim',
                    )}
                  >
                    {active ? 'ACTIVE' : 'OFF'}
                  </span>
                </div>
              )
            })}
          </div>

          {operatorOptions.selectiveCameraRestricted && (
            <div className="rounded border border-critical/30 bg-critical/5 p-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-bold text-critical-ink">
                  <Lock className="size-3.5" />
                  <span>Designated Restricted Security Cameras:</span>
                </p>
                <span className="font-mono text-[11px] text-ink-dim">
                  {restrictedCameraIds.length} of {cameras.length} restricted
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {cameras.map((cam) => {
                  const isRestricted = restrictedCameraIds.includes(cam.id)
                  return (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => toggleRestrictedCamera(cam.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition-colors',
                        isRestricted
                          ? 'border-critical/60 bg-critical/20 text-critical-ink'
                          : 'border-border bg-panel-raised text-ink-dim hover:border-border-strong hover:text-ink',
                      )}
                    >
                      <Lock className="size-3" />
                      <span>{cam.name || cam.id}</span>
                      <span className="font-mono text-[9px] opacity-80">
                        {isRestricted ? 'RESTRICTED' : 'STANDARD'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Risk & Alerting" subtitle="Configured server-side in backend/config.py - read-only here" action={<DataSourceBadge source={incidentsSource === 'live' ? 'live' : 'demo'} />} />
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SettingField label="HIGH threshold" value="Score > 50" />
          <SettingField label="MEDIUM threshold" value="Score >= 30" />
          <SettingField label="Loitering (medium)" value="> 60s" />
          <SettingField label="Loitering (high)" value="> 180s" />
          <SettingField label="After-hours window" value="22:00 - 06:00" />
          <SettingField label="Incident cooldown" value="30s" />
          <SettingField label="Evidence pre-buffer" value="5s" />
          <SettingField label="Evidence post-buffer" value="10s" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Security & Access" />
        <CardContent className="flex items-start gap-3">
          <ShieldOff className="mt-0.5 size-5 shrink-0 text-ink-dim" aria-hidden />
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              Authentication & role-based access
              <DataSourceBadge source="not_connected" />
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              The backend has no login or operator-identity system - the "Operator name" above is a local label only, not an
              authenticated account, and any visitor can act as any operator. The UI is structured (a single `operatorName` on every
              audit entry, a clean API boundary) so real auth can be added later without a rework, but it is not implemented today.
            </p>
          </div>
        </CardContent>
        <CardContent className="flex items-start gap-3 border-t border-border pt-4">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-ink-dim" aria-hidden />
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              Evidence access control
              <DataSourceBadge source="not_connected" />
            </p>
            <p className="mt-1 text-xs text-ink-muted">Evidence clips are served over the same unauthenticated API as everything else today.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-ink">{value}</p>
    </div>
  )
}
