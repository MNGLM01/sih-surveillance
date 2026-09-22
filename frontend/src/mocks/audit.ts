import { minutesAgo } from '@/mocks/time'
import type { AuditLogEntry } from '@/types/extended'

/** Seed history so the Audit page isn't empty on first load. Real entries
 * this session appends when you Acknowledge/Verify/etc. an incident are
 * tagged `source: 'live'` - they reflect real UI actions taken here, but the
 * backend has no operator/auth/audit system, so nothing here is persisted
 * server-side or attributable across sessions. See the page banner. */
export const MOCK_AUDIT_LOG: AuditLogEntry[] = [
  {
    id: 'a-388-verified',
    timestamp: minutesAgo(190),
    operator: 'Operator A',
    action: 'VERIFIED',
    targetType: 'INCIDENT',
    targetId: '388',
    cameraId: 'cam4',
    result: 'SUCCESS',
    source: 'demo',
  },
  {
    id: 'a-376-fp',
    timestamp: minutesAgo(300),
    operator: 'Operator A',
    action: 'FALSE_POSITIVE',
    targetType: 'INCIDENT',
    targetId: '376',
    cameraId: 'cam2',
    result: 'SUCCESS',
    reason: 'Maintenance crew, pre-authorized',
    source: 'demo',
  },
  {
    id: 'a-399-resolved',
    timestamp: minutesAgo(120),
    operator: 'Operator A',
    action: 'RESOLVED',
    targetType: 'INCIDENT',
    targetId: '399',
    cameraId: 'cam1',
    result: 'SUCCESS',
    source: 'demo',
  },
  {
    id: 'a-405-ack',
    timestamp: minutesAgo(40),
    operator: 'Operator A',
    action: 'ACKNOWLEDGED',
    targetType: 'INCIDENT',
    targetId: '405',
    cameraId: 'cam2',
    result: 'SUCCESS',
    source: 'demo',
  },
]
