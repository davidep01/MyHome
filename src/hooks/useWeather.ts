import { useQuery } from '@tanstack/react-query'
import { fetchCurrentWeather, fetchForecast } from '../api/weather'

export function useCurrentWeather() {
  return useQuery({
    queryKey: ['weather', 'current'],
    queryFn: fetchCurrentWeather,
    staleTime: 10 * 60 * 1000,
    retry: 2,
  })
}

export function useWeatherForecast() {
  return useQuery({
    queryKey: ['weather', 'forecast'],
    queryFn: fetchForecast,
    staleTime: 30 * 60 * 1000,
    retry: 2,
  })
}
