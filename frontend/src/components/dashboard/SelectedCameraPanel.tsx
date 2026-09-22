import { useState } from 'react'
import { Car, Lock, User, Pencil, ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { LiveFeed } from '@/components/camera/LiveFeed'
import { ZoneDrawer } from '@/components/camera/ZoneDrawer'
import { CameraStatusBadge, RiskBar } from '@/components/ui'
import { severityFromScore } from '@/lib/severity'
import { formatClock } from '@/lib/format'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/routes'
import { useSurveillance } from '@/store/SurveillanceProvider'
import type { Camera, Incident, Track } from '@/types/domain'

export function SelectedCameraPanel({
  camera,
  tracks: propTracks,
  latestIncident: propLatestIncident,
}: {
  camera: Camera
  tracks?: Track[]
  latestIncident?: Incident
}) {
  const navigate = useNavigate()
  const { isCameraRestricted, toggleRestrictedCamera, operatorOptions, updateCameraZones, tracksByCamera, incidents } = useSurveillance()
  const [isDrawingZones, setIsDrawingZones] = useState(false)
  const isRestricted = isCameraRestricted(camera.id)

  const activeCameraTracks = tracksByCamera(camera.id)
  const cameraTracks = activeCameraTracks.length > 0 ? activeCameraTracks : (propTracks ?? [])
  const cameraIncidents = incidents.filter((i) => i.cameraId === camera.id)
  const latestIncident = cameraIncidents[0] ?? propLatestIncident


  const now = Date.now()
  const hasActiveDangerTrack = cameraTracks.some((t) => (t.riskScore ?? 0) >= 70)
  const hasActiveDangerIncident = cameraIncidents.some(
    (i) =>
      (i.status === 'NEW' || i.status === 'INVESTIGATING') &&
      (i.severity === 'HIGH' || i.severity === 'CRITICAL') &&
      now - new Date(i.updatedAt).getTime() < 15000,
  )
  const hasDangerIncident = hasActiveDangerTrack || hasActiveDangerIncident

  const hasActiveMediumTrack = cameraTracks.some((t) => (t.riskScore ?? 0) >= 30 && (t.riskScore ?? 0) < 70)
  const hasActiveMediumIncident = cameraIncidents.some(
    (i) =>
      (i.status === 'NEW' || i.status === 'INVESTIGATING') &&
      i.severity === 'MEDIUM' &&
      now - new Date(i.updatedAt).getTime() < 15000,
  )
  const hasMediumIncident = !hasDangerIncident && (hasActiveMediumTrack || hasActiveMediumIncident)

  const personCount = cameraTracks.filter((t) => t.className === 'person').length
  const vehicleCount = cameraTracks.filter((t) => t.className !== 'person').length
  const sortedTracks = [...cameraTracks].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-ink">
                {camera.id.toUpperCase()} · {camera.name.toUpperCase()}
              </p>
              {hasDangerIncident && (
                <span className="flex items-center gap-1.5 rounded border border-red-500 bg-red-600/25 px-2 py-0.5 font-mono text-[10px] font-black text-red-300 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]">
                  <span className="size-1.5 rounded-full bg-red-500 animate-ping" />
                  🚨 RED ALERT: DANGER
                </span>
              )}
              {hasMediumIncident && (
                <span className="flex items-center gap-1.5 rounded border border-amber-500/60 bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                  ⚠️ RISK: MEDIUM
                </span>
              )}
              {isRestricted && (
                <span className="flex items-center gap-1 rounded border border-critical/50 bg-critical/15 px-1.5 py-0.2 font-mono text-[10px] font-bold text-critical-ink">
                  <Lock className="size-2.5" /> RESTRICTED
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <CameraStatusBadge status={camera.status} />
              {camera.fps !== undefined && camera.latencyMs !== undefined && (
                <span className="font-mono text-[11px] text-ink-dim">
                  {camera.fps} FPS · {camera.latencyMs}ms
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDrawingZones((prev) => !prev)}
              className={cn(
                'flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition-colors',
                isDrawingZones
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                  : 'border-border-strong bg-panel-raised text-ink-muted hover:border-amber-500/50 hover:text-amber-300',
              )}
              title="Draw rectangular virtual fences for intrusion detection"
            >
              <Pencil className="size-3" />
              <span>{isDrawingZones ? 'Exit Draw Mode' : 'Draw Virtual Fence'}</span>
            </button>

            {operatorOptions.selectiveCameraRestricted && (
              <button
                type="button"
                onClick={() => toggleRestrictedCamera(camera.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition-colors',
                  isRestricted
                    ? 'border-critical/60 bg-critical/15 text-critical-ink hover:bg-critical/25'
                    : 'border-border-strong bg-panel-raised text-ink-muted hover:border-ink-dim hover:text-ink',
                )}
              >
                <Lock className="size-3" />
                <span>{isRestricted ? 'Restricted Security Zone' : 'Mark Restricted'}</span>
              </button>
            )}
          </div>
        </div>

        {isDrawingZones && (
          <div className="mb-2 flex items-center justify-between rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="size-3.5" />
              <strong>Virtual Fencing Active:</strong> Click & drag a box on the camera feed to define a restricted intrusion zone.
            </span>
            <span className="font-mono text-[11px] text-amber-400">
              {camera.zones?.length ?? 0} zone(s) configured
            </span>
          </div>
        )}

        <div
          className={cn(
            'relative aspect-video overflow-hidden rounded border transition-all',
            hasDangerIncident
              ? 'border-red-500 ring-2 ring-red-500/70 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
              : isRestricted
                ? 'border-critical/60 ring-1 ring-critical/40'
                : hasMediumIncident
                  ? 'border-amber-500/60 ring-1 ring-amber-500/40'
                  : 'border-border',
          )}
        >

          <LiveFeed cameraId={camera.id} />
          <ZoneDrawer
            cameraId={camera.id}
            zones={camera.zones ?? []}
            isEditing={isDrawingZones}
            onSaveZones={(newZones) => updateCameraZones(camera.id, newZones)}
            onToggleEdit={() => setIsDrawingZones((prev) => !prev)}
          />
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
