import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Card, CardContent, CardHeader, DataSourceBadge, EmptyState, Select, SeverityBadge } from '@/components/ui'
import { Table, TableBody, TableHead, Td, Th, Tr } from '@/components/ui/Table'
import { formatDateTime, formatIncidentId } from '@/lib/format'
import { classifyIncidentType, INCIDENT_TYPES } from '@/lib/incidentType'
import { SEVERITIES } from '@/lib/severity'
import { ROUTES } from '@/routes'
import { useSurveillance } from '@/store/SurveillanceProvider'
import { INCIDENT_STATUSES } from '@/types/domain'
import { ShieldOff } from 'lucide-react'

const ALL = 'ALL'

export default function Incidents() {
  const navigate = useNavigate()
  const { incidents, incidentsSource, cameras } = useSurveillance()

  const [severity, setSeverity] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [cameraId, setCameraId] = useState(ALL)
  const [type, setType] = useState(ALL)

  const filtered = useMemo(() => {
    return incidents
      .filter((i) => severity === ALL || i.severity === severity)
      .filter((i) => status === ALL || i.status === status)
      .filter((i) => cameraId === ALL || i.cameraId === cameraId)
      .filter((i) => type === ALL || classifyIncidentType(i) === type)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [incidents, severity, status, cameraId, type])

  return (
    <div className="space-y-3 p-3">
      <Card>
        <CardHeader title="Incidents" subtitle={`${filtered.length} of ${incidents.length}`} action={<DataSourceBadge source={incidentsSource} />} />
        <CardContent className="flex flex-wrap gap-2">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value={ALL}>All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value={ALL}>All statuses</option>
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </Select>
          <Select value={cameraId} onChange={(e) => setCameraId(e.target.value)}>
            <option value={ALL}>All cameras</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value={ALL}>All types</option>
            {INCIDENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </CardContent>

        {filtered.length === 0 ? (
          <EmptyState icon={ShieldOff} title="No incidents match these filters" />
        ) : (
          <Table className="px-1 pb-2">
            <TableHead>
              <Th>ID</Th>
              <Th>Severity</Th>
              <Th>Camera</Th>
              <Th>Object</Th>
              <Th>Type</Th>
              <Th>Risk</Th>
              <Th>Time</Th>
              <Th>Status</Th>
            </TableHead>
            <TableBody>
              {filtered.map((incident) => (
                <Tr key={incident.id} onClick={() => navigate(ROUTES.incidentDetail(incident.id))}>
                  <Td className="font-mono">{formatIncidentId(incident.id)}</Td>
                  <Td>
                    <SeverityBadge severity={incident.severity} />
                  </Td>
                  <Td>{incident.cameraName}</Td>
                  <Td className="font-mono text-xs">{incident.trackId}</Td>
                  <Td>{classifyIncidentType(incident)}</Td>
                  <Td className="font-mono">{incident.riskScore}</Td>
                  <Td className="font-mono text-xs">{formatDateTime(incident.createdAt)}</Td>
                  <Td>
                    <span className="text-xs font-semibold tracking-wide text-ink-muted">{incident.status.replace('_', ' ')}</span>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
