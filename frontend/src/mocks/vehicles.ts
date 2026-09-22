import { minutesAgo } from '@/mocks/time'
import type { Vehicle } from '@/types/extended'

/** The backend has no anpr.py / plate-reading module - this dataset only
 * exists to show what the Vehicle Intelligence screen will look like once
 * ANPR is connected. The page itself must lead with a NOT CONNECTED banner. */
export const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'V-08',
    plate: 'WB 32 AB 4821',
    vehicleClass: 'SUV',
    confidence: 0.93,
    firstSeen: minutesAgo(15),
    lastSeen: minutesAgo(0.1),
    watchlistMatch: true,
    sightings: [
      { timestamp: minutesAgo(15), cameraId: 'cam1', cameraName: 'Main Gate' },
      { timestamp: minutesAgo(11), cameraId: 'cam2', cameraName: 'North Fence' },
      { timestamp: minutesAgo(6), cameraId: 'cam4', cameraName: 'Check Post' },
    ],
  },
  {
    id: 'V-05',
    plate: 'DL 4C XQ 1190',
    vehicleClass: 'Truck',
    confidence: 0.9,
    firstSeen: minutesAgo(6),
    lastSeen: minutesAgo(0.1),
    watchlistMatch: false,
    sightings: [{ timestamp: minutesAgo(6), cameraId: 'cam3', cameraName: 'Patrol Road' }],
  },
]
