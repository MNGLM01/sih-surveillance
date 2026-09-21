import { Car, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { LiveFeed } from '@/components/camera/LiveFeed'
import { CameraStatusBadge, RiskBar } from '@/components/ui'
import { severityFromScore } from '@/lib/severity'
import { formatClock } from '@/lib/format'
import { ROUTES } from '@/routes'
import type { Camera, Incident, Track } from '@/types/domain'

export function SelectedCameraPanel({
  camera,
  tracks,
  latestIncident,
}: {
  camera: Camera
  tracks: Track[]
  latestIncident?: Incident
}) {
  const navigate = useNavigate()
  const personCount = tracks.filter((t) => t.objectType === 'PERSON').length
  const vehicleCount = tracks.filter((t) => t.objectType === 'VEHICLE').length
  const sortedTracks = [...tracks].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))

  return (
    <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ink">
              {camera.id.toUpperCase()} · {camera.name.toUpperCase()}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <CameraStatusBadge status={camera.status} />
              {camera.fps !== undefined && camera.latencyMs !== undefined && (
                <span className="font-mono text-[11px] text-ink-dim">
                  {camera.fps} FPS · {camera.latencyMs}ms
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="aspect-video overflow-hidden rounded border border-border">
          <LiveFeed cameraId={camera.id} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border bg-panel-raised px-3 py-2">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">
              <User className="size-3" /> Persons
            </p>
            <p className="mt-0.5 font-mono text-xl font-semibold text-ink">{personCount}</p>
          </div>
          <div className="rounded border border-border bg-panel-raised px-3 py-2">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">
              <Car className="size-3" /> Vehicles
            </p>
            <p className="mt-0.5 font-mono text-xl font-semibold text-ink">{vehicleCount}</p>
          </div>
        </div>

        {latestIncident && (
          <button
            type="button"
            onClick={() => navigate(ROUTES.incidentDetail(latestIncident.id))}
            className="rounded border border-border bg-panel-raised px-3 py-2 text-left hover:border-border-strong"
          >
            <p className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Latest incident</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm text-ink">INC-{latestIncident.id}</span>
              <span className="font-mono text-[11px] text-ink-dim">{formatClock(latestIncident.createdAt)}</span>
            </div>
          </button>
        )}

        <div className="min-h-0 flex-1">
          <p className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">
            Active tracks ({sortedTracks.length})
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {sortedTracks.length === 0 && <p className="text-xs text-ink-dim italic">No active tracks on this camera.</p>}
            {sortedTracks.map((track) => {
              const severity = severityFromScore(track.riskScore ?? 0)
              return (
                <button
                  key={track.trackId}
                  type="button"
                  onClick={() => navigate(`${ROUTES.tracks}?id=${encodeURIComponent(track.trackId)}`)}
                  className="flex w-full items-center justify-between gap-2 rounded border border-border px-2.5 py-1.5 text-left hover:border-border-strong hover:bg-panel-raised"
                >
                  <span className="min-w-0 truncate font-mono text-xs text-ink">{track.trackId}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] text-ink-dim capitalize">{track.className}</span>
                    {track.riskScore !== undefined && (
                      <span className="w-20">
                        <RiskBar score={track.riskScore} severity={severity} />
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
