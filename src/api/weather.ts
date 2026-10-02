import { request } from './backend'

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
  date?: string
  dayLabel?: string
  timeZone?: string
  dt: number
  temp_min: number
  temp_max: number
  icon: string
  description: string
}

export function fetchCurrentWeather(signal?: AbortSignal): Promise<WeatherCurrent> {
  return request('/weather/current', { signal })
}
export function fetchForecast(signal?: AbortSignal): Promise<WeatherForecastItem[]> {
  return request('/weather/forecast', { signal })
}
