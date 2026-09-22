import { AlertTriangle, Lock } from 'lucide-react'

import { LiveFeed } from '@/components/camera/LiveFeed'
import { CameraStatusBadge } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useSurveillance } from '@/store/SurveillanceProvider'
import type { Camera } from '@/types/domain'

const OPEN_INCIDENT_STATUSES = new Set(['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'])

/** Bounding boxes / track labels are already burned into the live JPEG by
 * the backend's own annotator (camera_worker.py `_annotate`) - this tile
 * only overlays what the frontend genuinely knows independent of the pixels:
 * camera identity, status, restricted zone designation, and open incidents. */
export function CameraTile({
  camera,
  selected,
  onSelect,
}: {
  camera: Camera
  selected: boolean
  onSelect: () => void
}) {
  const { isCameraRestricted, incidents } = useSurveillance()
  const isRestricted = isCameraRestricted(camera.id)

  const now = Date.now()
  const openIncidents = incidents.filter(
    (i) => i.cameraId === camera.id && OPEN_INCIDENT_STATUSES.has(i.status),
  )
  const hasCritical = openIncidents.some(
    (i) => i.severity === 'CRITICAL' && now - new Date(i.updatedAt).getTime() < 15000,
  )
  const hasHigh = openIncidents.some(
    (i) => i.severity === 'HIGH' && now - new Date(i.updatedAt).getTime() < 15000,
  )
  const isDanger = hasCritical || hasHigh
  const hasIncident = openIncidents.length > 0

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative aspect-video overflow-hidden rounded border text-left transition-all',
        isDanger
          ? 'camera-danger-card border-2 ring-2 ring-red-500/80 shadow-[0_0_25px_rgba(225,29,72,0.6)]'
          : selected
            ? 'border-low ring-1 ring-low/40'
            : isRestricted
              ? 'border-critical/60 ring-1 ring-critical/30'
              : hasIncident
                ? 'border-critical/60'
                : 'border-border hover:border-border-strong',
      )}
    >
      <LiveFeed cameraId={camera.id} className="opacity-90 transition-opacity group-hover:opacity-100" />

      {/* Red Danger Pulsing Overlay for High/Critical Alert Cameras */}
      {isDanger && (
        <div className="pointer-events-none absolute inset-0 bg-red-600/15 mix-blend-color-dodge transition-all animate-pulse" />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/85 via-black/50 to-transparent p-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {isRestricted && <Lock className="size-3 text-critical-ink" />}
            <p className="truncate text-xs font-bold text-white">{camera.id.toUpperCase()} · {camera.name.toUpperCase()}</p>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <CameraStatusBadge status={camera.status} />
            {camera.fps !== undefined && <span className="font-mono text-[10px] text-white/70">{camera.fps} FPS</span>}
            {camera.latencyMs !== undefined && <span className="font-mono text-[10px] text-white/70">{camera.latencyMs}ms</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isDanger && (
            <span className="danger-badge-flash shrink-0 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-white shadow-[0_0_12px_rgba(225,29,72,0.9)]">
              <AlertTriangle className="size-2.5" />
              {hasCritical ? 'CRITICAL' : 'HIGH RISK'}
            </span>
          )}
          {isRestricted && (
            <span className="shrink-0 flex items-center gap-1 rounded bg-critical/90 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
              <Lock className="size-2.5" />
              RESTRICTED
            </span>
          )}
          {hasIncident && !isDanger && (
            <span className="shrink-0 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white">INCIDENT</span>
          )}
        </div>
      </div>
    </button>
  )
}
