/**
 * Centralized, dependency-free notification sounds. Chimes are synthesized with
 * the Web Audio API (no audio assets to bundle), each oscillator stops itself so
 * there are no leaks on a 24/7 kiosk. Honors a global mute/volume, a per-event
 * cooldown (debounce for bursts), and the browser autoplay policy — audio is
 * unlocked on the first user interaction; until then nothing plays (the visual
 * alert is the fallback).
 */
export type SoundPreset = 'dingdong' | 'chime' | 'alert' | 'siren' | 'soft' | 'none'

const MUTE_KEY = 'myhome.sound.muted'
const VOL_KEY = 'myhome.sound.volume'

/** Starts immediately and returns an idempotent stop for overlay cleanup. */
export function startRepeatingSound(play: () => void, repeatMs: number): () => void {
  play()
  const timer = setInterval(play, repeatMs)
  return () => clearInterval(timer)
}

interface PlayOptions {
  volume?: number      // 0..1, multiplied by the global volume
  boost?: number       // perceptual gain compensation for urgent signals
  cooldownMs?: number  // suppress repeats of the same key within this window
  key?: string         // cooldown bucket (defaults to the preset)
  force?: boolean      // critical alarms bypass the user's notification mute
}

interface Tone {
  frequency: number
  endFrequency?: number
  offset: number
  duration: number
  level?: number
  wave?: OscillatorType
}

const PRESETS: Record<Exclude<SoundPreset, 'none'>, Tone[]> = {
  // Due battenti principali + armoniche: emerge meglio dagli speaker piccoli.
  dingdong: [
    { frequency: 783.99, offset: 0, duration: 0.48, level: 0.82, wave: 'triangle' },
    { frequency: 1567.98, offset: 0, duration: 0.32, level: 0.18 },
    { frequency: 659.25, offset: 0.3, duration: 0.78, level: 0.9, wave: 'triangle' },
    { frequency: 1318.5, offset: 0.3, duration: 0.5, level: 0.16 },
  ],
  chime: [
    { frequency: 523.25, offset: 0, duration: 0.35 },
    { frequency: 659.25, offset: 0.16, duration: 0.35 },
    { frequency: 783.99, offset: 0.32, duration: 0.55 },
  ],
  alert: [
    { frequency: 920, offset: 0, duration: 0.22, wave: 'square' },
    { frequency: 690, offset: 0.27, duration: 0.22, wave: 'square' },
    { frequency: 920, offset: 0.54, duration: 0.22, wave: 'square' },
    { frequency: 690, offset: 0.81, duration: 0.3, wave: 'square' },
  ],
  // Sweep alternati senza pause percettibili: volutamente insistente.
  siren: [
    { frequency: 720, endFrequency: 1180, offset: 0, duration: 0.48, level: 0.72, wave: 'sawtooth' },
    { frequency: 1180, endFrequency: 720, offset: 0.48, duration: 0.48, level: 0.72, wave: 'sawtooth' },
    { frequency: 720, endFrequency: 1180, offset: 0.96, duration: 0.48, level: 0.72, wave: 'sawtooth' },
    { frequency: 1180, endFrequency: 720, offset: 1.44, duration: 0.48, level: 0.72, wave: 'sawtooth' },
    { frequency: 360, endFrequency: 590, offset: 0, duration: 0.96, level: 0.22, wave: 'square' },
    { frequency: 590, endFrequency: 360, offset: 0.96, duration: 0.96, level: 0.22, wave: 'square' },
  ],
  soft: [{ frequency: 587.33, offset: 0, duration: 0.6 }],
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
    if (preset === 'none' || (this.muted && !opts.force)) return
    const key = opts.key ?? preset
    const now = Date.now()
    const cooldown = opts.cooldownMs ?? 3000
    if (now - (this.lastPlay[key] ?? 0) < cooldown) return
    this.lastPlay[key] = now

    this.ensureCtx()
    const ctx = this.ctx
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const gain = Math.min(1, Math.max(0, (opts.volume ?? 1) * this.volume * (opts.boost ?? 1)))
    const t0 = ctx.currentTime
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.setValueAtTime(-16, t0)
    limiter.knee.setValueAtTime(8, t0)
    limiter.ratio.setValueAtTime(10, t0)
    limiter.attack.setValueAtTime(0.003, t0)
    limiter.release.setValueAtTime(0.18, t0)
    limiter.connect(ctx.destination)

    for (const tone of PRESETS[preset]) {
      const osc = ctx.createOscillator()
      const env = ctx.createGain()
      osc.type = tone.wave ?? 'sine'
      const start = t0 + tone.offset
      osc.frequency.setValueAtTime(tone.frequency, start)
      if (tone.endFrequency !== undefined) {
        osc.frequency.linearRampToValueAtTime(tone.endFrequency, start + tone.duration)
      }
      env.gain.setValueAtTime(0, start)
      env.gain.linearRampToValueAtTime(gain * (tone.level ?? 0.82), start + 0.012)
      env.gain.setValueAtTime(gain * (tone.level ?? 0.82), start + Math.max(0.012, tone.duration - 0.045))
      env.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration)
      osc.connect(env).connect(limiter)
      osc.start(start)
      osc.stop(start + tone.duration + 0.05) // self-cleanup
    }
    const tailMs = Math.max(...PRESETS[preset].map((tone) => tone.offset + tone.duration)) * 1_000 + 120
    window.setTimeout(() => limiter.disconnect(), tailMs)
  }
}

export const soundManager = new SoundManager()
