import { useState, useRef, useEffect, type MouseEvent } from 'react'
import { Trash2, Check, X, Shield } from 'lucide-react'
import type { Zone } from '@/types/domain'
import { cn } from '@/lib/cn'

interface ZoneDrawerProps {
  cameraId?: string
  zones: Zone[]
  onSaveZones: (zones: Zone[]) => Promise<boolean> | void
  isEditing?: boolean
  onToggleEdit?: () => void
}

interface DragBox {
  startX: number
  startY: number
  currX: number
  currY: number
}

const ZONE_COLORS = [
  { border: 'border-emerald-500', bg: 'bg-emerald-500/20', text: 'text-emerald-300', fill: 'rgba(16, 185, 129, 0.25)' },
  { border: 'border-amber-500', bg: 'bg-amber-500/20', text: 'text-amber-300', fill: 'rgba(245, 158, 11, 0.25)' },
  { border: 'border-cyan-500', bg: 'bg-cyan-500/20', text: 'text-cyan-300', fill: 'rgba(6, 182, 212, 0.25)' },
  { border: 'border-rose-500', bg: 'bg-rose-500/20', text: 'text-rose-300', fill: 'rgba(244, 63, 94, 0.25)' },
]

export function ZoneDrawer({
  zones,
  onSaveZones,
  isEditing = false,
}: ZoneDrawerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragBox, setDragBox] = useState<DragBox | null>(null)
  const [pendingRect, setPendingRect] = useState<[number, number, number, number] | null>(null)
  const [newZoneName, setNewZoneName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Reset drawing states when edit mode is toggled off
  useEffect(() => {
    if (!isEditing) {
      setIsDrawing(false)
      setDragBox(null)
      setPendingRect(null)
    }
  }, [isEditing])

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!isEditing || pendingRect) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setIsDrawing(true)
    setDragBox({ startX: x, startY: y, currX: x, currY: y })
  }

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !dragBox || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))

    setDragBox((prev) => (prev ? { ...prev, currX: x, currY: y } : null))
  }

  const handleMouseUp = () => {
    if (!isDrawing || !dragBox || !containerRef.current) return
    setIsDrawing(false)

    const rect = containerRef.current.getBoundingClientRect()
    const minX = Math.min(dragBox.startX, dragBox.currX)
    const maxX = Math.max(dragBox.startX, dragBox.currX)
    const minY = Math.min(dragBox.startY, dragBox.currY)
    const maxY = Math.max(dragBox.startY, dragBox.currY)

    // Ignore tiny accidental clicks (< 20px in width or height)
    if (maxX - minX < 20 || maxY - minY < 20) {
      setDragBox(null)
      return
    }

    // Convert to normalized coordinates (0..1)
    const normX1 = Math.max(0, Math.min(1, minX / rect.width))
    const normY1 = Math.max(0, Math.min(1, minY / rect.height))
    const normX2 = Math.max(0, Math.min(1, maxX / rect.width))
    const normY2 = Math.max(0, Math.min(1, maxY / rect.height))

    const roundedNorm: [number, number, number, number] = [
      Math.round(normX1 * 1000) / 1000,
      Math.round(normY1 * 1000) / 1000,
      Math.round(normX2 * 1000) / 1000,
      Math.round(normY2 * 1000) / 1000,
    ]

    setPendingRect(roundedNorm)
    setNewZoneName(`Virtual Fence ${zones.length + 1}`)
    setDragBox(null)
  }

  const handleConfirmAddZone = async () => {
    if (!pendingRect) return
    const name = newZoneName.trim() || `Virtual Fence ${zones.length + 1}`
    const updatedZones: Zone[] = [
      ...zones,
      {
        name,
        rectNorm: pendingRect,
      },
    ]

    setIsSaving(true)
    await onSaveZones(updatedZones)
    setIsSaving(false)
    setPendingRect(null)
    setNewZoneName('')
  }

  const handleCancelPending = () => {
    setPendingRect(null)
    setNewZoneName('')
    setDragBox(null)
  }

  const handleDeleteZone = async (indexToDelete: number) => {
    const updatedZones = zones.filter((_, idx) => idx !== indexToDelete)
    setIsSaving(true)
    await onSaveZones(updatedZones)
    setIsSaving(false)
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={cn(
        'absolute inset-0 select-none overflow-hidden',
        isEditing ? (isDrawing ? 'cursor-crosshair' : 'cursor-crosshair') : 'pointer-events-none',
      )}
    >
      {/* Existing Zones Rendered on Canvas Overlay */}
      {zones.map((zone, idx) => {
        const [x1, y1, x2, y2] = zone.rectNorm
        const color = ZONE_COLORS[idx % ZONE_COLORS.length]
        const left = `${Math.min(x1, x2) * 100}%`
        const top = `${Math.min(y1, y2) * 100}%`
        const width = `${Math.abs(x2 - x1) * 100}%`
        const height = `${Math.abs(y2 - y1) * 100}%`

        return (
          <div
            key={`${zone.name}-${idx}`}
            style={{ left, top, width, height }}
            className={cn(
              'absolute border-2 border-dashed transition-all',
              color.border,
              color.bg,
              'shadow-[0_0_10px_rgba(0,0,0,0.5)]',
            )}
          >
            <div className="absolute top-1 left-1 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 backdrop-blur-sm">
              <Shield className={cn('size-3', color.text)} />
              <span className={cn('font-mono text-[10px] font-bold', color.text)}>
                {zone.name}
              </span>
              {isEditing && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteZone(idx)
                  }}
                  title="Remove this virtual fence"
                  className="pointer-events-auto ml-1 rounded p-0.5 text-red-400 hover:bg-red-500/20 hover:text-red-200"
                >
                  <Trash2 className="size-2.5" />
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Dragging Preview Box */}
      {dragBox && (
        <div
          style={{
            left: `${Math.min(dragBox.startX, dragBox.currX)}px`,
            top: `${Math.min(dragBox.startY, dragBox.currY)}px`,
            width: `${Math.abs(dragBox.currX - dragBox.startX)}px`,
            height: `${Math.abs(dragBox.currY - dragBox.startY)}px`,
          }}
          className="pointer-events-none absolute border-2 border-dashed border-amber-400 bg-amber-500/25 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
        >
          <div className="absolute top-1 left-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            Drawing Virtual Fence...
          </div>
        </div>
      )}

      {/* Modal / Dialog when box is drawn: prompt for name & confirm */}
      {pendingRect && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xs rounded-lg border border-amber-500/40 bg-panel-raised p-3 shadow-2xl">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <Shield className="size-3.5" />
              <span>Save Virtual Fence</span>
            </div>
            <p className="mb-2 text-[11px] text-ink-muted">
              Enter a name for this restricted security zone:
            </p>
            <input
              type="text"
              autoFocus
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmAddZone()
                if (e.key === 'Escape') handleCancelPending()
              }}
              placeholder="e.g. Restricted Perimeter"
              className="w-full rounded border border-border-strong bg-panel-inset px-2.5 py-1.5 font-mono text-xs text-ink focus:border-amber-500 focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelPending}
                className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-ink-muted hover:bg-panel hover:text-ink"
              >
                <X className="size-3" /> Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleConfirmAddZone}
                className="flex items-center gap-1 rounded bg-amber-600 px-3 py-1 text-xs font-bold text-white shadow hover:bg-amber-500"
              >
                <Check className="size-3" /> {isSaving ? 'Saving...' : 'Save Zone'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
