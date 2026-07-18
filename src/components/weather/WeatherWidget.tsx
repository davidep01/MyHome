import { CloudSun, Droplets, Wind, Thermometer } from 'lucide-react'
import { useCurrentWeather, useWeatherForecast } from '../../hooks/useWeather'
import { tokens } from '../../design/tokens'
import { WeatherIcon } from './WeatherIcon'
import type { WidgetSize } from '../../api/backend'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

export function WeatherWidget({ size = 'md' }: { size?: WidgetSize }) {
  const { data: current, isLoading: loadingCurrent, error } = useCurrentWeather()
  const { data: forecast } = useWeatherForecast()

  if (loadingCurrent) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-black/20 border-t-black/50 animate-spin" />
      </div>
    )
  }

  if (!current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-sky-400/18 to-amber-300/25 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <CloudSun size={27} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1d1d1f]">Meteo da configurare</p>
          <p className="mx-auto mt-1 max-w-[280px] text-xs leading-5 text-black/40">
            Aggiungi la chiave OpenWeather dalla regia per vedere condizioni e previsioni.
          </p>
        </div>
        <span className="sr-only">{error instanceof Error ? error.message : 'Meteo non disponibile'}</span>
      </div>
    )
  }

  const compact = size === 'sm'
  const showDetails = size !== 'sm'
  const showForecast = size === 'lg'
  const forecastLimit = 4

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Current */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-end gap-1">
            <span className={compact ? 'text-3xl font-light text-[#1d1d1f]' : size === 'wide' ? 'text-6xl font-light text-[#1d1d1f]' : 'text-4xl font-light text-[#1d1d1f]'}>{current.temp}°</span>
            <span className="text-sm text-black/40 mb-1.5">C</span>
          </div>
          <p className="text-sm capitalize text-black/60 mt-0.5">{current.description}</p>
          {!compact && <p className="mt-0.5 text-xs text-black/30">{current.city}</p>}
        </div>
        <WeatherIcon code={current.icon} size={compact ? 42 : size === 'wide' ? 72 : 54} label={current.description} className="-mr-1 mt-0 text-[#0066cc]" />
      </div>

      {/* Details */}
      {showDetails && <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          <Droplets size={12} style={{ color: tokens.accent.blue }} />
          <span className="text-xs text-black/50">{current.humidity}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wind size={12} className="text-black/30" />
          <span className="text-xs text-black/50">{current.wind_speed} km/h</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Thermometer size={12} className="text-black/30" />
          <span className="text-xs text-black/50">Percepita {current.feels_like}°</span>
        </div>
      </div>}

      {/* Forecast */}
      {showForecast && forecast && forecast.length > 0 && (
        <div className="grid min-h-0 grid-cols-4 gap-2 overflow-hidden pb-1">
          {forecast.slice(0, forecastLimit).map((day) => {
            const d = new Date(day.dt * 1000)
            return (
              <div
                key={day.dt}
                className="flex flex-col items-center gap-1 rounded-[12px] bg-black/6 p-2 min-w-[52px]"
              >
                <span className="text-xs text-black/40">{DAYS[d.getDay()]}</span>
                <WeatherIcon code={day.icon} size={27} />
                <span className="text-xs font-semibold text-black/80">{day.temp_max}°</span>
                <span className="text-xs text-black/30">{day.temp_min}°</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
