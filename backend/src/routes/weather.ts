import { Hono, type Context } from 'hono'
import { db } from '../db/client.js'
import {
  BoundedTtlCache,
  FixedWindowRateLimiter,
  OutboundRequestError,
  containsControlCharacters,
  decodeJsonResponse,
  fetchWithLimits,
  rateLimitResponse,
} from '../lib/request-safety.js'
import { validProviderKey } from '../lib/integration-config.js'

const BASE = 'https://api.openweathermap.org/data/2.5'
const WEATHER_TTL_MS = 10 * 60 * 1_000
const WEATHER_TIMEOUT_MS = 7_000
const MAX_WEATHER_BYTES = 512_000

interface OpenWeatherCurrent {
  main: { temp: number; feels_like: number; humidity: number }
  weather: { description: string; icon: string }[]
  wind: { speed: number }
  name: string
}

interface OpenWeatherForecastItem {
  dt: number
  main: { temp_min: number; temp_max: number }
  weather: { description: string; icon: string }[]
}

interface OpenWeatherForecast {
  list: OpenWeatherForecastItem[]
}

class WeatherConfigurationError extends Error {}
class WeatherProviderError extends Error {
  constructor(readonly status: number) {
    super('weather_provider')
  }
}

export const weatherRouter = new Hono()
const weatherCache = new BoundedTtlCache<unknown>(16)
const pendingWeather = new Map<string, Promise<unknown>>()
const weatherRateLimiter = new FixedWindowRateLimiter(60, 5 * 60 * 1_000)

async function configuredWeatherCity(): Promise<string> {
  const raw = (await db.read()).config.weatherCity || process.env.WEATHER_CITY || 'Milan,IT'
  if (typeof raw !== 'string') throw new WeatherConfigurationError()
  const city = raw.trim()
  if (
    city.length < 2
    || city.length > 100
    || containsControlCharacters(city)
    || !/[\p{L}\p{N}]/u.test(city)
  ) throw new WeatherConfigurationError()
  return city
}

