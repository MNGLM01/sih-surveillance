import { fetchJson, withDemoFallback } from '@/api/client'
import { MOCK_VEHICLES } from '@/mocks/vehicles'
import type { Vehicle, PlateSighting } from '@/types/extended'

/** Shape returned by backend GET /anpr (backend/db.py `list_anpr_detections`). */
interface BackendAnprDetection {
  id: number
  camera_id: string
  track_id: string
  vehicle_type: string
  plate_number: string
  raw_ocr_text: string
  ocr_confidence: number
  plate_detection_confidence: number
  consensus_score: number
  vehicle_bbox: number[] | null
  plate_bbox: number[] | null
  timestamp: string
  evidence_image_path: string | null
  validation_status: string
}

/** Group raw ANPR detections by plate number into Vehicle objects. */
function groupByPlate(detections: BackendAnprDetection[]): Vehicle[] {
  const plateMap = new Map<string, BackendAnprDetection[]>()
  for (const det of detections) {
    const key = det.plate_number.toUpperCase().trim()
    if (!key) continue
    const arr = plateMap.get(key) ?? []
    arr.push(det)
    plateMap.set(key, arr)
  }

  const vehicles: Vehicle[] = []
  let idx = 0
  for (const [plate, dets] of plateMap) {
    // Sort detections by timestamp ascending
    dets.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    const sightings: PlateSighting[] = dets.map((d) => {
      let evidenceImageUrl: string | undefined
      if (d.evidence_image_path) {
        const filename = d.evidence_image_path.split(/[\\/]/).pop()
        if (filename) evidenceImageUrl = `/anpr/evidence/${filename}`
      }
      return {
        timestamp: d.timestamp,
        cameraId: d.camera_id,
        cameraName: d.camera_id.replace('cam', 'Camera '),
        evidenceImageUrl,
      }
    })

    // Best confidence across all detections
    const bestConfidence = Math.max(...dets.map((d) => d.consensus_score ?? d.ocr_confidence ?? 0))

    // Best or latest evidence image for the vehicle
    const latestWithImg = [...dets].reverse().find((d) => d.evidence_image_path)
    let evidenceImageUrl: string | undefined
    if (latestWithImg?.evidence_image_path) {
      const filename = latestWithImg.evidence_image_path.split(/[\\/]/).pop()
      if (filename) evidenceImageUrl = `/anpr/evidence/${filename}`
    }

    vehicles.push({
      id: `V-${++idx}`,
      plate,
      vehicleClass: dets[0].vehicle_type || 'Vehicle',
      confidence: bestConfidence,
      firstSeen: dets[0].timestamp,
      lastSeen: dets[dets.length - 1].timestamp,
      watchlistMatch: false,
      sightings,
      evidenceImageUrl,
    })
  }

  return vehicles
}

export async function getVehicles() {
  return withDemoFallback(
    () => fetchJson<BackendAnprDetection[]>('/anpr').then(groupByPlate),
    MOCK_VEHICLES,
  )
}

export async function searchVehicles(plateQuery: string) {
  return withDemoFallback(
    () => fetchJson<BackendAnprDetection[]>(`/anpr/search?plate=${encodeURIComponent(plateQuery)}`).then(groupByPlate),
    MOCK_VEHICLES.filter((v) => v.plate.toUpperCase().includes(plateQuery.toUpperCase())),
  )
}
