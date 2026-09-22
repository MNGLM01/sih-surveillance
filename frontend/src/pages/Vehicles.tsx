import { Car, Search, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { getVehicles, searchVehicles } from '@/api/vehicles'
import { Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { formatClock } from '@/lib/format'
import type { DataSource } from '@/types/dataSource'
import type { Vehicle } from '@/types/extended'

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [source, setSource] = useState<DataSource>('demo')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    getVehicles().then((res) => {
      setVehicles(res.data)
      setSource(res.source)
    })
  }, [])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      const res = await getVehicles()
      setVehicles(res.data)
      setSource(res.source)
      return
    }
    setSearching(true)
    try {
      const res = await searchVehicles(searchQuery.trim())
      setVehicles(res.data)
      setSource(res.source)
    } finally {
      setSearching(false)
    }
  }, [searchQuery])

  const [selectedImage, setSelectedImage] = useState<{ url: string; plate: string } | null>(null)

  return (
    <div className="space-y-3 p-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-dim" aria-hidden />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search plate number (e.g. GA03, MP13, MN12)..."
            className="w-full rounded border border-border bg-panel-raised py-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-dim focus:border-low focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="shrink-0 rounded bg-low px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-low/80 disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      <Card>
        <CardHeader
          title="Vehicle Intelligence"
          subtitle={`${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''} detected`}
          action={<DataSourceBadge source={source} />}
        />
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {vehicles.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-ink-dim">
              {searchQuery ? 'No vehicles match your search.' : 'No ANPR detections yet. Start the backend with cameras processing video.'}
            </div>
          )}
          {vehicles.map((vehicle) => (
            <div key={vehicle.id} className="rounded border border-border bg-panel-raised p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Car className="size-4 text-ink-dim" aria-hidden />
                  <div>
                    <p className="font-mono text-sm font-bold text-ink">{vehicle.plate}</p>
                    <p className="text-xs text-ink-dim">
                      {vehicle.vehicleClass} · {Math.round(vehicle.confidence * 100)}% confidence
                    </p>
                  </div>
                </div>
                {vehicle.watchlistMatch && (
                  <span className="flex items-center gap-1 rounded bg-critical/15 px-1.5 py-0.5 text-[10px] font-bold text-critical-ink">
                    <ShieldAlert className="size-3" /> WATCHLIST
                  </span>
                )}
              </div>

              {vehicle.evidenceImageUrl && (
                <div className="mt-2.5 overflow-hidden rounded border border-border bg-black/40">
                  <img
                    src={vehicle.evidenceImageUrl}
                    alt={`Plate evidence ${vehicle.plate}`}
                    onClick={() => setSelectedImage({ url: vehicle.evidenceImageUrl!, plate: vehicle.plate })}
                    className="h-28 w-full cursor-pointer object-cover transition-transform duration-200 hover:scale-105"
                    loading="lazy"
                  />
                </div>
              )}

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-muted">
                <span>First seen: {formatClock(vehicle.firstSeen)}</span>
                <span>Last seen: {formatClock(vehicle.lastSeen)}</span>
              </div>

              <div className="mt-2">
                <p className="mb-1 text-[10px] font-semibold tracking-widest text-ink-dim uppercase">Plate activity</p>
                <ul className="space-y-0.5">
                  {vehicle.sightings.map((sighting) => (
                    <li key={`${sighting.cameraId}-${sighting.timestamp}`} className="flex justify-between font-mono text-[11px] text-ink-dim">
                      <span>{formatClock(sighting.timestamp)}</span>
                      <span>{sighting.cameraName}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="max-w-2xl overflow-hidden rounded-lg border border-border bg-panel p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-mono text-sm font-bold text-ink">ANPR Evidence — {selectedImage.plate}</h3>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="rounded px-2 py-1 text-xs text-ink-dim hover:bg-panel-raised hover:text-ink"
              >
                Close
              </button>
            </div>
            <img
              src={selectedImage.url}
              alt={`ANPR Evidence ${selectedImage.plate}`}
              className="max-h-[70vh] w-full rounded object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
