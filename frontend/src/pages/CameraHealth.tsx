import { useEffect, useState } from 'react'

import { getSystemHealth } from '@/api/system'
import { CameraStatusBadge, Card, CardContent, CardHeader, DataSourceBadge } from '@/components/ui'
import { Gauge } from '@/components/ui/Gauge'
import { Table, TableBody, TableHead, Td, Th, Tr } from '@/components/ui/Table'
import { useSurveillance } from '@/store/SurveillanceProvider'
import type { SystemHealth } from '@/types/extended'

export default function CameraHealth() {
  const { cameras } = useSurveillance()
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [source, setSource] = useState<'live' | 'demo'>('demo')

  useEffect(() => {
    if (cameras.length === 0) return
    getSystemHealth(cameras).then((res) => {
      setHealth(res.data)
      setSource(res.source)
    })
  }, [cameras])

  if (!health) return null

  return (
    <div className="space-y-3 p-3">
      <Card>
        <CardHeader title="Camera Health" subtitle={`${health.cameras.length} cameras`} action={<DataSourceBadge source={source} />} />
        <Table className="px-2 pb-2">
          <TableHead>
            <Th>Camera</Th>
            <Th>Status</Th>
            <Th>FPS</Th>
            <Th>Latency</Th>
            <Th>Uptime</Th>
            <Th>Reconnects</Th>
          </TableHead>
          <TableBody>
            {health.cameras.map((cam) => (
              <Tr key={cam.cameraId}>
                <Td className="font-medium">{cam.cameraName}</Td>
                <Td>
                  <CameraStatusBadge status={cam.status} />
                </Td>
                <Td className="font-mono">{cam.fps ?? '-'}</Td>
                <Td className="font-mono">{cam.latencyMs !== undefined ? `${cam.latencyMs}ms` : '-'}</Td>
                <Td className="font-mono">{cam.uptimePct !== undefined ? `${cam.uptimePct}%` : '-'}</Td>
                <Td className="font-mono">{cam.reconnectCount ?? '-'}</Td>
              </Tr>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="System" subtitle="Host running the detection pipeline" action={<DataSourceBadge source="demo" />} />
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Gauge label="GPU" pct={health.gpuPct ?? 0} />
          <Gauge label="CPU" pct={health.cpuPct ?? 0} />
          <Gauge label="RAM" pct={health.ramPct ?? 0} />
          <Gauge label="Storage" pct={health.storagePct ?? 0} />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold tracking-wide text-ink-muted uppercase">Network</span>
              <span className="font-mono text-ink">{health.networkMbps ?? 0} Mbps</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
