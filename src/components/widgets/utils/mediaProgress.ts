/**
 * Avanzamento locale della riproduzione: HA manda `media_position` misurata a
 * `media_position_updated_at`; mentre suona, la posizione reale avanza da sola.
 * Puro e testabile — la card lo richiama con un tick al secondo.
 */
export function mediaProgressPct(
  progress: { position: number; duration: number; updatedAt?: string; playing: boolean },
  now = Date.now(),
): number {
  const { position, duration, updatedAt, playing } = progress
  if (!Number.isFinite(duration) || duration <= 0) return 0
  const measuredAt = updatedAt ? Date.parse(updatedAt) : Number.NaN
  const elapsed = playing && Number.isFinite(measuredAt) ? Math.max(0, (now - measuredAt) / 1000) : 0
  const current = Math.max(0, Math.min(duration, position + elapsed))
  return Math.round((current / duration) * 1000) / 10
}
