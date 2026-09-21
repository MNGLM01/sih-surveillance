import type { AIInsight } from '@/types/extended'

/** Insights that reference a signal the backend genuinely has no way to
 * produce (visibility/weather, multi-day trend modeling) - these stay
 * demo-only. Insights derivable from real incident data (e.g. "camera X
 * generated N% of today's high-risk incidents") are computed live in
 * `api/insights.ts` instead of hard-coded here. */
export const MOCK_INSIGHTS: AIInsight[] = [
  {
    id: 'insight-visibility',
    tone: 'warning',
    text: 'CAM-03 detection confidence trending lower - possible low-visibility conditions.',
    source: 'demo',
  },
  {
    id: 'insight-window',
    tone: 'warning',
    text: 'Increased after-hours activity near North Fence between 22:00-00:00 over the last 3 nights.',
    source: 'demo',
  },
]
