import {
  Activity,
  Car,
  GitBranch,
  Loader2,
  Lock,
  ShieldAlert,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react'

import { AlertCenter } from '@/components/dashboard/AlertCenter'
import { CameraRail } from '@/components/dashboard/CameraRail'
import { MultiCameraGrid } from '@/components/dashboard/MultiCameraGrid'
import { OperatorManualDropdown } from '@/components/dashboard/OperatorManualDropdown'
import { SelectedCameraPanel } from '@/components/dashboard/SelectedCameraPanel'
import { Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { Timeline } from '@/components/ui/Timeline'
import { cn } from '@/lib/cn'
import { buildIncidentTimeline } from '@/lib/incidentTimeline'
import { useSurveillance } from '@/store/SurveillanceProvider'

export default function CommandCenter() {
  const {
    loading,
    camerasWithIncidentCounts,
    incidents,
    incidentsSource,
    selectedCameraId,
    selectCamera,
    tracksByCamera,
    operatorOptions,
    restrictedCameraIds,
    alarm,
  } = useSurveillance()

  const { isAlarmActive, highRiskCount, isMuted, toggleMute } = alarm


  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-ink-muted">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Connecting to surveillance pipeline...</span>
      </div>
    )
  }

  const selectedCamera = camerasWithIncidentCounts.find((c) => c.id === selectedCameraId) ?? camerasWithIncidentCounts[0]
  const cameraTracks = selectedCamera ? tracksByCamera(selectedCamera.id) : []
  const cameraIncidents = incidents.filter((i) => i.cameraId === selectedCamera?.id)
  const latestIncident = cameraIncidents[0]

  return (
    <div className="space-y-3 p-3">
      {/* High-Risk Alarm Alert Banner */}
      {highRiskCount > 0 && (
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5 transition-all',
            isAlarmActive
              ? 'border-red-500 bg-red-950/70 shadow-[0_0_25px_rgba(225,29,72,0.4)] ring-1 ring-red-500/50'
              : 'border-red-900/50 bg-red-950/30 text-red-300',
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex items-center justify-center rounded-full p-2',
                isAlarmActive ? 'bg-red-600 text-white animate-bounce shadow-lg shadow-red-600/50' : 'bg-red-900/40 text-red-400',
              )}
            >
              <Volume2 className="size-4" />
            </span>
            <div>
              <p className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-white uppercase">
                <span className="inline-block size-2 rounded-full bg-red-500 animate-ping" />
                🚨 DANGER ALERT: {highRiskCount} CRITICAL / HIGH RISK INCIDENT{highRiskCount > 1 ? 'S' : ''} DETECTED
              </p>
              <p className="text-[11px] text-red-200">
                {isAlarmActive
                  ? 'Continuous loud alarm is sounding. Immediate operator attention and verification required.'
                  : 'Alarm audio muted by operator. Incidents remain active.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className={cn(
                'flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold transition-all shadow',
                isMuted
                  ? 'border-red-500/50 bg-panel-raised text-red-200 hover:bg-panel'
                  : 'border-red-500 bg-red-600 text-white hover:bg-red-500 shadow-[0_0_12px_rgba(225,29,72,0.6)]',
              )}
            >
              {isMuted ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              <span>{isMuted ? 'Unmute Alarm' : 'Mute Loud Beep'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Operator Manual Mode Operational Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-ink uppercase">
            <SlidersHorizontal className="size-3.5 text-low" />
            <span>Operator Manual Modes:</span>
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors',
              operatorOptions.virtualFenceIntrusion
                ? 'border-low/40 bg-low/15 text-low'
                : 'border-border bg-panel-raised text-ink-dim opacity-50',
            )}
          >
            <ShieldAlert className="size-3" />
            Virtual Fence Intrusion
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors',
              operatorOptions.selectiveCameraRestricted
                ? 'border-critical/40 bg-critical/15 text-critical-ink'
                : 'border-border bg-panel-raised text-ink-dim opacity-50',
            )}
          >
            <Lock className="size-3" />
            Restricted Zones ({restrictedCameraIds.length})
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors',
              operatorOptions.anpr
                ? 'border-live/40 bg-live/15 text-live'
                : 'border-border bg-panel-raised text-ink-dim opacity-50',
            )}
          >
            <Car className="size-3" />
            ANPR
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors',
              operatorOptions.crossCameraDetection
                ? 'border-medium/40 bg-medium/15 text-medium-ink'
                : 'border-border bg-panel-raised text-ink-dim opacity-50',
            )}
          >
            <GitBranch className="size-3" />
            Cross-Cam Handover
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors',
              operatorOptions.riskScore
                ? 'border-high/40 bg-high/15 text-high-ink'
                : 'border-border bg-panel-raised text-ink-dim opacity-50',
            )}
          >
            <Activity className="size-3" />
            Risk Engine
          </span>
        </div>

        <div className="flex items-center gap-2">
          <OperatorManualDropdown align="right" compact />
        </div>
      </div>
      {/* Pinned to a viewport-relative height (not `1fr` against an
          uncertain ancestor height) so this primary row stays a stable
          "cockpit view" regardless of how much content the lower,
          naturally-scrolling sections end up with. */}
      <div className="grid grid-cols-1 gap-3 lg:h-[min(60vh,640px)] lg:grid-cols-[220px_1fr_320px]">
        <Card className="overflow-y-auto p-2">
          <CameraRail cameras={camerasWithIncidentCounts} selectedCameraId={selectedCameraId} onSelect={selectCamera} />
        </Card>

        <Card className="flex min-h-[320px] flex-col lg:min-h-0">
          <CardHeader title="Multi-Camera Surveillance" subtitle={`${camerasWithIncidentCounts.length} cameras`} />
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <MultiCameraGrid cameras={camerasWithIncidentCounts} selectedCameraId={selectedCameraId} onSelect={selectCamera} />
          </CardContent>
        </Card>

        <Card className="flex min-h-[320px] flex-col lg:min-h-0">
          <CardHeader title="Alert Center" action={<DataSourceBadge source={incidentsSource} />} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AlertCenter incidents={incidents} />
          </div>
        </Card>
      </div>

      {selectedCamera && (
        <Card>
          <CardHeader title={`Selected Camera: ${selectedCamera.name}`} subtitle="Camera & track intelligence" />
          <SelectedCameraPanel camera={selectedCamera} tracks={cameraTracks} latestIncident={latestIncident} />
        </Card>
      )}

      {latestIncident && (
        <Card>
          <CardHeader title="Incident Timeline" subtitle={`INC-${latestIncident.id} · ${selectedCamera?.name}`} />
          <CardContent>
            <Timeline nodes={buildIncidentTimeline(latestIncident)} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
