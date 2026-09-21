import { MOCK_VEHICLES } from '@/mocks/vehicles'
import type { Vehicle } from '@/types/extended'

/** No anpr.py / plate-reading module exists in the backend - this always
 * returns demo data, tagged 'not_connected' so the page leads with that
 * banner rather than a 'demo' badge that implies "the engine exists but
 * we're just previewing it". */
export async function getVehicles(): Promise<{ data: Vehicle[]; source: 'not_connected' }> {
  return { data: MOCK_VEHICLES, source: 'not_connected' }
}
