import { CameraStatusBadge } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { Camera } from '@/types/domain'

export function CameraRail({
  cameras,
  selectedCameraId,
  onSelect,
}: {
  cameras: Camera[]
  selectedCameraId: string | null
  onSelect: (cameraId: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[11px] font-semibold tracking-widest text-ink-dim uppercase">Cameras</p>
      {cameras.map((cam) => {
        const hasIncident = cam.incidentCount > 0
        return (
          <button
            key={cam.id}
            type="button"
            onClick={() => onSelect(cam.id)}
            className={cn(
              'w-full rounded border px-3 py-2.5 text-left transition-colors',
              selectedCameraId === cam.id
                ? 'border-low/50 bg-low/10'
                : hasIncident
                  ? 'border-critical/30 bg-critical/5 hover:border-critical/50'
                  : 'border-border bg-panel hover:border-border-strong hover:bg-panel-raised',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-ink">{cam.name}</span>
              {hasIncident && (
                <span className="shrink-0 rounded bg-critical/15 px-1.5 py-0.5 text-[10px] font-bold text-critical-ink">
                  {cam.incidentCount} INCIDENT{cam.incidentCount > 1 ? 'S' : ''}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <CameraStatusBadge status={cam.status} />
              {cam.fps !== undefined && <span className="font-mono text-[11px] text-ink-dim">{cam.fps} FPS</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
