import { CameraTile } from '@/components/dashboard/CameraTile'
import type { Camera } from '@/types/domain'

export function MultiCameraGrid({
  cameras,
  selectedCameraId,
  onSelect,
}: {
  cameras: Camera[]
  selectedCameraId: string | null
  onSelect: (cameraId: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {cameras.map((cam) => (
        <CameraTile key={cam.id} camera={cam} selected={cam.id === selectedCameraId} onSelect={() => onSelect(cam.id)} />
      ))}
    </div>
  )
}
