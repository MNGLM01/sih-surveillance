/**
 * Matches backend/main.py's actual `/ws/live` payload shapes exactly
 * (`on_event` / `on_incident` in that file build these dicts):
 *   {"type": "event", event_id, camera_id, track_id, object_class, score, breakdown}
 *   {"type": "incident_created" | "incident_updated", data: {...}}
 * If the real backend changes these shapes, this is the one file to update -
 * the store never parses a WS frame itself.
 */
export interface LiveIncidentPayload {
  incident_id: number
  camera_id: string
  track_id: string
  object_class: string
  severity: string
  risk_score: number
  status: string
  reasons: string[]
}

export type LiveMessage =
  | {
      type: 'event'
      event_id: number
      camera_id: string
      track_id: string
      object_class: string
      score: number
      breakdown: string[]
    }
  | { type: 'incident_created' | 'incident_updated'; data: LiveIncidentPayload }

export function connectLiveEvents(onMessage: (msg: LiveMessage) => void, onStatusChange: (connected: boolean) => void): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/ws/live`)

  ws.onopen = () => onStatusChange(true)
  ws.onclose = () => onStatusChange(false)
  ws.onerror = () => ws.close()
  ws.onmessage = (evt: MessageEvent<string>) => {
    try {
      onMessage(JSON.parse(evt.data) as LiveMessage)
    } catch {
      // malformed frame - ignore rather than crash the live feed
    }
  }

  return () => ws.close()
}
