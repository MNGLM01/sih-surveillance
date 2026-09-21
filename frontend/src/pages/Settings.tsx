import { KeyRound, ShieldOff, User } from 'lucide-react'
import { useState } from 'react'

import { Button, Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { useSurveillance } from '@/store/SurveillanceProvider'

export default function SettingsPage() {
  const { operatorName, setOperatorName, incidentsSource } = useSurveillance()
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
