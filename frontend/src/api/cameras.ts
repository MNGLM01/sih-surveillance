import { fetchJson, withDemoFallback } from '@/api/client'
import { MOCK_CAMERAS } from '@/mocks/cameras'
import type { Camera, CameraStatus, Zone } from '@/types/domain'

/** Shapes returned by the real backend (backend/main.py GET /cameras,
 * GET /cameras/{id}/status - see backend/db.py `list_cameras`,
 * backend/schemas.py `Zone`). Kept separate from the UI `Camera` type so a
 * backend field rename doesn't ripple through every component. */
interface BackendZone {
  name: string
  rect_norm: [number, number, number, number]
}

interface BackendCamera {
  id: string
  name: string
  source: string
  lat: number
  lon: number
  zones: BackendZone[]
  status?: CameraStatus
}

function mapZone(zone: BackendZone): Zone {
  return { name: zone.name, rectNorm: zone.rect_norm }
}

function mapCamera(raw: BackendCamera): Camera {
  return {
    id: raw.id,
    name: raw.name,
    location: raw.name,
    status: raw.status ?? 'UNKNOWN',
    lat: raw.lat,
    lon: raw.lon,
    zones: raw.zones.map(mapZone),
    incidentCount: 0, // overlaid by the store from the live/demo incident list
    // fps / latencyMs intentionally left undefined: the real API doesn't report them.
  }
}

export async function getCameras() {
  return withDemoFallback(() => fetchJson<BackendCamera[]>('/cameras').then((raw) => raw.map(mapCamera)), MOCK_CAMERAS)
}

export async function getCameraStatus(cameraId: string) {
  return withDemoFallback(
    () => fetchJson<{ camera_id: string; status: CameraStatus; error: string | null }>(`/cameras/${cameraId}/status`),
    { camera_id: cameraId, status: 'UNKNOWN' as CameraStatus, error: null },
  )
}

export async function restartCamera(cameraId: string): Promise<boolean> {
  try {
    await fetchJson(`/cameras/${cameraId}/restart`, { method: 'POST' })
    return true
  } catch {
    return false
  }
}

export async function updateCameraZones(cameraId: string, zones: Zone[]): Promise<boolean> {
  try {
    const payload: BackendZone[] = zones.map((z) => ({
      name: z.name,
      rect_norm: z.rectNorm,
    }))
    await fetchJson(`/cameras/${cameraId}/zones`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return true
  } catch (err) {
    console.warn('[cameras] Failed to persist zones to backend:', err)
    return false
  }
}

export async function setCameraRestricted(cameraId: string, isRestricted: boolean): Promise<boolean> {
  try {
    await fetchJson(`/cameras/${cameraId}/restricted`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_restricted: isRestricted }),
    })
    return true
  } catch (err) {
    console.warn('[cameras] Failed to set camera restricted on backend:', err)
    return false
  }
}

