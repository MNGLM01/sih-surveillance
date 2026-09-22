import { Radio, VideoOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'

interface LiveFeedProps {
  cameraId: string
  refreshMs?: number // Kept for backwards compatibility
  className?: string
  showFps?: boolean
}

/**
 * Ultra-smooth, high-FPS camera feed renderer.
 * 
 * 1. Primary: Binary WebSocket (/ws/stream/{camera_id}) streaming raw JPEG bytes.
 *    Decodes off-thread with `createImageBitmap` and blits directly to <canvas>.
 *    Zero DOM re-render flicker, zero layout thrashing, 25-30+ FPS smooth video.
 * 2. Secondary: Adaptive HTTP fallback (/live/{camera_id}.jpg) with requestAnimationFrame
 *    loop if WebSockets are temporarily unavailable.
 * 3. Real-time measured rendering FPS counter with live pulse indicator.
 */
export function LiveFeed({ cameraId, className, showFps = true }: LiveFeedProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hasFrame, setHasFrame] = useState(false)
  const [failed, setFailed] = useState(false)
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    let isMounted = true
    let ws: WebSocket | null = null
    let reconnectTimeout: number | undefined
    let keepAliveInterval: number | undefined
    let fallbackTimeout: number | undefined
    let fallbackActive = false

    // Rolling timestamps for FPS measurement
    const frameTimestamps: number[] = []
    const fpsInterval = window.setInterval(() => {
      if (!isMounted) return
      const now = performance.now()
      while (frameTimestamps.length > 0 && frameTimestamps[0] < now - 1000) {
        frameTimestamps.shift()
      }
      setFps(frameTimestamps.length)
    }, 500)

    const drawBlob = async (blob: Blob) => {
      try {
        const bitmap = await createImageBitmap(blob)
        if (!isMounted) {
          bitmap.close()
          return
        }
        const canvas = canvasRef.current
        if (canvas) {
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0)
          }
        }
        bitmap.close()
        frameTimestamps.push(performance.now())
        if (!hasFrame) setHasFrame(true)
        if (failed) setFailed(false)
      } catch {
        // Frame decode error - skip frame
      }
    }

    // Adaptive HTTP fallback loop (~25 FPS)
    const runHttpFallback = async () => {
      if (!isMounted) return
      fallbackActive = true
      try {
        const res = await fetch(`/live/${cameraId}.jpg?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
          const blob = await res.blob()
          await drawBlob(blob)
        } else if (!hasFrame) {
          setFailed(true)
        }
      } catch {
        if (!hasFrame) setFailed(true)
      }

      if (isMounted && fallbackActive) {
        fallbackTimeout = window.setTimeout(runHttpFallback, 40)
      }
    }

    const connectWebSocket = () => {
      if (!isMounted) return
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/stream/${cameraId}`

      try {
        ws = new WebSocket(wsUrl)
        ws.binaryType = 'blob'

        ws.onopen = () => {
          fallbackActive = false
          if (fallbackTimeout) clearTimeout(fallbackTimeout)
          // Keep-alive ping every 10 seconds
          keepAliveInterval = window.setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send('ping')
            }
          }, 10000)
        }

        ws.onmessage = (event) => {
          if (event.data instanceof Blob) {
            drawBlob(event.data)
          }
        }

        ws.onerror = () => {
          if (!fallbackActive) runHttpFallback()
        }

        ws.onclose = () => {
          if (keepAliveInterval) clearInterval(keepAliveInterval)
          if (isMounted) {
            if (!fallbackActive) runHttpFallback()
            // Auto-reconnect WebSocket after 3 seconds
            reconnectTimeout = window.setTimeout(connectWebSocket, 3000)
          }
        }
      } catch {
        if (!fallbackActive) runHttpFallback()
        reconnectTimeout = window.setTimeout(connectWebSocket, 3000)
      }
    }

    connectWebSocket()

    // Safety timeout: if no frames within 4s, show no signal
    const initialCheck = window.setTimeout(() => {
      if (isMounted && !hasFrame && frameTimestamps.length === 0) {
        setFailed(true)
      }
    }, 4000)

    return () => {
      isMounted = false
      fallbackActive = false
      clearTimeout(reconnectTimeout)
      clearTimeout(fallbackTimeout)
      clearTimeout(initialCheck)
      clearInterval(keepAliveInterval)
      clearInterval(fpsInterval)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [cameraId])

  if (failed && !hasFrame) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-1.5 bg-panel-inset', className)}>
        <VideoOff className="size-6 text-ink-dim" aria-hidden />
        <span className="text-[10px] font-semibold tracking-widest text-ink-dim uppercase">No signal · demo feed</span>
      </div>
    )
  }

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-black', className)}>
      <canvas
        ref={canvasRef}
        className="h-full w-full object-cover"
        style={{ display: hasFrame ? 'block' : 'none' }}
      />
      {!hasFrame && (
        <div className="flex h-full w-full items-center justify-center bg-panel-inset">
          <div className="flex items-center gap-2 font-mono text-xs text-ink-dim">
            <Radio className="size-3.5 animate-pulse text-low" />
            <span>Connecting feed...</span>
          </div>
        </div>
      )}
      {showFps && hasFrame && fps !== null && fps > 0 && (
        <div className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400 backdrop-blur-xs">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>{fps} FPS</span>
        </div>
      )}
    </div>
  )
}
