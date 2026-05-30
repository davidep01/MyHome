import { Droplets, Wind, Thermometer } from 'lucide-react'
import { useCurrentWeather, useWeatherForecast } from '../../hooks/useWeather'
import { tokens } from '../../design/tokens'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

export function WeatherWidget() {
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
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Thermometer size={24} className="text-black/20" />
        <p className="text-xs text-black/30 text-center">
          {error instanceof Error ? error.message : 'Meteo non disponibile'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Current */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-end gap-1">
            <span className="text-4xl font-light text-[#1d1d1f]">{current.temp}°</span>
            <span className="text-sm text-black/40 mb-1.5">C</span>
          </div>
          <p className="text-sm capitalize text-black/60 mt-0.5">{current.description}</p>
          <p className="text-xs text-black/30 mt-0.5">{current.city}</p>
        </div>
        <img
          src={`https://openweathermap.org/img/wn/${current.icon}@2x.png`}
          alt={current.description}
          className="h-16 w-16 -mt-2 -mr-1"
        />
      </div>

      {/* Details */}
      <div className="flex gap-3">
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
      </div>

      {/* Forecast */}
      {forecast && forecast.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {forecast.map((day) => {
            const d = new Date(day.dt * 1000)
            return (
              <div
                key={day.dt}
                className="flex flex-col items-center gap-1 rounded-[12px] bg-black/6 p-2 min-w-[52px]"
              >
                <span className="text-xs text-black/40">{DAYS[d.getDay()]}</span>
                <img
                  src={`https://openweathermap.org/img/wn/${day.icon}.png`}
                  alt=""
                  className="h-8 w-8"
                />
                <span className="text-xs font-medium text-black/80">{day.temp_max}°</span>
                <span className="text-xs text-black/30">{day.temp_min}°</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
