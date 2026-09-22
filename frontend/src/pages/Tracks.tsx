import { Fingerprint, GitCommit } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { Card, CardContent, CardHeader, DataSourceBadge, EmptyState, RiskBar, SeverityBadge } from '@/components/ui'
import { formatClock, formatDuration } from '@/lib/format'
import { severityFromScore } from '@/lib/severity'
import { getMovementHistory } from '@/api/tracks'
import { useSurveillance } from '@/store/SurveillanceProvider'
import type { Track } from '@/types/domain'

function TrackListRow({ track, active, onSelect }: { track: Track; active: boolean; onSelect: () => void }) {
  const severity = severityFromScore(track.riskScore ?? 0)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-2 rounded border px-2.5 py-2 text-left ${
        active ? 'border-low/50 bg-low/10' : 'border-border hover:border-border-strong hover:bg-panel-raised'
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-ink">{track.trackId}</p>
        <p className="text-[11px] text-ink-dim capitalize">{track.cameraId} · {track.className}</p>
      </div>
      {track.riskScore !== undefined && (
        <span className="w-16 shrink-0">
          <RiskBar score={track.riskScore} severity={severity} />
        </span>
      )}
    </button>
  )
}

export default function Tracks() {
  const { camerasWithIncidentCounts, tracksByCamera } = useSurveillance()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')

  const allTracks = camerasWithIncidentCounts.flatMap((cam) => tracksByCamera(cam.id))
  const selected = allTracks.find((t) => t.trackId === selectedId) ?? allTracks[0]
  const camera = camerasWithIncidentCounts.find((c) => c.id === selected?.cameraId)
  const movementHistory = selected ? getMovementHistory(selected.trackId) : []
  const severity = selected ? severityFromScore(selected.riskScore ?? 0) : 'LOW'

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 p-3 lg:grid-cols-[280px_1fr]">
      <Card className="flex min-h-0 flex-col">
        <CardHeader title="Active Tracks" subtitle={`${allTracks.length} across all cameras`} />
        <CardContent className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {allTracks.map((track) => (
            <TrackListRow
              key={track.trackId}
              track={track}
              active={track.trackId === selected?.trackId}
              onSelect={() => setParams({ id: track.trackId })}
            />
          ))}
        </CardContent>
      </Card>

      {!selected ? (
        <Card>
          <EmptyState icon={Fingerprint} title="No active tracks" detail="Nothing is currently being tracked on any camera." />
        </Card>
      ) : (
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="Track Intelligence"
              action={selected.source && <DataSourceBadge source={selected.source} />}
            />
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Track ID" value={selected.trackId} mono />
              <Field label="Object" value={selected.className} capitalize />
              <Field label="Detection confidence" value={selected.confidence ? `${Math.round(selected.confidence * 100)}%` : '-'} />
              <Field label="First seen" value={formatClock(selected.firstSeen)} mono />
              <Field label="Current camera" value={camera?.name ?? selected.cameraId} />
              <Field label="Current location" value={selected.zone ?? camera?.location ?? '-'} />
              <Field label="Duration" value={formatDuration(selected.firstSeen, selected.lastSeen)} mono />
              <Field label="Movement" value={selected.direction ?? '-'} />
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Current risk</p>
                <div className="mt-1 flex items-center gap-2">
                  <SeverityBadge severity={severity} />
                  <span className="font-mono text-sm text-ink">{selected.riskScore ?? 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Movement History"
              subtitle="Cross-camera correlation - demo/planned, not real re-identification"
              action={<DataSourceBadge source="planned" />}
            />
            <CardContent>
              {movementHistory.length === 0 ? (
                <p className="text-xs text-ink-dim italic">
                  No cross-camera correlation data for this track. A tracker id is scoped to one camera and is not a confirmed identity
                  (see backend/tracker.py) - this feature is planned, not implemented.
                </p>
              ) : (
                <ol className="space-y-2">
                  {movementHistory.map((hop, i) => (
                    <li key={`${hop.cameraId}-${hop.timestamp}`} className="flex items-center gap-2 text-sm">
                      <GitCommit className="size-4 shrink-0 text-ink-dim" aria-hidden />
                      <span className="text-ink">{hop.cameraName}</span>
                      <span className="font-mono text-xs text-ink-dim">{formatClock(hop.timestamp)}</span>
                      {i === movementHistory.length - 1 && (
                        <span className="rounded bg-panel-inset px-1.5 py-0.5 text-[10px] text-ink-dim">current</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, mono, capitalize }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-ink ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  )
}
