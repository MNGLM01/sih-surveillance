import type { AnalyticsSummary } from '@/types/extended'

/** "Objects detected" has no persisted counterpart in the backend (only
 * score-crossing events are written to SQLite - see docs/PRD.md §10) so the
 * detections total here is always a demo estimate, even when the rest of
 * this page is computed from real incidents. The funnel shape
 * (detections -> events -> incidents) is the point being illustrated, not
 * the exact top-line number - see the `AnalyticsSummary.source` tag. */
export const MOCK_ANALYTICS: AnalyticsSummary = {
  detectionsToday: 1284,
  eventsToday: 47,
  highRiskIncidentsToday: 7,
  verifiedIncidentsToday: 3,
  incidentsByHour: [0, 4, 8, 12, 16, 20].map((hour) => ({
    hour,
    count: [1, 0, 2, 3, 5, 6][Math.floor(hour / 4)] ?? 0,
  })),
  incidentsByType: [
    { type: 'Zone intrusion', count: 21 },
    { type: 'Loitering', count: 13 },
    { type: 'Vehicle', count: 8 },
    { type: 'Suspicious movement', count: 4 },
    { type: 'Other', count: 1 },
  ],
  cameraActivity: [
    { cameraId: 'cam1', cameraName: 'Main Gate', count: 8 },
    { cameraId: 'cam2', cameraName: 'North Fence', count: 14 },
    { cameraId: 'cam3', cameraName: 'Patrol Road', count: 17 },
    { cameraId: 'cam4', cameraName: 'Check Post', count: 8 },
  ],
  riskDistribution: { LOW: 22, MEDIUM: 12, HIGH: 10, CRITICAL: 3 },
  source: 'demo',
}
