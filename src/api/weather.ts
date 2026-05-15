const BASE = '/api/weather'

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
  const res = await fetch(`${BASE}/current`)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<WeatherCurrent>
}

export async function fetchForecast(): Promise<WeatherForecastItem[]> {
  const res = await fetch(`${BASE}/forecast`)
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<WeatherForecastItem[]>
}
