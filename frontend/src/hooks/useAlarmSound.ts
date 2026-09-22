import { useEffect, useRef, useState, useCallback } from 'react'
import type { Incident } from '@/types/domain'

const ALARM_STATUSES = new Set(['NEW', 'INVESTIGATING'])

export function useAlarmSound(incidents: Incident[]) {
  const [isMuted, setIsMuted] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [, setTick] = useState(0)

  // Periodic ticker so freshness checks re-evaluate every 500ms even if no new state events arrive
  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((t) => (t + 1) % 10000)
    }, 500)
    return () => window.clearInterval(timer)
  }, [])

  // Find all active, high or critical risk incidents where ONLY a PERSON is detected in the virtual fence or restricted zone
  const now = Date.now()
  const highRiskIncidents = incidents.filter((inc) => {
    // 1. Must be in active alert status (NEW or INVESTIGATING)
    if (!ALARM_STATUSES.has(inc.status)) return false

    // 2. Must be high or critical severity (danger)
    if (inc.severity !== 'HIGH' && inc.severity !== 'CRITICAL') return false

    // 3. User requirement: ONLY person detected triggers beep sound (vehicles do not)
    const isPerson = inc.objectClass?.toLowerCase() === 'person'
    if (!isPerson) return false

    // 4. Must be associated with virtual fence intrusion or restricted camera breach
    const hasFenceOrRestrictedReason =
      inc.reasons?.some((r) => /fence|restricted|zone intrusion/i.test(r)) ||
      inc.riskScore >= 90
    if (!hasFenceOrRestrictedReason) return false

    // 5. Active presence check: if person leaves the fence or camera view, reports cease.
    // Ensure incident was updated within the last 3.5 seconds.
    const updatedTime = new Date(inc.updatedAt).getTime()
    if (Number.isFinite(updatedTime) && now - updatedTime > 3500) {
      return false
    }

    return true
  })

  const shouldAlarm = highRiskIncidents.length > 0 && !isMuted

  // Initialize AudioContext safely
  const getOrCreateAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx()
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {})
    }
    return audioCtxRef.current
  }, [])

  // Single beep generator
  const playBeep = useCallback((freq = 880, duration = 0.22, volume = 0.8) => {
    try {
      const ctx = getOrCreateAudioContext()
      if (!ctx || ctx.state !== 'running') return

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      // Slight pitch ramp for high-urgency siren tone
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, ctx.currentTime + duration * 0.5)

      // Envelope: quick attack, sustained, fast decay
      gain.gain.setValueAtTime(0.001, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02)
      gain.gain.setValueAtTime(volume, ctx.currentTime + duration - 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + duration)
    } catch {
      // AudioContext unavailable or error
    }
  }, [getOrCreateAudioContext])

  // Resume on user interaction if blocked by browser policy
  useEffect(() => {
    const handleUserGesture = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {})
      }
    }
    window.addEventListener('click', handleUserGesture, { once: false })
    window.addEventListener('keydown', handleUserGesture, { once: false })
    return () => {
      window.removeEventListener('click', handleUserGesture)
      window.removeEventListener('keydown', handleUserGesture)
    }
  }, [])

  // Start / stop beep loop based on shouldAlarm
  useEffect(() => {
    if (shouldAlarm) {
      // Play immediately
      playBeep(920, 0.2, 0.85)

      let tick = 0
      intervalRef.current = window.setInterval(() => {
        tick++
        // Alternating loud dual frequency for danger siren
        const freq = tick % 2 === 0 ? 940 : 820
        playBeep(freq, 0.22, 0.85)
      }, 450)
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [shouldAlarm, playBeep])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev)
  }, [])

  const playTestBeep = useCallback(() => {
    playBeep(940, 0.25, 0.9)
  }, [playBeep])

  return {
    isAlarmActive: shouldAlarm,
    highRiskCount: highRiskIncidents.length,
    isMuted,
    toggleMute,
    setIsMuted,
    playTestBeep,
  }
}

