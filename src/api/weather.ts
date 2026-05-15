const API_KEY = import.meta.env.VITE_OPENWEATHER_KEY ?? ''
const CITY = import.meta.env.VITE_WEATHER_CITY ?? 'Milan,IT'
const BASE = 'https://api.openweathermap.org/data/2.5'

export interface WeatherCurrent {
  temp: number
  feels_like: number
  humidity: number
  description: string
  icon: string
  wind_speed: number
  city: string
}

export interface WeatherForecastItem {
  dt: number
  temp_min: number
  temp_max: number
  icon: string
  description: string
}

export async function fetchCurrentWeather(): Promise<WeatherCurrent> {
  const res = await fetch(
    `${BASE}/weather?q=${CITY}&appid=${API_KEY}&units=metric&lang=it`,
  )
  if (!res.ok) throw new Error('Weather API error')
  const d = await res.json()
  return {
    temp: Math.round(d.main.temp),
    feels_like: Math.round(d.main.feels_like),
    humidity: d.main.humidity,
    description: d.weather[0].description,
    icon: d.weather[0].icon,
    wind_speed: Math.round(d.wind.speed * 3.6),
    city: d.name,
  }
}

export async function fetchForecast(): Promise<WeatherForecastItem[]> {
  const res = await fetch(
    `${BASE}/forecast/daily?q=${CITY}&cnt=5&appid=${API_KEY}&units=metric&lang=it`,
  )
  if (!res.ok) {
    // fallback to 3h forecast and aggregate by day
    const res2 = await fetch(
      `${BASE}/forecast?q=${CITY}&appid=${API_KEY}&units=metric&lang=it`,
    )
    if (!res2.ok) throw new Error('Forecast API error')
    const d = await res2.json()
    const days = new Map<string, WeatherForecastItem>()
    for (const item of d.list) {
      const date = new Date(item.dt * 1000).toDateString()
      if (!days.has(date)) {
        days.set(date, {
          dt: item.dt,
          temp_min: item.main.temp_min,
          temp_max: item.main.temp_max,
          icon: item.weather[0].icon,
          description: item.weather[0].description,
        })
      } else {
        const existing = days.get(date)!
        existing.temp_min = Math.min(existing.temp_min, item.main.temp_min)
        existing.temp_max = Math.max(existing.temp_max, item.main.temp_max)
      }
    }
    return Array.from(days.values()).slice(0, 5)
  }
  const d = await res.json()
  return d.list.map((item: any) => ({
    dt: item.dt,
    temp_min: Math.round(item.temp.min),
    temp_max: Math.round(item.temp.max),
    icon: item.weather[0].icon,
    description: item.weather[0].description,
  }))
}
