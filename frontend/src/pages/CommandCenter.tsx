import { Loader2 } from 'lucide-react'

import { AlertCenter } from '@/components/dashboard/AlertCenter'
import { CameraRail } from '@/components/dashboard/CameraRail'
import { MultiCameraGrid } from '@/components/dashboard/MultiCameraGrid'
import { SelectedCameraPanel } from '@/components/dashboard/SelectedCameraPanel'
import { Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { Timeline } from '@/components/ui/Timeline'
import { buildIncidentTimeline } from '@/lib/incidentTimeline'
import { useSurveillance } from '@/store/SurveillanceProvider'

export default function CommandCenter() {
  const { loading, camerasWithIncidentCounts, incidents, incidentsSource, selectedCameraId, selectCamera, tracksByCamera } =
    useSurveillance()

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
