import { severityFromScore } from '@/lib/severity'
import { minutesAgo } from '@/mocks/time'
import type { Incident } from '@/types/domain'

function incident(partial: Omit<Incident, 'severity'>): Incident {
  return { ...partial, severity: severityFromScore(partial.riskScore) }
}

/** INC-421 is the spec's own worked example (§8, §9, §12, §16, §18, §41):
 * Person #27 at the Check Post perimeter, zone intrusion + loitering +
 * after-hours + border-directed movement = 82, HIGH. */
export const MOCK_INCIDENTS: Incident[] = [
  incident({
    id: '421',
    cameraId: 'cam4',
    cameraName: 'Check Post',
    trackId: 'cam4:P-27',
    objectClass: 'person',
    riskScore: 82,
    status: 'INVESTIGATING',
    createdAt: minutesAgo(37),
    updatedAt: minutesAgo(2),
    reasons: [
      'Zone intrusion (Check Post Perimeter Zone): +40',
      'Loitering 3min: +25',
      'After-hours (22:00-06:00): +15',
      'Moving toward restricted zone: +2',
    ],
    evidencePath: 'evidence_clips/421.mp4',
  }),
  incident({
    id: '418',
    cameraId: 'cam3',
    cameraName: 'Patrol Road',
    trackId: 'cam3:V-05',
    objectClass: 'truck',
    riskScore: 90,
    status: 'NEW',
    createdAt: minutesAgo(6),
    updatedAt: minutesAgo(1),
    reasons: [
      'Zone intrusion (Patrol Road Buffer): +40',
      'Vehicle in restricted zone: +10',
      'After-hours (22:00-06:00): +15',
      'Vehicle stationary 45s: +10',
      'Repeated zone visits (3): +15',
    ],
    evidencePath: 'evidence_clips/418.mp4',
  }),
  incident({
    id: '405',
    cameraId: 'cam2',
    cameraName: 'North Fence',
    trackId: 'cam2:P-31',
    objectClass: 'person',
    riskScore: 35,
    status: 'ACKNOWLEDGED',
    createdAt: minutesAgo(54),
    updatedAt: minutesAgo(40),
    reasons: ['Lingering 75s: +10', 'After-hours (22:00-06:00): +15', 'Moving toward restricted zone: +2'],
    evidencePath: null,
  }),
  incident({
    id: '399',
    cameraId: 'cam1',
    cameraName: 'Main Gate',
    trackId: 'cam1:P-19',
    objectClass: 'person',
    riskScore: 22,
    status: 'RESOLVED',
    createdAt: minutesAgo(140),
    updatedAt: minutesAgo(120),
    reasons: ['Lingering 65s: +10', 'Erratic/high-speed movement: +10'],
    evidencePath: 'evidence_clips/399.mp4',
  }),
  incident({
    id: '388',
    cameraId: 'cam4',
    cameraName: 'Check Post',
    trackId: 'cam4:V-08',
    objectClass: 'car',
    riskScore: 60,
    status: 'VERIFIED',
    createdAt: minutesAgo(210),
    updatedAt: minutesAgo(190),
    reasons: [
      'Zone intrusion (Check Post Perimeter Zone): +40',
      'Vehicle in restricted zone: +10',
      'After-hours (22:00-06:00): +15',
    ],
    evidencePath: 'evidence_clips/388.mp4',
  }),
  incident({
    id: '376',
    cameraId: 'cam2',
    cameraName: 'North Fence',
    trackId: 'cam2:P-9',
    objectClass: 'person',
    riskScore: 40,
    status: 'FALSE_POSITIVE',
    createdAt: minutesAgo(320),
    updatedAt: minutesAgo(300),
    reasons: ['Zone intrusion (North Fence Restricted Zone): +40'],
    evidencePath: 'evidence_clips/376.mp4',
  }),
  incident({
    id: '362',
    cameraId: 'cam3',
    cameraName: 'Patrol Road',
    trackId: 'cam3:P-14',
    objectClass: 'person',
    riskScore: 57,
    status: 'RESOLVED',
    createdAt: minutesAgo(480),
    updatedAt: minutesAgo(455),
    reasons: [
      'Zone intrusion (Patrol Road Buffer): +40',
      'After-hours (22:00-06:00): +15',
      'Moving toward restricted zone: +2',
    ],
    evidencePath: 'evidence_clips/362.mp4',
  }),
]
