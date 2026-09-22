import { Info } from 'lucide-react'

import { Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { Table, TableBody, TableHead, Td, Th, Tr } from '@/components/ui/Table'
import { formatDateTime, formatIncidentId } from '@/lib/format'
import { useSurveillance } from '@/store/SurveillanceProvider'

export default function Audit() {
  const { auditLog } = useSurveillance()

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-start gap-2 rounded-md border border-border bg-panel-raised p-3 text-xs text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-dim" aria-hidden />
        <p>
          The backend has no operator/auth/audit system (no login, no multi-operator identity). Entries tagged{' '}
          <DataSourceBadge source="live" className="mx-1 inline-flex align-middle" /> are real actions taken in this browser session;{' '}
          <DataSourceBadge source="demo" className="mx-1 inline-flex align-middle" /> entries are seed history for the demo. Nothing
          here is persisted server-side or attributable across sessions.
        </p>
      </div>

      <Card>
        <CardHeader title="Audit Log" subtitle={`${auditLog.length} entries`} />
        <Table className="px-2 pb-2">
          <TableHead>
            <Th>Time</Th>
            <Th>Operator</Th>
            <Th>Action</Th>
            <Th>Target</Th>
            <Th>Camera</Th>
            <Th>Result</Th>
            <Th>Source</Th>
          </TableHead>
          <TableBody>
            {auditLog.map((entry) => (
              <Tr key={entry.id}>
                <Td className="font-mono text-xs">{formatDateTime(entry.timestamp)}</Td>
                <Td>{entry.operator}</Td>
                <Td className="font-semibold">{entry.action.replace('_', ' ')}</Td>
                <Td className="font-mono text-xs">
                  {entry.targetType === 'INCIDENT' || entry.targetType === 'EVIDENCE' ? formatIncidentId(entry.targetId) : entry.targetId}
                </Td>
                <Td>{entry.cameraId ?? '-'}</Td>
                <Td className={entry.result === 'SUCCESS' ? 'text-live' : 'text-critical-ink'}>{entry.result}</Td>
                <Td>
                  <DataSourceBadge source={entry.source} />
                </Td>
              </Tr>
            ))}
          </TableBody>
        </Table>
        {auditLog.length === 0 && <CardContent className="text-center text-sm text-ink-dim">No audit entries yet.</CardContent>}
      </Card>
    </div>
  )
}
