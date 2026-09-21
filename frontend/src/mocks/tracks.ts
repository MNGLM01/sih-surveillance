import { minutesAgo } from '@/mocks/time'
import type { Track } from '@/types/domain'

/** Active tracks per camera. The backend does not persist a live track list
 * (tracks are transient in-memory state inside tracker.py) - only track_id /
 * camera_id / object_class / risk_score are ever recoverable from a real
 * incident. Everything else here (confidence, direction, speed, position
 * history) is demo-only; see `api/tracks.ts` for how a "live" call is
 * limited to that smaller real subset. */
export const MOCK_TRACKS: Track[] = [
  {
    trackId: 'cam4:P-27',
    cameraId: 'cam4',
    objectType: 'PERSON',
    className: 'person',
    confidence: 0.94,
    firstSeen: minutesAgo(41),
    lastSeen: minutesAgo(0.2),
    zone: 'Check Post Perimeter Zone',
    direction: 'Toward border',
    riskScore: 82,
    positions: [
      { timestamp: 0, x: 0.2, y: 0.3 },
      { timestamp: 30, x: 0.4, y: 0.5 },
      { timestamp: 60, x: 0.55, y: 0.62 },
    ],
  },
  {
    trackId: 'cam4:P-31',
    cameraId: 'cam4',
    objectType: 'PERSON',
    className: 'person',
    confidence: 0.88,
    firstSeen: minutesAgo(9),
    lastSeen: minutesAgo(0.1),
    zone: undefined,
    direction: 'Lateral',
    riskScore: 12,
  },
  {
    trackId: 'cam4:V-08',
    cameraId: 'cam4',
    objectType: 'VEHICLE',
    className: 'car',
    confidence: 0.91,
    firstSeen: minutesAgo(15),
    lastSeen: minutesAgo(0.1),
    zone: undefined,
    direction: 'Stationary',
    speed: 2,
    riskScore: 18,
  },
  {
    trackId: 'cam2:P-31',
    cameraId: 'cam2',
    objectType: 'PERSON',
    className: 'person',
    confidence: 0.82,
    firstSeen: minutesAgo(54),
    lastSeen: minutesAgo(1),
    zone: 'North Fence Restricted Zone',
    direction: 'Toward border',
    riskScore: 35,
  },
  {
    trackId: 'cam3:V-05',
    cameraId: 'cam3',
    objectType: 'VEHICLE',
    className: 'truck',
    confidence: 0.9,
    firstSeen: minutesAgo(6),
    lastSeen: minutesAgo(0.1),
    zone: 'Patrol Road Buffer',
    direction: 'Stationary',
    speed: 1,
    riskScore: 90,
  },
  {
    trackId: 'cam1:P-46',
    cameraId: 'cam1',
    objectType: 'PERSON',
    className: 'person',
    confidence: 0.79,
    firstSeen: minutesAgo(3),
    lastSeen: minutesAgo(0.1),
    zone: undefined,
    direction: 'Lateral',
    riskScore: 8,
  },
]

/** Explicitly labeled per spec §14: a tracker id is not a confirmed
 * identity, and this cross-camera timeline is demo/planned, not real Re-ID. */
export const MOCK_MOVEMENT_HISTORY: Record<string, { cameraId: string; cameraName: string; timestamp: string }[]> = {
  'cam4:P-27': [
    { cameraId: 'cam1', cameraName: 'Main Gate', timestamp: minutesAgo(41) },
    { cameraId: 'cam2', cameraName: 'North Fence', timestamp: minutesAgo(28) },
    { cameraId: 'cam4', cameraName: 'Check Post', timestamp: minutesAgo(12) },
  ],
}
