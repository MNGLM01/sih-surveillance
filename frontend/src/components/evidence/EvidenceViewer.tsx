import { FileVideo, Fingerprint, Loader2, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/ui'
import { formatClock } from '@/lib/format'
import type { Incident } from '@/types/domain'

/**
 * backend/main.py's event_id and incident_id sequences advance in lockstep -
 * on_event/on_incident are only ever called together from the same
 * "new incident" moment in camera_worker.py, both inserting one row into
 * their own table - so `/evidence/{incident.id}.mp4` genuinely resolves the
 * right clip. See docs/architecture.md §3.
 */
function evidenceUrl(incidentId: string): string {
  return `/evidence/${incidentId}.mp4`
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function EvidenceViewer({ incident }: { incident: Incident }) {
  const [videoError, setVideoError] = useState(false)
  const [hash, setHash] = useState<string | null>(null)
  const [hashing, setHashing] = useState(false)
  const [hashError, setHashError] = useState(false)

  const url = evidenceUrl(incident.id)

  useEffect(() => {
    setHash(null)
    setHashError(false)
    setVideoError(false)
  }, [incident.id])

  async function verifyIntegrity() {
    setHashing(true)
    setHashError(false)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('clip unavailable')
      const buf = await res.arrayBuffer()
      setHash(await sha256Hex(buf))
    } catch {
      setHashError(true)
    } finally {
      setHashing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="aspect-video overflow-hidden rounded border border-border bg-panel-inset">
        {videoError ? (
          <EmptyState
            icon={FileVideo}
            title="Evidence clip not available"
            detail="No clip found at this path yet - it may still be recording (pre+post buffered), or this is demo data with no backing file."
          />
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={url} controls className="h-full w-full bg-black" onError={() => setVideoError(true)} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold tracking-wide">
        <div className="rounded border border-border bg-panel-raised py-2 text-ink-muted">PRE-EVENT · -5s</div>
        <div className="rounded border border-high/40 bg-high/10 py-2 text-high-ink">INCIDENT TRIGGER</div>
        <div className="rounded border border-border bg-panel-raised py-2 text-ink-muted">POST-EVENT · +10s</div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded border border-border bg-panel-raised p-3 text-xs">
        <div>
          <p className="text-ink-dim">Camera</p>
          <p className="mt-0.5 font-medium text-ink">{incident.cameraName}</p>
        </div>
        <div>
          <p className="text-ink-dim">Captured</p>
          <p className="mt-0.5 font-mono text-ink">{formatClock(incident.createdAt)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-ink-dim">Event</p>
          <p className="mt-0.5 font-medium text-ink">{incident.reasons[0] ?? 'Risk-crossing event'}</p>
        </div>
      </div>

      <div className="rounded border border-border bg-panel-raised p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-ink-dim uppercase">
          <Fingerprint className="size-3.5" /> Integrity fingerprint
        </p>
        {hash ? (
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="size-4 shrink-0 text-live" />
            <div className="min-w-0">
              <p className="break-all font-mono text-ink">{hash}</p>
              <p className="mt-0.5 text-ink-dim">SHA-256, computed client-side from the retrieved clip just now - a fingerprint, not encryption.</p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void verifyIntegrity()}
            disabled={hashing}
            className="flex items-center gap-2 text-xs text-low hover:underline disabled:opacity-50"
          >
            {hashing ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldQuestion className="size-3.5" />}
            {hashing ? 'Fetching clip and hashing...' : 'Verify integrity (compute SHA-256)'}
          </button>
        )}
        {hashError && <p className="mt-1 text-xs text-critical-ink">Could not fetch the clip to hash - see the player above.</p>}
      </div>
    </div>
  )
}
