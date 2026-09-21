import { LiveFeed } from '@/components/camera/LiveFeed'
import { CameraStatusBadge } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { Camera } from '@/types/domain'

/** Bounding boxes / track labels are already burned into the live JPEG by
 * the backend's own annotator (camera_worker.py `_annotate`) - this tile
 * only overlays what the frontend genuinely knows independent of the pixels:
 * camera identity, status, and whether it currently has an open incident. */
export function CameraTile({
  camera,
  selected,
  onSelect,
}: {
  camera: Camera
  selected: boolean
  onSelect: () => void
}) {
  const hasIncident = camera.incidentCount > 0

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative aspect-video overflow-hidden rounded border text-left',
        selected ? 'border-low' : hasIncident ? 'border-critical/60' : 'border-border hover:border-border-strong',
      )}
    >
      <LiveFeed cameraId={camera.id} className="opacity-90 transition-opacity group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent p-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-white">{camera.id.toUpperCase()} · {camera.name.toUpperCase()}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <CameraStatusBadge status={camera.status} />
            {camera.fps !== undefined && <span className="font-mono text-[10px] text-white/70">{camera.fps} FPS</span>}
            {camera.latencyMs !== undefined && <span className="font-mono text-[10px] text-white/70">{camera.latencyMs}ms</span>}
          </div>
        </div>
        {hasIncident && (
          <span className="shrink-0 rounded bg-critical px-1.5 py-0.5 text-[10px] font-bold text-white">INCIDENT</span>
        )}
      </div>
    </button>
  )
}
