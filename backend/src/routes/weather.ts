import { Hono } from 'hono'
import { db } from '../db/client.js'

const BASE = 'https://api.openweathermap.org/data/2.5'

interface OpenWeatherCurrent {
  main: {
    temp: number
    feels_like: number
    humidity: number
  }
  weather: { description: string; icon: string }[]
  wind: { speed: number }
  name: string
}

interface OpenWeatherForecastItem {
  dt: number
  main: {
    temp_min: number
    temp_max: number
  }
  weather: { description: string; icon: string }[]
}

interface OpenWeatherForecast {
  list: OpenWeatherForecastItem[]
}

export const weatherRouter = new Hono()

function weatherKey(): string {
  return process.env.OPENWEATHER_API_KEY ?? process.env.VITE_OPENWEATHER_KEY ?? ''
}

function weatherCity(urlCity: string | undefined): string {
  return urlCity || db.read().config.weatherCity || process.env.VITE_WEATHER_CITY || 'Milan,IT'
}

function assertConfigured() {
  const key = weatherKey()
  if (!key || key.startsWith('your_')) {
    throw new Error('OpenWeather API key missing')
  }
  return key
}

async function fetchWeather<T>(path: string, city: string): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('q', city)
  url.searchParams.set('appid', assertConfigured())
  url.searchParams.set('units', 'metric')
  url.searchParams.set('lang', 'it')

  const res = await fetch(url)
  if (!res.ok) {
    const message = await res.text()
    throw new Error(`OpenWeather ${res.status}: ${message}`)
  }
  return res.json() as Promise<T>
}

weatherRouter.get('/current', async (c) => {
  try {
    const city = weatherCity(c.req.query('city'))
    const d = await fetchWeather<OpenWeatherCurrent>('/weather', city)

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
    return c.json({ error: error instanceof Error ? error.message : 'Weather API error' }, 502)
  }
})

weatherRouter.get('/forecast', async (c) => {
  try {
    const city = weatherCity(c.req.query('city'))
    const d = await fetchWeather<OpenWeatherForecast>('/forecast', city)
    const days = new Map<string, {
      dt: number
      temp_min: number
      temp_max: number
      icon: string
      description: string
    }>()

    for (const item of d.list) {
      const date = new Date(item.dt * 1000).toDateString()
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

    return c.json(Array.from(days.values()).slice(0, 5))
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Forecast API error' }, 502)
  }
})
