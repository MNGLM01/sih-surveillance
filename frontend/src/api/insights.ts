import { MOCK_INSIGHTS } from '@/mocks/insights'
import type { Incident } from '@/types/domain'
import type { AIInsight } from '@/types/extended'

/** Insights that are honest arithmetic over the real incident list (e.g.
 * "which camera generated the most high-risk incidents") are computed here,
 * live, whenever real incidents exist. Insights that would need a signal the
 * backend doesn't produce (visibility, multi-day trends) stay in
 * mocks/insights.ts, always tagged 'demo'. */
export function getInsights(incidents: Incident[], incidentsSource: 'live' | 'demo'): AIInsight[] {
  const derived: AIInsight[] = []

  if (incidentsSource === 'live' && incidents.length > 0) {
    const highRisk = incidents.filter((i) => i.severity === 'HIGH' || i.severity === 'CRITICAL')
    if (highRisk.length > 0) {
      const counts = new Map<string, { name: string; count: number }>()
      for (const inc of highRisk) {
        const entry = counts.get(inc.cameraId) ?? { name: inc.cameraName, count: 0 }
        entry.count += 1
        counts.set(inc.cameraId, entry)
      }
      const top = [...counts.values()].sort((a, b) => b.count - a.count)[0]
      const pct = Math.round((top.count / highRisk.length) * 100)
      derived.push({
        id: 'insight-top-camera',
        tone: 'warning',
        text: `${top.name} generated ${pct}% of today's high-risk incidents.`,
        source: 'live',
      })
    } else {
      derived.push({
        id: 'insight-quiet',
        tone: 'positive',
        text: 'No high-risk incidents recorded yet today.',
        source: 'live',
      })
    }
  }

  return [...derived, ...MOCK_INSIGHTS]
}
