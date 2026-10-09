import type { EventOf, ForecastPoint } from '../domain/contracts.js'

/**
 * Previsioni con provenienza e validità (specifica §14).
 *
 * Lo stato corrente di `weather.*` NON è una previsione: senza un forecast
 * strutturato e valido il core dice "previsioni non disponibili". Ottenere il
 * forecast da HA richiederebbe `weather.get_forecasts`, cioè una chiamata a
 * servizio, vietata in questa release: la sorgente reale è quindi l'adapter
 * di lettura OpenWeather già esistente nel backend (uso di Internet
 * dichiarato e opt-in) oppure le fixture.
 */

export interface ForecastSnapshot {
  source_id: string
  issued_at: string | null
  fetched_at: string
  expires_at: string
  points: ForecastPoint[]
}

export interface ForecastReadPort {
  readonly id: string
  /** Legge il forecast corrente; null se la fonte non ne ha uno. Mai inventato. */
  read(now: Date): Promise<ForecastSnapshot | null>
}

/** Nessuna fonte di previsioni configurata. */
export const noForecast: ForecastReadPort = {
  id: 'none',
  read: async () => null,
}

export type ForecastValidity = 'valid' | 'expired' | 'missing'

export function forecastValidity(forecast: ForecastSnapshot | null, now: Date, ttlMinutes: number): ForecastValidity {
  if (!forecast) return 'missing'
  const fetched = Date.parse(forecast.fetched_at)
  if (now.getTime() > Date.parse(forecast.expires_at)) return 'expired'
  if (now.getTime() - fetched > ttlMinutes * 60_000) return 'expired'
  return 'valid'
}

export function snapshotFromEvent(event: EventOf<'forecast.updated'>): ForecastSnapshot {
  return {
    source_id: event.payload.forecast_source_id,
    issued_at: event.payload.issued_at,
    fetched_at: event.payload.fetched_at,
    expires_at: event.payload.expires_at,
    points: event.payload.points,
  }
}

/** Soglie esplicite per "pioggia rilevante"; isteresi gestita dall'agente. */
export const RAIN_PROBABILITY_THRESHOLD = 0.5
export const RAIN_MM_THRESHOLD = 0.5

export interface RainSpan { from: string; until: string; resolution: ForecastPoint['resolution']; evidence: string }

/**
 * Intervalli con pioggia rilevante dentro [from, until). Probabilità e
 * millimetri sono grandezze diverse: si valutano separatamente, mai sommate.
 * Un punto giornaliero dice "in quella giornata", non un'ora precisa (T31).
 */
export function rainSpans(points: ForecastPoint[], from: Date, until: Date): RainSpan[] {
  const spans: RainSpan[] = []
  for (const point of points) {
    const start = Date.parse(point.from)
    const end = Date.parse(point.until)
    if (end <= from.getTime() || start >= until.getTime()) continue
    const byProbability = point.rain_probability !== null && point.rain_probability >= RAIN_PROBABILITY_THRESHOLD
    const byAmount = point.precipitation_mm !== null && point.precipitation_mm >= RAIN_MM_THRESHOLD
    if (!byProbability && !byAmount) continue
    const evidence = byProbability
      ? `probabilità ${Math.round((point.rain_probability ?? 0) * 100)}%`
      : `${point.precipitation_mm} mm previsti`
    spans.push({ from: point.from, until: point.until, resolution: point.resolution, evidence })
  }
  return spans
}

/** Converte unità esterne nella forma del contratto (km/h, °C, 0..1). */
export function normalizeWind(value: number | null | undefined, unit: 'm/s' | 'km/h' | 'mph'): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null
  if (unit === 'm/s') return Math.round(value * 3.6 * 10) / 10
  if (unit === 'mph') return Math.round(value * 1.609344 * 10) / 10
  return value
}

export function normalizeProbability(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const p = value > 1 ? value / 100 : value
  return p < 0 || p > 1 ? null : p
}
