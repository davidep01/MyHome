/**
 * Centralized, dependency-free notification sounds. Chimes are synthesized with
 * the Web Audio API (no audio assets to bundle), each oscillator stops itself so
 * there are no leaks on a 24/7 kiosk. Honors a global mute/volume, a per-event
 * cooldown (debounce for bursts), and the browser autoplay policy — audio is
 * unlocked on the first user interaction; until then nothing plays (the visual
 * alert is the fallback).
 */
export type SoundPreset = 'dingdong' | 'chime' | 'alert' | 'soft' | 'none'

const MUTE_KEY = 'myhome.sound.muted'
const VOL_KEY = 'myhome.sound.volume'

interface PlayOptions {
  volume?: number      // 0..1, multiplied by the global volume
  cooldownMs?: number  // suppress repeats of the same key within this window
  key?: string         // cooldown bucket (defaults to the preset)
}

// note = [frequency Hz, startOffset s, duration s]
const PRESETS: Record<Exclude<SoundPreset, 'none'>, [number, number, number][]> = {
  dingdong: [[659.25, 0, 0.5], [523.25, 0.28, 0.7]],
  chime: [[523.25, 0, 0.35], [659.25, 0.16, 0.35], [783.99, 0.32, 0.55]],
  alert: [[880, 0, 0.18], [880, 0.24, 0.18]],
  soft: [[587.33, 0, 0.6]],
}

class SoundManager {
  private ctx: AudioContext | null = null
  private unlocked = false
  private muted = false
  private volume = 0.7
  private lastPlay: Record<string, number> = {}

  constructor() {
    if (typeof window !== 'undefined') {
      this.muted = localStorage.getItem(MUTE_KEY) === 'true'
      const v = Number(localStorage.getItem(VOL_KEY))
      if (Number.isFinite(v) && v >= 0 && v <= 1) this.volume = v
    }
  }

  /** Attach one-shot listeners that unlock audio on the first interaction. */
  init() {
    if (typeof window === 'undefined' || this.unlocked) return
    const unlock = () => {
      this.ensureCtx()
      this.ctx?.resume().catch(() => {})
      this.unlocked = true
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
  }

  isMuted() { return this.muted }
  getVolume() { return this.volume }
  setMuted(m: boolean) { this.muted = m; localStorage.setItem(MUTE_KEY, String(m)) }
  setVolume(v: number) { this.volume = Math.min(1, Math.max(0, v)); localStorage.setItem(VOL_KEY, String(this.volume)) }

  private ensureCtx() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor) this.ctx = new Ctor()
    }
  }

  play(preset: SoundPreset, opts: PlayOptions = {}) {
    if (preset === 'none' || this.muted) return
    const key = opts.key ?? preset
    const now = Date.now()
    const cooldown = opts.cooldownMs ?? 3000
    if (now - (this.lastPlay[key] ?? 0) < cooldown) return
    this.lastPlay[key] = now

    this.ensureCtx()
    const ctx = this.ctx
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const gain = Math.min(1, Math.max(0, (opts.volume ?? 1) * this.volume))
    const t0 = ctx.currentTime
    for (const [freq, off, dur] of PRESETS[preset]) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + off
      env.gain.setValueAtTime(0, start)
      env.gain.linearRampToValueAtTime(gain * 0.9, start + 0.02)
      env.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(env).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + dur + 0.05) // self-cleanup
    }
  }
}

export const soundManager = new SoundManager()
