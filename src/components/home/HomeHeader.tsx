import { useMemo } from 'react'
import { CloudRain, Droplets } from 'lucide-react'
import { useTimeOfDay } from '../../hooks/useTimeOfDay'
import { useClock } from '../../hooks/useClock'
import { useHomeStatus } from '../../hooks/useHomeStatus'
import { useDashboardConfig } from '../../hooks/useDashboardConfig'
import { useCurrentWeather, useWeatherForecast } from '../../hooks/useWeather'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

const TONE_BG: Record<string, string> = {
  ok: 'rgba(21,128,61,0.12)',
  warning: 'rgba(194,65,12,0.14)',
  critical: 'rgba(220,38,38,0.14)',
}

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
  const { time, date } = useClock()
  const status = useHomeStatus()
  const { data: config } = useDashboardConfig()
  const { data: weather } = useCurrentWeather()
  const { data: forecast } = useWeatherForecast()
  const mediaStatus = useMediaStatus()
  const setActiveView = useUIStore((s) => s.setActiveView)

  const name = config?.userName ?? 'Casa'
  const StatusIcon = status.Icon

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      {/* Clock + greeting + live home status */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="text-[44px] font-light leading-none tracking-[-0.02em] text-[#1d1d1f] tabular-nums">{time}</span>
          <span className="truncate text-sm capitalize text-black/45">{date}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-[#1d1d1f]">
            {greeting}, {name}
          </h1>
          <button
            onClick={() => setActiveView('security')}
            className="press-card flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium active:scale-95"
            style={{ background: TONE_BG[status.tone] ?? TONE_BG.ok, color: status.color }}
          >
            <StatusIcon size={15} />
            {status.label}
          </button>
        </div>
        {mediaStatus && <p className="mt-1.5 truncate text-sm text-black/45">♪ {mediaStatus}</p>}
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
