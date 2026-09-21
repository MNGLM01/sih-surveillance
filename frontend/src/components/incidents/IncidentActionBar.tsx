import { useState } from 'react'

import { Button, Modal } from '@/components/ui'
import type { Incident, IncidentStatus } from '@/types/domain'

const REASON_REQUIRED: Partial<Record<IncidentStatus, string>> = {
  FALSE_POSITIVE: 'Why is this a false positive?',
  RESOLVED: 'Resolution notes',
}

export function IncidentActionBar({
  incident,
  onChangeStatus,
}: {
  incident: Incident
  onChangeStatus: (status: IncidentStatus, reason?: string) => void
}) {
  const [pendingStatus, setPendingStatus] = useState<IncidentStatus | null>(null)
  const [reason, setReason] = useState('')

  function request(status: IncidentStatus) {
    if (REASON_REQUIRED[status]) {
      setPendingStatus(status)
      setReason('')
    } else {
      onChangeStatus(status)
    }
  }

  function confirm() {
    if (!pendingStatus) return
    onChangeStatus(pendingStatus, reason.trim() || undefined)
    setPendingStatus(null)
  }

  const isTerminal = incident.status === 'RESOLVED' || incident.status === 'FALSE_POSITIVE'

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={isTerminal || incident.status !== 'NEW'} onClick={() => request('ACKNOWLEDGED')}>
          Acknowledge
        </Button>
        <Button
          variant="secondary"
          disabled={isTerminal || incident.status === 'INVESTIGATING'}
          onClick={() => request('INVESTIGATING')}
        >
          Investigate
        </Button>
        <Button variant="primary" disabled={isTerminal || incident.status === 'VERIFIED'} onClick={() => request('VERIFIED')}>
          Mark Verified
        </Button>
        <Button variant="danger" disabled={isTerminal} onClick={() => request('FALSE_POSITIVE')}>
          False Positive
        </Button>
        <Button variant="outline" disabled={isTerminal} onClick={() => request('RESOLVED')}>
          Resolve
        </Button>
      </div>

      <Modal
        open={pendingStatus !== null}
        onClose={() => setPendingStatus(null)}
        title={pendingStatus ? (REASON_REQUIRED[pendingStatus] ?? '') : ''}
      >
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Add a short note for the audit log..."
          rows={3}
          className="w-full resize-none rounded border border-border-strong bg-panel-inset p-2 text-sm text-ink placeholder:text-ink-dim focus:border-low focus:outline-none"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPendingStatus(null)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={confirm}>
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  )
}
