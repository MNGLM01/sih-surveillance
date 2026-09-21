/**
 * UI-level concepts the backend does not currently implement or expose.
 * Every value of this shape that reaches the screen must travel with a
 * `DataSource` tag (see `lib/dataSource.ts`) so the UI never implies a
 * capability - ANPR, cross-camera Re-ID, system telemetry, audit/auth - that
 * doesn't exist yet.
 */
import type { CameraStatus, Severity } from '@/types/domain'
import type { DataSource } from '@/types/dataSource'

export type { DataSource }

export interface PlateSighting {
  timestamp: string
  cameraId: string
  cameraName: string
}

export interface Vehicle {
  id: string
  plate: string
  vehicleClass: string
  confidence: number
  firstSeen: string
  lastSeen: string
  watchlistMatch: boolean
  sightings: PlateSighting[]
}

export interface CameraHealth {
  cameraId: string
  cameraName: string
  status: CameraStatus
  fps?: number
  latencyMs?: number
  uptimePct?: number
  reconnectCount?: number
  lastFrameAt?: string
}

export interface SystemHealth {
  gpuPct?: number
  cpuPct?: number
  ramPct?: number
  storagePct?: number
  networkMbps?: number
  cameras: CameraHealth[]
}

export type AuditActionType =
  | 'ACKNOWLEDGED'
  | 'INVESTIGATING'
  | 'VERIFIED'
  | 'FALSE_POSITIVE'
  | 'RESOLVED'
  | 'VIEWED_EVIDENCE'
  | 'RESTARTED_CAMERA'

export interface AuditLogEntry {
  id: string
  timestamp: string
  operator: string
  action: AuditActionType
  targetType: 'INCIDENT' | 'EVIDENCE' | 'CAMERA'
  targetId: string
  cameraId?: string
  result: 'SUCCESS' | 'FAILED'
  reason?: string
  source: DataSource
}

export type AIInsightTone = 'warning' | 'positive' | 'info'

export interface AIInsight {
  id: string
  tone: AIInsightTone
  text: string
  source: DataSource
}

export interface AnalyticsSummary {
  detectionsToday: number
  eventsToday: number
  highRiskIncidentsToday: number
  verifiedIncidentsToday: number
  incidentsByHour: { hour: number; count: number }[]
  incidentsByType: { type: string; count: number }[]
  cameraActivity: { cameraId: string; cameraName: string; count: number }[]
  riskDistribution: Record<Severity, number>
  source: DataSource
}
