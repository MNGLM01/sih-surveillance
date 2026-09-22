import { getCameraStatus } from '@/api/cameras'
import { MOCK_SYSTEM_HEALTH } from '@/mocks/systemHealth'
import type { Camera } from '@/types/domain'
import type { CameraHealth, SystemHealth } from '@/types/extended'

/** GPU/CPU/RAM/storage/network gauges have no backend counterpart (no
 * telemetry endpoint) and stay demo. Per-camera status is real when the
 * backend is reachable - `/cameras/{id}/status` genuinely exists - so this
 * mixes a live per-camera status pass over demo system-wide numbers rather
 * than declaring the whole page one way or the other. */
export async function getSystemHealth(cameras: Camera[]): Promise<{ data: SystemHealth; source: 'live' | 'demo' }> {
  const results = await Promise.all(cameras.map((cam) => getCameraStatus(cam.id)))
  const anyLive = results.some((r) => r.source === 'live')

  const cameraHealth: CameraHealth[] = cameras.map((cam, i) => {
    const statusResult = results[i]
    const demo = MOCK_SYSTEM_HEALTH.cameras.find((c) => c.cameraId === cam.id)
    return {
      cameraId: cam.id,
      cameraName: cam.name,
      status: statusResult.data.status,
      fps: cam.fps,
      latencyMs: cam.latencyMs,
      uptimePct: demo?.uptimePct,
      reconnectCount: demo?.reconnectCount,
      lastFrameAt: demo?.lastFrameAt,
    }
  })

  return {
    data: { ...MOCK_SYSTEM_HEALTH, cameras: cameraHealth },
    source: anyLive ? 'live' : 'demo',
  }
}
