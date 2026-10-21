import confetti from 'canvas-confetti'
import { useAppStore } from '../stores/app-store'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return null
  if (!audioCtx) {
    audioCtx = new AudioContextClass()
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
  return audioCtx
}

export type SoundEffect = 'click' | 'ping' | 'tag' | 'warning' | 'countdown'

/**
 * Play a synthesized sound effect using Web Audio API (zero external assets).
 * Only plays if sound is enabled in preferences and device is not in silent mode.
 */
export function playSound(type: SoundEffect): void {
  const soundEnabled = useAppStore.getState().soundEnabled
  if (!soundEnabled) return

  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    if (type === 'click') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(800, now)
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.04)
      gain.gain.setValueAtTime(0.08, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.04)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.04)
    } else if (type === 'ping') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.09)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.09)
    } else if (type === 'tag') {
      // Dual tone chime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()
      osc1.type = 'sine'
      osc2.type = 'sine'
      osc1.frequency.setValueAtTime(523.25, now) // C5
      osc2.frequency.setValueAtTime(659.25, now + 0.06) // E5
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.2)
      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.08)
      osc2.start(now + 0.06)
      osc2.stop(now + 0.2)
    } else if (type === 'warning') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(440, now)
      osc.frequency.linearRampToValueAtTime(330, now + 0.12)
      gain.gain.setValueAtTime(0.09, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.12)
    } else if (type === 'countdown') {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(987.77, now) // B5
      gain.gain.setValueAtTime(0.06, now)
      gain.gain.linearRampToValueAtTime(0, now + 0.03)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.03)
    }
  } catch {
    /* AudioContext not permitted or muted */
  }
}

/**
 * Trigger haptic vibration patterns if supported and enabled.
 */
export function triggerHaptic(pattern: number | number[] = 25): void {
  const hapticsEnabled = useAppStore.getState().hapticsEnabled
  if (!hapticsEnabled) return
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Trigger celebratory victory confetti burst with fallback for reduced motion.
 */
export function fireWinnerConfetti(winner: 'hunters' | 'runners' = 'runners'): void {
  const reduceEffects = useAppStore.getState().reduceEffects
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduceEffects || prefersReduced) return

  const colors = winner === 'hunters'
    ? ['#FF3B3C', '#FF6B6C', '#FFFFFF', '#38BDF8']
    : ['#00FF89', '#38FF9F', '#FFFFFF', '#38BDF8']

  try {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.65 },
      colors,
      disableForReducedMotion: true,
    })
  } catch {
    /* canvas-confetti unsupported */
  }
}