function configuredKey(): string {
  const key = validProviderKey(process.env.OPENWEATHER_API_KEY, 256)
  if (!key) throw new WeatherConfigurationError()
  return key
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function safeLabel(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' || value.length > maxLength || containsControlCharacters(value)) return null
  return value.trim()
}

function parseWeather(value: unknown): { description: string; icon: string }[] | null {
  if (!Array.isArray(value) || value.length > 10) return null
  const parsed: { description: string; icon: string }[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const description = safeLabel(item.description, 160)
    const icon = safeLabel(item.icon, 10)
    if (description === null || icon === null || !/^[0-9]{2}[dn]$/.test(icon)) return null
    parsed.push({ description, icon })
  }
  return parsed
}

function parseCurrent(value: unknown): OpenWeatherCurrent {
  if (!isRecord(value) || !isRecord(value.main) || !isRecord(value.wind)) {
    throw new OutboundRequestError('invalid_response')
  }
  const weather = parseWeather(value.weather)
  const name = safeLabel(value.name, 100)
  if (
    !finiteNumber(value.main.temp, -100, 100)
    || !finiteNumber(value.main.feels_like, -120, 120)
    || !finiteNumber(value.main.humidity, 0, 100)
    || !finiteNumber(value.wind.speed, 0, 250)
    || !weather
    || name === null
  ) throw new OutboundRequestError('invalid_response')
  return {
    main: {
      temp: value.main.temp,
      feels_like: value.main.feels_like,
      humidity: value.main.humidity,
    },
    weather,
    wind: { speed: value.wind.speed },
    name,
  }
}

function parseForecast(value: unknown): OpenWeatherForecast {
  if (!isRecord(value) || !Array.isArray(value.list) || value.list.length > 80) {
    throw new OutboundRequestError('invalid_response')
  }
  const list = value.list.map((item): OpenWeatherForecastItem => {
    if (!isRecord(item) || !isRecord(item.main)) throw new OutboundRequestError('invalid_response')
    const weather = parseWeather(item.weather)
    if (
      !finiteNumber(item.dt, 1, 10_000_000_000)
      || !finiteNumber(item.main.temp_min, -120, 120)
      || !finiteNumber(item.main.temp_max, -120, 120)
      || !weather
    ) throw new OutboundRequestError('invalid_response')
    return {
      dt: item.dt,
      main: { temp_min: item.main.temp_min, temp_max: item.main.temp_max },
      weather,
    }
  })
  return { list }
}

async function fetchWeather(path: '/weather', city: string): Promise<OpenWeatherCurrent>
async function fetchWeather(path: '/forecast', city: string): Promise<OpenWeatherForecast>
async function fetchWeather(path: '/weather' | '/forecast', city: string): Promise<OpenWeatherCurrent | OpenWeatherForecast> {
  const cacheKey = `${path}|${city.toLocaleLowerCase('it')}`
  const cached = weatherCache.get(cacheKey)
  if (cached) return cached as OpenWeatherCurrent | OpenWeatherForecast
  const pending = pendingWeather.get(cacheKey)
  if (pending) return pending as Promise<OpenWeatherCurrent | OpenWeatherForecast>
  if (pendingWeather.size >= 16) throw new WeatherProviderError(503)

  const task = (async () => {
    const url = new URL(`${BASE}${path}`)
    url.searchParams.set('q', city)
    url.searchParams.set('appid', configuredKey())
    url.searchParams.set('units', 'metric')
    url.searchParams.set('lang', 'it')
    const { response, bytes } = await fetchWithLimits(
      url,
      { method: 'GET', headers: { Accept: 'application/json' } },
      { timeoutMs: WEATHER_TIMEOUT_MS, maxBytes: MAX_WEATHER_BYTES },
    )
    if (!response.ok) throw new WeatherProviderError(response.status)
    const raw = decodeJsonResponse(bytes)
    const body = path === '/weather' ? parseCurrent(raw) : parseForecast(raw)
    weatherCache.set(cacheKey, body, WEATHER_TTL_MS)
    return body
  })().finally(() => pendingWeather.delete(cacheKey))

  pendingWeather.set(cacheKey, task)
  return task
}

function routeError(c: Context, error: unknown) {
  if (error instanceof WeatherConfigurationError) {
    return c.json({ error: 'Configurazione meteo non valida o chiave assente' }, 503)
  }
  if (error instanceof OutboundRequestError && error.reason === 'timeout') {
    return c.json({ error: 'Il servizio meteo non ha risposto in tempo' }, 504)
  }
  if (error instanceof WeatherProviderError && error.status === 429) {
    return c.json({ error: 'Limite del servizio meteo raggiunto, riprova più tardi' }, 503)
  }
  return c.json({ error: 'Servizio meteo temporaneamente non disponibile' }, 502)
}

weatherRouter.get('/current', async (c) => {
  if (c.req.query('city') !== undefined) {
    return c.json({ error: 'La città si configura nelle Funzioni, non nella richiesta' }, 400)
  }
  const limited = rateLimitResponse(c, weatherRateLimiter, 'weather')
  if (limited) return limited
  try {
    const d = await fetchWeather('/weather', await configuredWeatherCity())
    c.header('Cache-Control', 'private, max-age=60')
    return c.json({
      temp: Math.round(d.main.temp),
      feels_like: Math.round(d.main.feels_like),
      humidity: d.main.humidity,
      description: d.weather[0]?.description ?? '',
      icon: d.weather[0]?.icon ?? '01d',
      wind_speed: Math.round(d.wind.speed * 3.6),
      city: d.name,
    })
  } catch (error) {
    return routeError(c, error)
  }
})

weatherRouter.get('/forecast', async (c) => {
  if (c.req.query('city') !== undefined) {
    return c.json({ error: 'La città si configura nelle Funzioni, non nella richiesta' }, 400)
  }
  const limited = rateLimitResponse(c, weatherRateLimiter, 'weather')
  if (limited) return limited
  try {
    const d = await fetchWeather('/forecast', await configuredWeatherCity())
    const days = new Map<string, {
      dt: number
      temp_min: number
      temp_max: number
      icon: string
      description: string
    }>()

    for (const item of d.list) {
      const date = new Date(item.dt * 1_000).toDateString()
      const existing = days.get(date)
      if (!existing) {
        days.set(date, {
          dt: item.dt,
          temp_min: Math.round(item.main.temp_min),
          temp_max: Math.round(item.main.temp_max),
          icon: item.weather[0]?.icon ?? '01d',
          description: item.weather[0]?.description ?? '',
        })
      } else {
        existing.temp_min = Math.round(Math.min(existing.temp_min, item.main.temp_min))
        existing.temp_max = Math.round(Math.max(existing.temp_max, item.main.temp_max))
      }
    }

    c.header('Cache-Control', 'private, max-age=60')
    return c.json(Array.from(days.values()).slice(0, 5))
  } catch (error) {
    return routeError(c, error)
  }
})
