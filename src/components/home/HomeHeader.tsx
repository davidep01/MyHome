import { useMemo } from 'react'
import { CloudRain, Droplets } from 'lucide-react'
import { useTimeOfDay } from '../../hooks/useTimeOfDay'
import { useHomeStatus } from '../../hooks/useHomeStatus'
import { useDashboardConfig } from '../../hooks/useDashboardConfig'
import { useCurrentWeather, useWeatherForecast } from '../../hooks/useWeather'
import { useEntityStore } from '../../store/entities'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

function useMediaStatus(): string | null {
  const entities = useEntityStore((s) => s.entities)
  return useMemo(() => {
    const players = Object.values(entities).filter(
      (e) => e.entity_id.startsWith('media_player.') && e.state === 'playing',
    )
    if (players.length === 0) return null
    const first = players[0]
    const title = first.attributes?.media_title as string | undefined
    const name = (first.attributes?.friendly_name as string | undefined) ?? 'Media'
    const extra = players.length > 1 ? ` · +${players.length - 1}` : ''
    return title ? `${name}: ${title}${extra}` : `${name} in riproduzione${extra}`
  }, [entities])
}

export function HomeHeader() {
  const { greeting } = useTimeOfDay()
  const status = useHomeStatus()
  const { data: config } = useDashboardConfig()
  const { data: weather } = useCurrentWeather()
  const { data: forecast } = useWeatherForecast()
  const mediaStatus = useMediaStatus()

  const name = config?.userName ?? 'Casa'
  const subtitle = mediaStatus ?? status.detail ?? status.label

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      {/* Greeting */}
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[#1d1d1f] sm:text-3xl">
          {greeting}, {name}!
        </h1>
        <p className="mt-1 truncate text-sm text-black/45">{subtitle}</p>
      </div>

      {/* Weather summary */}
      {weather && (
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <img
              src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
              alt={weather.description}
              className="h-12 w-12"
            />
            <div>
              <div className="text-2xl font-light leading-none text-[#1d1d1f]">{weather.temp}°</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-black/45">
                {weather.description.toLowerCase().includes('rain') || weather.humidity > 80
                  ? <CloudRain size={11} /> : <Droplets size={11} />}
                {weather.humidity}%
              </div>
            </div>
          </div>

          {forecast && forecast.length > 0 && (
            <div className="hidden items-center gap-2 sm:flex">
              {forecast.slice(0, 4).map((day, i) => {
                const d = new Date(day.dt * 1000)
                return (
                  <div key={day.dt} className="flex flex-col items-center gap-0.5 rounded-[14px] bg-black/6 px-2.5 py-1.5">
                    <span className="text-[10px] uppercase text-black/40">{i === 0 ? 'Oggi' : DAYS[d.getDay()]}</span>
                    <img src={`https://openweathermap.org/img/wn/${day.icon}.png`} alt="" className="h-6 w-6" />
                    <span className="text-xs font-medium text-black/80">{day.temp_max}°</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
