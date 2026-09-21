import { AlertTriangle, Car, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getVehicles } from '@/api/vehicles'
import { Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { formatClock } from '@/lib/format'
import type { Vehicle } from '@/types/extended'

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  useEffect(() => {
    getVehicles().then((res) => setVehicles(res.data))
  }, [])

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start gap-3 rounded-md border border-medium/40 bg-medium/10 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-medium-ink" aria-hidden />
        <div>
          <p className="text-sm font-bold text-medium-ink">ANPR MODULE — NOT CONNECTED</p>
          <p className="mt-1 text-xs text-ink-muted">
            The backend has no automatic number-plate reading module (`backend/anpr.py` is intentionally not built yet - see
            docs/architecture.md §5, "Advanced / future work"). Everything below is sample data showing what this screen will look
            like once ANPR is wired up - it is not read from any camera.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader title="Vehicle Intelligence" subtitle={`${vehicles.length} vehicles in demo dataset`} action={<DataSourceBadge source="not_connected" />} />
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
    </div>
  )
}
