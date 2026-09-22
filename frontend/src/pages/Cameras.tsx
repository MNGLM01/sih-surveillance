import { CameraTile } from '@/components/dashboard/CameraTile'
import { OperatorManualDropdown } from '@/components/dashboard/OperatorManualDropdown'
import { SelectedCameraPanel } from '@/components/dashboard/SelectedCameraPanel'
import { Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { useSurveillance } from '@/store/SurveillanceProvider'

export default function Cameras() {
  const { camerasWithIncidentCounts, incidents, camerasSource, selectedCameraId, selectCamera, tracksByCamera } =
    useSurveillance()

  const selectedCamera = camerasWithIncidentCounts.find((c) => c.id === selectedCameraId) ?? camerasWithIncidentCounts[0]
  const cameraTracks = selectedCamera ? tracksByCamera(selectedCamera.id) : []
  const latestIncident = incidents.find((i) => i.cameraId === selectedCamera?.id)

  return (
    <div className="space-y-3 p-3">
      <Card>
        <CardHeader
          title="Multi-Camera Surveillance"
          subtitle={`${camerasWithIncidentCounts.length} cameras configured`}
          action={
            <div className="flex items-center gap-2">
              <OperatorManualDropdown align="right" compact />
              <DataSourceBadge source={camerasSource} />
            </div>
          }
        />
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {camerasWithIncidentCounts.map((cam) => (
              <CameraTile key={cam.id} camera={cam} selected={cam.id === selectedCameraId} onSelect={() => selectCamera(cam.id)} />
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedCamera && (
        <Card>
          <CardHeader title={selectedCamera.name} subtitle={selectedCamera.location} />
          <SelectedCameraPanel camera={selectedCamera} tracks={cameraTracks} latestIncident={latestIncident} />
        </Card>
      )}
    </div>
  )
}
