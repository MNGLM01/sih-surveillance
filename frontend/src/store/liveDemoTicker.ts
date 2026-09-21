import type { LiveMessage } from '@/api/liveEvents'

/** Demo-mode stand-in for the real `/ws/live` stream, feeding the exact same
 * message shape so the store's merge logic never needs a separate demo code
 * path. Only runs when a real WebSocket connection couldn't be established. */
const DEMO_SCENARIOS: Array<{ camera_id: string; track_id: string; object_class: string; reasons: string[]; score: number }> = [
  {
    camera_id: 'cam1',
    track_id: 'cam1:P-52',
    object_class: 'person',
    reasons: ['Lingering 65s: +10'],
    score: 10,
  },
  {
    camera_id: 'cam2',
    track_id: 'cam2:P-33',
    object_class: 'person',
    reasons: ['Zone intrusion (North Fence Restricted Zone): +40', 'After-hours (22:00-06:00): +15'],
    score: 55,
  },
  {
    camera_id: 'cam3',
    track_id: 'cam3:V-11',
    object_class: 'car',
    reasons: ['Zone intrusion (Patrol Road Buffer): +40', 'Vehicle in restricted zone: +10'],
    score: 50,
  },
]

export function startDemoTicker(onMessage: (msg: LiveMessage) => void, intervalMs = 25_000): () => void {
  let nextId = 500

  const tick = () => {
    const scenario = DEMO_SCENARIOS[Math.floor(Math.random() * DEMO_SCENARIOS.length)]
    nextId += 1
    onMessage({
      type: 'incident_created',
      data: {
        incident_id: nextId,
        camera_id: scenario.camera_id,
        track_id: scenario.track_id,
        object_class: scenario.object_class,
        severity: scenario.score > 50 ? 'HIGH' : scenario.score >= 30 ? 'MEDIUM' : 'LOW',
        risk_score: scenario.score,
        status: 'NEW',
        reasons: scenario.reasons,
      },
    })
  }

  const interval = setInterval(tick, intervalMs)
  return () => clearInterval(interval)
}
