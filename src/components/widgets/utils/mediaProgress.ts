export interface MediaPlaybackProgress {
  position: number
  duration: number
  updatedAt?: string
  playing: boolean
}

export function mediaPositionAt(progress: MediaPlaybackProgress, now = Date.now()): number {
  const updated = progress.updatedAt ? Date.parse(progress.updatedAt) : Number.NaN
  const elapsed = progress.playing && Number.isFinite(updated) ? Math.max(0, (now - updated) / 1_000) : 0
  return Math.min(progress.duration, Math.max(0, progress.position + elapsed))
}

export function formatMediaTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3_600)
  const minutes = Math.floor((safe % 3_600) / 60)
  const secs = safe % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`
}

/**
 * Avanzamento locale della riproduzione: HA manda `media_position` misurata a
 * `media_position_updated_at`; mentre suona, la posizione reale avanza da sola.
 * Puro e testabile — la card lo richiama con un tick al secondo.
 */
export function mediaProgressPct(
  progress: MediaPlaybackProgress,
  now = Date.now(),
): number {
  const { duration } = progress
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const current = mediaPositionAt(progress, now)
  return Math.round((current / duration) * 1000) / 10
}
