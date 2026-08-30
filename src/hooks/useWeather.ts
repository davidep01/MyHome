import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchCurrentWeather, fetchForecast } from '../api/weather'
import { systemApi } from '../api/backend'
import { currentWeatherFromHA } from '../lib/haWeather'
import { useEntityStore } from '../store/entities'

function useOpenWeatherAvailability() {
  const status = useQuery({
    queryKey: ['system-status'],
    queryFn: systemApi.status,
    staleTime: 60_000,
    retry: 1,
  })
  return status.isError || status.data?.integrations.openweather === true
}

export function useCurrentWeather() {
  const openWeatherEnabled = useOpenWeatherAvailability()
  const entities = useEntityStore((state) => state.entities)
  const fallback = useMemo(() => currentWeatherFromHA(entities), [entities])
  const query = useQuery({
    queryKey: ['weather', 'current'],
    queryFn: fetchCurrentWeather,
    enabled: openWeatherEnabled,
    staleTime: 10 * 60 * 1000,
    retry: 2,
  })
  return {
    ...query,
    data: query.data ?? fallback ?? undefined,
    isLoading: query.isLoading && !fallback,
  }
}

export function useWeatherForecast() {
  const openWeatherEnabled = useOpenWeatherAvailability()
  return useQuery({
    queryKey: ['weather', 'forecast'],
    queryFn: fetchForecast,
    enabled: openWeatherEnabled,
    staleTime: 30 * 60 * 1000,
    retry: 2,
  })
}
