import { VideoOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/cn'

/**
 * Polls the backend's annotated JPEG snapshot for a camera (backend/main.py
 * `on_frame` writes `frontend/live/{camera_id}.jpg` every processed frame -
 * see docs/architecture.md §3), the same polling approach the original
 * vanilla dashboard used. Falls back to a clearly-labeled placeholder,
 * rather than a fabricated video, whenever the backend isn't running or
 * hasn't produced a frame for this camera yet.
 */
export function LiveFeed({ cameraId, refreshMs = 500, className }: { cameraId: string; refreshMs?: number; className?: string }) {
  const [src, setSrc] = useState(`/live/${cameraId}.jpg?t=${Date.now()}`)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    const id = setInterval(() => setSrc(`/live/${cameraId}.jpg?t=${Date.now()}`), refreshMs)
    return () => clearInterval(id)
  }, [cameraId, refreshMs])

  if (failed) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-1.5 bg-panel-inset', className)}>
        <VideoOff className="size-6 text-ink-dim" aria-hidden />
        <span className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">No signal · demo feed</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={`Live feed - ${cameraId}`}
      onError={() => setFailed(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  )
}
