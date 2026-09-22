import { Lock } from 'lucide-react'

import { CameraStatusBadge } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useSurveillance } from '@/store/SurveillanceProvider'
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
  const { isCameraRestricted, incidents } = useSurveillance()

  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[11px] font-semibold tracking-widest text-ink-dim uppercase">Cameras</p>
      {cameras.map((cam) => {
        const openIncidents = incidents.filter(
          (i) => i.cameraId === cam.id && ['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'].includes(i.status),
        )
        const isDanger = openIncidents.some((i) => i.severity === 'HIGH' || i.severity === 'CRITICAL')
        const hasIncident = cam.incidentCount > 0
        const isRestricted = isCameraRestricted(cam.id)

        return (
          <button
            key={cam.id}
            type="button"
            onClick={() => onSelect(cam.id)}
            className={cn(
              'w-full rounded border px-3 py-2.5 text-left transition-colors',
              isDanger
                ? 'camera-danger-card border-red-500 bg-red-950/40 text-white'
                : selectedCameraId === cam.id
                  ? 'border-low/50 bg-low/10'
                  : isRestricted
                    ? 'border-critical/40 bg-critical/5 hover:border-critical/60'
                    : hasIncident
                      ? 'border-critical/30 bg-critical/5 hover:border-critical/50'
                      : 'border-border bg-panel hover:border-border-strong hover:bg-panel-raised',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {isRestricted && <Lock className="size-3 shrink-0 text-critical-ink" />}
                <span className="truncate text-sm font-semibold text-ink">{cam.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {isDanger && (
                  <span className="danger-badge-flash shrink-0 rounded bg-red-600 px-1.5 py-0.2 font-mono text-[9px] font-bold text-white shadow">
                    DANGER
                  </span>
                )}
                {isRestricted && !isDanger && (
                  <span className="shrink-0 rounded bg-critical/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-critical-ink">
                    ZONE
                  </span>
                )}
                {hasIncident && !isDanger && (
                  <span className="shrink-0 rounded bg-critical/15 px-1.5 py-0.5 text-[10px] font-bold text-critical-ink">
                    {cam.incidentCount} INCIDENT{cam.incidentCount > 1 ? 'S' : ''}
                  </span>
                )}
              </div>
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
