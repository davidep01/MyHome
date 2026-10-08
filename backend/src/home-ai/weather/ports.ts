import type { ForecastPoint } from '../domain/contracts.js'
import { normalizeProbability, normalizeWind, type ForecastReadPort, type ForecastSnapshot } from './forecast.js'

/**
 * Adapter di previsione. Ogni punto dichiara fonte, intervallo e risoluzione;
 * un campo assente resta `null` ("non disponibile"), mai stimato.
 */

/** Previsione SINTETICA per la demo: pioggia fra +2h e +3h, dati orari. */
export const demoForecastPort: ForecastReadPort = {
  id: 'demo',
  async read(now: Date): Promise<ForecastSnapshot> {
    const hour = 3_600_000
    const base = Math.floor(now.getTime() / hour) * hour
    const points: ForecastPoint[] = Array.from({ length: 12 }, (_, i) => ({
      from: new Date(base + i * hour).toISOString(),
      until: new Date(base + (i + 1) * hour).toISOString(),
      resolution: 'hourly',
      condition: i === 2 || i === 3 ? 'rainy' : 'cloudy',
      rain_probability: i === 2 || i === 3 ? 0.75 : 0.1,
      precipitation_mm: i === 2 || i === 3 ? 1.6 : 0,
      temperature_c: 16,
      wind_kmh: 9,
    }))
    return {
      source_id: 'demo-forecast',
      issued_at: new Date(now.getTime() - 30 * 60_000).toISOString(),
      fetched_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 3 * hour).toISOString(),
      points,
    }
  },
}

export interface OpenWeatherItem { dt: number; main: { temp_min: number; temp_max: number }; weather: { description: string }[]; pop?: number; rain3h?: number; wind?: number }

/**
 * Previsione a 3 ore dell'adapter OpenWeather già presente nel backend.
 * Uso di Internet dichiarato e opt-in (`external_network_enabled`). I punti
 * coprono 3 ore: risoluzione `other`, mai spacciata per oraria.
 */
export function openWeatherPort(reader: () => Promise<{ fetchedAt: string; items: OpenWeatherItem[] } | null>, ttlMinutes: number): ForecastReadPort {
  return {
    id: 'openweather',
    async read(): Promise<ForecastSnapshot | null> {
      const data = await reader()
      if (!data || !data.items.length) return null
      const fetched = Date.parse(data.fetchedAt)
      const points: ForecastPoint[] = data.items.slice(0, 40).map((item) => ({
        from: new Date(item.dt * 1_000).toISOString(),
        until: new Date(item.dt * 1_000 + 3 * 3_600_000).toISOString(),
        resolution: 'other',
        condition: item.weather[0]?.description?.slice(0, 64) ?? null,
        rain_probability: normalizeProbability(item.pop),
        precipitation_mm: item.rain3h ?? null,
        temperature_c: Number.isFinite(item.main.temp_max) ? Math.round(((item.main.temp_min + item.main.temp_max) / 2) * 10) / 10 : null,
        wind_kmh: normalizeWind(item.wind, 'm/s'),
      }))
      return {
        source_id: 'openweather',
        issued_at: null,
        fetched_at: data.fetchedAt,
        expires_at: new Date(fetched + ttlMinutes * 60_000).toISOString(),
        points,
      }
    },
  }
}
