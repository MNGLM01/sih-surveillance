import { ArrowRight, Eye, ShieldAlert, ShieldCheck, Siren } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { getAnalytics } from '@/api/analytics'
import { Card, CardContent, CardHeader, DataSourceBadge, MetricCard } from '@/components/ui'
import { SEVERITY_CONFIG } from '@/lib/severity'
import { useSurveillance } from '@/store/SurveillanceProvider'
import type { AnalyticsSummary } from '@/types/extended'

function CameraActivityBars({ data }: { data: AnalyticsSummary['cameraActivity'] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.cameraId} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-ink-muted">{d.cameraName}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-panel-inset">
            <div className="h-full rounded-full bg-low" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="w-6 shrink-0 text-right font-mono text-ink-dim">{d.count}</span>
        </div>
      ))}
    </div>
  )
}

function RiskDistributionBar({ data }: { data: AnalyticsSummary['riskDistribution'] }) {
  const total = Math.max(1, data.LOW + data.MEDIUM + data.HIGH + data.CRITICAL)
  const order: (keyof AnalyticsSummary['riskDistribution'])[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full">
        {order.map((sev) => (
          <div
            key={sev}
            className={SEVERITY_CONFIG[sev].dot}
            style={{ width: `${(data[sev] / total) * 100}%` }}
            title={`${sev}: ${data[sev]}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {order.map((sev) => (
          <span key={sev} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${SEVERITY_CONFIG[sev].dot}`} />
            <span className="text-ink-muted">
              {sev} ({data[sev]})
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Analytics() {
  const { incidents, incidentsSource } = useSurveillance()
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)

  useEffect(() => {
    getAnalytics(incidents, incidentsSource === 'live' ? 'live' : 'demo').then(setAnalytics)
  }, [incidents, incidentsSource])

  if (!analytics) return null

  return (
    <div className="space-y-3 p-3">
      <Card>
        <CardHeader title="Detection Funnel" subtitle="Detection is not the same as escalation" action={<DataSourceBadge source={analytics.source} />} />
        <CardContent className="flex flex-wrap items-center justify-center gap-3 text-center">
          <FunnelStep
            icon={Eye}
            label={analytics.source === 'live' ? 'Objects detected (est.)' : 'Objects detected'}
            value={analytics.detectionsToday}
          />
          <ArrowRight className="size-4 text-ink-dim" />
          <FunnelStep icon={Siren} label="Events" value={analytics.eventsToday} />
          <ArrowRight className="size-4 text-ink-dim" />
          <FunnelStep icon={ShieldAlert} label="High-risk incidents" value={analytics.highRiskIncidentsToday} tone="high" />
          <ArrowRight className="size-4 text-ink-dim" />
          <FunnelStep icon={ShieldCheck} label="Verified" value={analytics.verifiedIncidentsToday} tone="live" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Incidents by Hour"
            subtitle="A fresh local session rarely spans enough hours for a real curve"
            action={<DataSourceBadge source="demo" />}
          />
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.incidentsByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`} stroke="var(--color-ink-dim)" fontSize={11} />
                <YAxis allowDecimals={false} stroke="var(--color-ink-dim)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-panel-raised)', border: '1px solid var(--color-border-strong)', fontSize: 12 }}
                  labelFormatter={(h) => `${String(h).padStart(2, '0')}:00`}
                />
                <Bar dataKey="count" fill="var(--color-low)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Incident Types" />
          <CardContent className="space-y-2">
            {analytics.incidentsByType.map((t) => (
              <div key={t.type} className="flex items-center justify-between text-xs">
                <span className="text-ink-muted">{t.type}</span>
                <span className="font-mono text-ink">{t.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Camera Activity" subtitle="Incidents generated per camera" />
          <CardContent>
            <CameraActivityBars data={analytics.cameraActivity} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Risk Distribution" />
          <CardContent>
            <RiskDistributionBar data={analytics.riskDistribution} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function FunnelStep({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Eye
  label: string
  value: number
  tone?: 'high' | 'live'
}) {
  return (
    <MetricCard label={label} value={value} icon={Icon} tone={tone ?? 'default'} className="w-40" />
  )
}
