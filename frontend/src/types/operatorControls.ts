export type OperatorManualOptionKey =
  | 'virtualFenceIntrusion'
  | 'selectiveCameraRestricted'
  | 'anpr'
  | 'crossCameraDetection'
  | 'riskScore'

export interface OperatorManualOptionMeta {
  key: OperatorManualOptionKey
  label: string
  shortLabel: string
  description: string
  tag: string
}

export const OPERATOR_MANUAL_OPTIONS: OperatorManualOptionMeta[] = [
  {
    key: 'virtualFenceIntrusion',
    label: 'Virtual fence intrusion',
    shortLabel: 'Virtual Fence',
    description: 'Monitor perimeter fence lines and alert on unauthorized boundary crossings.',
    tag: 'FENCE',
  },
  {
    key: 'selectiveCameraRestricted',
    label: 'Make a selective camera to be restricted',
    shortLabel: 'Restricted Camera',
    description: 'Designate specific cameras as high-security restricted surveillance zones.',
    tag: 'RESTRICTED',
  },
  {
    key: 'anpr',
    label: 'ANPR',
    shortLabel: 'ANPR',
    description: 'Automatic Number Plate Recognition, plate tracking, and vehicle intelligence.',
    tag: 'ANPR',
  },
  {
    key: 'crossCameraDetection',
    label: 'Cross camera detection',
    shortLabel: 'Cross-Camera',
    description: 'Multi-camera track re-identification and object handover correlation.',
    tag: 'CROSS-CAM',
  },
  {
    key: 'riskScore',
    label: 'Risk score',
    shortLabel: 'Risk Score',
    description: 'Continuous risk assessment, behavioral threat scoring, and severity calculation.',
    tag: 'RISK',
  },
]

export const DEFAULT_OPERATOR_MANUAL_OPTIONS: Record<OperatorManualOptionKey, boolean> = {
  virtualFenceIntrusion: true,
  selectiveCameraRestricted: true,
  anpr: true,
  crossCameraDetection: true,
  riskScore: true,
}
