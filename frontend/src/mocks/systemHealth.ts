import { MOCK_CAMERAS } from '@/mocks/cameras'
import type { SystemHealth } from '@/types/extended'

/** GPU/CPU/RAM/storage/network gauges are not exposed by the backend today
 * (no telemetry endpoint) - demo only. Per-camera status/fps/latency reuse
 * the same camera list the rest of the app uses, so this page never
 * contradicts the Command Center. */
export const MOCK_SYSTEM_HEALTH: SystemHealth = {
  gpuPct: 0,
  cpuPct: 41,
  ramPct: 58,
  storagePct: 72,
  networkMbps: 94,
  cameras: MOCK_CAMERAS.map((cam) => ({
    cameraId: cam.id,
    cameraName: cam.name,
    status: cam.status,
    fps: cam.fps,
    latencyMs: cam.latencyMs,
    uptimePct: 99.2,
    reconnectCount: cam.id === 'cam3' ? 2 : 0,
    lastFrameAt: new Date().toISOString(),
  })),
}
