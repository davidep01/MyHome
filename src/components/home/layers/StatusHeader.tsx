import { AlertTriangle, ShieldAlert, Users } from 'lucide-react'
import { useMemo } from 'react'
import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'
import { cn } from '../../../lib/utils'
import type { HomeChip } from '../../../hooks/useComposedHome'

/**
 * Strato 1 — Stato di casa. Sempre presente, mai configurato: ora, saluto,
 * meteo, presenza, connessione e le chip-anomalia del composer.
 * L'icona dice il dominio, il colore lo stato, il testo il valore.
 */
export function StatusHeader({
  userName,
  alerts,
  onAlertTap,
  onAlertAction,
  onClockTap,
}: {
  userName?: string
  alerts: HomeChip[]
  onAlertTap: (chip: HomeChip) => void
  /** Esegue l'azione proposta da un suggerimento (il tap È la conferma). */
  onAlertAction?: (chip: HomeChip) => void
  /** Tocco sull'orologio → timeline "Oggi a casa". */
  onClockTap?: () => void
}) {
  const { time, date } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: weather } = useCurrentWeather()
  const status = useEntityStore((s) => s.connectionStatus)
  const entities = useEntityStore((s) => s.entities)

  const personsHome = useMemo(
    () => Object.values(entities)
      .filter((e) => e.entity_id.startsWith('person.') && e.state === 'home')
      .map((e) => (e.attributes?.friendly_name as string | undefined) ?? e.entity_id.split('.')[1]),
    [entities],
  )

  const online = status === 'connected'
  const syncing = status === 'connecting'

  return (
    <header className="shrink-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button type="button" onClick={onClockTap} className="min-w-0 text-left transition active:scale-[0.99]" aria-label="Apri la timeline di oggi">
          <div className="flex items-baseline gap-3">
            <span className="text-[56px] font-light leading-none text-[#1d1d1f] tabular-nums">{time}</span>
            <span className="truncate text-base capitalize text-black/45">{date}</span>
          </div>
          <p className="mt-2 truncate text-xl font-semibold text-[#1d1d1f]">
            {greeting}{userName ? `, ${userName}` : ''}
          </p>
        </button>

        <div className="flex items-center gap-2.5">
          {personsHome.length > 0 && (
            <div className="flex min-h-[44px] items-center gap-2 rounded-full bg-black/[0.05] px-4 text-sm font-medium text-black/60">
              <Users size={16} className="text-black/40" />
              <span className="max-w-[220px] truncate">{personsHome.join(' · ')}</span>
            </div>
          )}
          {weather && (
            <div className="flex min-h-[44px] items-center gap-2 rounded-full bg-black/[0.05] px-4">
              <img src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="" className="h-9 w-9" />
              <span className="text-2xl font-light text-[#1d1d1f]">{weather.temp}°</span>
            </div>
          )}
          <span
            className={cn('h-2.5 w-2.5 rounded-full', online ? 'bg-green-500' : syncing ? 'bg-orange-400 animate-pulse' : 'bg-red-400')}
            title={online ? 'Online' : syncing ? 'Sincronizzazione' : 'Offline'}
          />
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {alerts.map((chip) => (
            <div
              key={chip.id}
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-full pl-4 text-sm font-semibold transition',
                chip.action ? 'pr-1.5' : 'pr-4',
                chip.severity === 'danger' ? 'bg-red-500/12 text-[#dc2626]'
                  : chip.severity === 'warn' ? 'bg-orange-500/12 text-[#c2410c]'
                    : 'bg-black/[0.06] text-black/55',
              )}
            >
              <button type="button" onClick={() => onAlertTap(chip)} className="flex items-center gap-2 active:scale-95">
                {chip.severity === 'danger' ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}
                {chip.label}
              </button>
              {chip.action && onAlertAction && (
                <button
                  type="button"
                  onClick={() => onAlertAction(chip)}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#1d1d1f] shadow-sm transition active:scale-95"
                >
                  {chip.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </header>
  )
}
