import {
  Activity,
  Car,
  ChevronDown,
  GitBranch,
  Lock,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Video,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import { useSurveillance } from '@/store/SurveillanceProvider'
import {
  OPERATOR_MANUAL_OPTIONS,
  type OperatorManualOptionKey,
} from '@/types/operatorControls'

interface OperatorManualDropdownProps {
  className?: string
  align?: 'left' | 'right'
  compact?: boolean
}

export function OperatorManualDropdown({
  className,
  align = 'right',
  compact = false,
}: OperatorManualDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    operatorOptions,
    toggleOperatorOption,
    selectAllOperatorOptions,
    isAllOptionsSelected,
    selectedOptionCount,
    restrictedCameraIds,
    toggleRestrictedCamera,
    cameras,
    operatorName,
  } = useSurveillance()

  // Close on click outside or Escape
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const totalOptions = OPERATOR_MANUAL_OPTIONS.length
  const isIndeterminate = selectedOptionCount > 0 && selectedOptionCount < totalOptions

  const handleSelectAllToggle = () => {
    if (isAllOptionsSelected) {
      selectAllOperatorOptions(false)
    } else {
      selectAllOperatorOptions(true)
    }
  }

  const getOptionIcon = (key: OperatorManualOptionKey) => {
    switch (key) {
      case 'virtualFenceIntrusion':
        return <ShieldAlert className="size-4 text-low" />
      case 'selectiveCameraRestricted':
        return <Lock className="size-4 text-critical-ink" />
      case 'anpr':
        return <Car className="size-4 text-live" />
      case 'crossCameraDetection':
        return <GitBranch className="size-4 text-medium-ink" />
      case 'riskScore':
        return <Activity className="size-4 text-high-ink" />
    }
  }

  return (
    <div className={cn('relative inline-block text-left', className)} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={cn(
          'group flex items-center gap-2 rounded border border-border-strong bg-panel-raised transition-all',
          compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs',
          isOpen
            ? 'border-low bg-panel-raised ring-1 ring-low/30 shadow-lg shadow-low/10'
            : 'hover:border-ink-dim hover:bg-border/40',
        )}
      >
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="size-3.5 text-low transition-transform group-hover:scale-110" />
          <span className="font-semibold tracking-wide text-ink">Operator Controls</span>
        </div>

        <span
          className={cn(
            'rounded px-1.5 py-0.2 font-mono text-[10px] font-bold transition-colors',
            isAllOptionsSelected
              ? 'bg-live/15 text-live border border-live/30'
              : selectedOptionCount > 0
                ? 'bg-low/15 text-low border border-low/30'
                : 'bg-critical/15 text-critical-ink border border-critical/30',
          )}
        >
          {isAllOptionsSelected ? '5/5 ACTIVE' : `${selectedOptionCount}/5 ACTIVE`}
        </span>

        <ChevronDown
          className={cn(
            'size-3 text-ink-muted transition-transform duration-200',
            isOpen && 'rotate-180 text-low',
          )}
        />
      </button>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-full z-50 mt-2 w-84 sm:w-96 rounded-lg border border-border-strong bg-panel/95 shadow-2xl backdrop-blur-md transition-all animate-in fade-in zoom-in-95 duration-150',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border bg-panel-raised/80 px-4 py-3 rounded-t-lg">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider text-ink uppercase">
                  Operator Manual Modes
                </span>
                <span className="rounded bg-low/20 px-1.5 py-0.2 font-mono text-[9px] font-bold text-low border border-low/30">
                  MANUAL
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Multi-select active surveillance modules & restrictions
              </p>
            </div>
            <span className="font-mono text-[10px] text-ink-dim">
              Op: {operatorName}
            </span>
          </div>

          {/* Body */}
          <div className="max-h-[min(70vh,520px)] overflow-y-auto p-2 space-y-1">
            {/* "Select all" row */}
            <div
              onClick={handleSelectAllToggle}
              className={cn(
                'flex cursor-pointer items-center justify-between rounded-md border p-2.5 transition-colors',
                isAllOptionsSelected
                  ? 'border-live/40 bg-live/10 hover:bg-live/15'
                  : isIndeterminate
                    ? 'border-low/40 bg-low/10 hover:bg-low/15'
                    : 'border-border bg-panel-raised hover:border-border-strong hover:bg-border/30',
              )}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={isAllOptionsSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isIndeterminate
                  }}
                  onChange={() => {}} // Handled by container click
                  className="size-4 rounded border-border-strong accent-emerald-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-ink tracking-wide">
                    Select all
                  </span>
                  <p className="text-[10px] text-ink-muted">
                    Enable or disable all operator surveillance capabilities
                  </p>
                </div>
              </div>
              <span className="font-mono text-[10px] font-semibold text-ink-dim">
                {selectedOptionCount} / {totalOptions}
              </span>
            </div>

            <div className="my-1.5 border-t border-border" />

            {/* Individual Options List */}
            {OPERATOR_MANUAL_OPTIONS.map((opt) => {
              const isSelected = operatorOptions[opt.key]
              const isRestrictedCamOption = opt.key === 'selectiveCameraRestricted'

              return (
                <div key={opt.key} className="space-y-1">
                  <div
                    onClick={() => toggleOperatorOption(opt.key)}
                    className={cn(
                      'group flex cursor-pointer items-start justify-between rounded-md border p-2.5 transition-all',
                      isSelected
                        ? 'border-border-strong bg-panel-raised hover:border-low/60 hover:bg-low/5'
                        : 'border-border/60 bg-panel/50 opacity-75 hover:opacity-100 hover:border-border-strong',
                    )}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 pr-2">
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by container click
                          className="size-4 rounded border-border-strong accent-blue-500 cursor-pointer"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {getOptionIcon(opt.key)}
                          <span className="truncate text-xs font-semibold text-ink">
                            {opt.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10.5px] leading-tight text-ink-muted">
                          {opt.description}
                        </p>
                      </div>
                    </div>

                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider',
                        isSelected
                          ? 'bg-low/15 text-low border border-low/30'
                          : 'bg-panel-inset text-ink-dim border border-border',
                      )}
                    >
                      {opt.tag}
                    </span>
                  </div>

                  {/* Selective camera picker when "Make a selective camera to be restricted" is selected */}
                  {isRestrictedCamOption && isSelected && (
                    <div className="ml-6 mr-1 rounded-md border border-critical/30 bg-critical/5 p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-critical-ink">
                          <Lock className="size-3" />
                          <span>Designated Restricted Cameras:</span>
                        </div>
                        <span className="font-mono text-[10px] text-ink-dim">
                          {restrictedCameraIds.length} of {cameras.length} restricted
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        {cameras.map((cam) => {
                          const isRestricted = restrictedCameraIds.includes(cam.id)
                          return (
                            <button
                              key={cam.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleRestrictedCamera(cam.id)
                              }}
                              className={cn(
                                'flex items-center justify-between gap-1 rounded border px-2 py-1 text-left transition-colors text-[11px]',
                                isRestricted
                                  ? 'border-critical/60 bg-critical/20 text-critical-ink font-semibold'
                                  : 'border-border bg-panel-raised text-ink-muted hover:border-border-strong hover:text-ink',
                              )}
                            >
                              <span className="flex items-center gap-1 truncate">
                                <Video className="size-3 shrink-0" />
                                <span className="truncate">{cam.name || cam.id}</span>
                              </span>
                              <span className="font-mono text-[9px]">
                                {isRestricted ? 'LOCKED' : 'ALLOW'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-[9.5px] text-ink-dim italic">
                        Click camera to mark/unmark as restricted security perimeter.
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer Bar */}
          <div className="flex items-center justify-between border-t border-border bg-panel-raised/80 px-3 py-2 rounded-b-lg">
            <span className="font-mono text-[10px] text-ink-dim">
              {selectedOptionCount} of {totalOptions} manual options enabled
            </span>

            <button
              type="button"
              onClick={() => {
                selectAllOperatorOptions(true)
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-ink hover:bg-panel-inset transition-colors"
            >
              <RotateCcw className="size-3" />
              <span>Reset all</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
