import { AlertTriangle, LoaderCircle, ShieldAlert, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'
import { cn } from '../../../lib/utils'
import type { HomeChip } from '../../../hooks/useComposedHome'
import { WeatherIcon } from '../../weather/WeatherIcon'
import { NotificationBell } from '../../notifications/NotificationCenter'

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
  onAlertAction?: (chip: HomeChip) => Promise<void>
  /** Tocco sull'orologio → timeline "Oggi a casa". */
  onClockTap?: () => void
}) {
  const { time, date } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: weather } = useCurrentWeather()
  const status = useEntityStore((s) => s.connectionStatus)
  const entities = useEntityStore((s) => s.entities)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const runAction = async (chip: HomeChip) => {
    if (!onAlertAction || pendingAction) return
    setPendingAction(chip.id)
    setActionError(null)
    try {
      await onAlertAction(chip)
    } catch {
      setActionError(`Azione “${chip.action?.label ?? chip.label}” non riuscita. Riprova.`)
    } finally {
      setPendingAction(null)
    }
  }

  const personsHome = useMemo(
    () => Object.values(entities)
      .filter((e) => e.entity_id.startsWith('person.') && e.state === 'home')
      .map((e) => (e.attributes?.friendly_name as string | undefined) ?? e.entity_id.split('.')[1]),
    [entities],
  )

  const online = status === 'connected'
  const syncing = status === 'connecting'

  return (
    <header className="min-w-0 shrink-0 space-y-3.5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <button type="button" onClick={onClockTap} className="min-h-11 min-w-0 max-w-full text-left transition active:scale-[0.99]" aria-label="Apri la timeline di oggi">
          <div className="flex min-w-0 items-baseline gap-2.5 sm:gap-3">
            <span className="shrink-0 text-[clamp(46px,15vw,56px)] font-light leading-none text-[#1d1d1f] tabular-nums">{time}</span>
            <span className="min-w-0 text-sm capitalize leading-snug text-black/45 sm:text-base">{date}</span>
          </div>
          <p className="mt-2 break-words text-xl font-semibold leading-tight text-[#1d1d1f]">
            {greeting}{userName ? `, ${userName}` : ''}
          </p>
        </button>

        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end sm:gap-2.5">
          {personsHome.length > 0 && (
            <div className="flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-full bg-black/[0.05] px-4 text-sm font-medium text-black/60">
              <Users size={16} className="shrink-0 text-black/40" />
              <span className="max-w-[min(52vw,220px)] truncate">{personsHome.join(' · ')}</span>
            </div>
          )}
          {weather && (
            <div className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-black/[0.05] px-3.5 sm:px-4">
              <WeatherIcon code={weather.icon} size={27} />
              <span className="text-2xl font-light text-[#1d1d1f]">{weather.temp}°</span>
            </div>
          )}
          <span
            role="status"
            aria-label={online ? 'Online' : syncing ? 'Sincronizzazione' : 'Offline'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.05]"
            title={online ? 'Online' : syncing ? 'Sincronizzazione' : 'Offline'}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full', online ? 'bg-green-500' : syncing ? 'animate-pulse bg-orange-400' : 'bg-red-400')} />
          </span>
          <NotificationBell allowDismiss={false} />
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {alerts.map((chip) => (
            <div
              key={chip.id}
              className={cn(
                'flex min-h-11 w-full max-w-full min-w-0 items-center gap-1.5 rounded-[22px] pl-4 text-[13px] font-semibold transition sm:w-auto sm:text-sm',
                chip.action ? 'pr-1.5' : 'pr-4',
                chip.severity === 'danger' ? 'bg-red-500/12 text-[#dc2626]'
                  : chip.severity === 'warn' ? 'bg-orange-500/12 text-[#c2410c]'
                    : 'bg-black/[0.06] text-black/55',
              )}
            >
              <button type="button" onClick={() => onAlertTap(chip)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left leading-tight active:scale-[0.98]">
                {chip.severity === 'danger' ? <ShieldAlert size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
                <span className="min-w-0">{chip.label}</span>
              </button>
              {chip.action && onAlertAction && (
                <button
                  type="button"
                  onClick={() => { void runAction(chip) }}
                  disabled={pendingAction !== null}
                  aria-busy={pendingAction === chip.id}
                  className="tap-target min-h-9 shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#1d1d1f] shadow-sm transition active:scale-95"
                >
                  {pendingAction === chip.id && <LoaderCircle size={14} className="mr-1 inline animate-spin" aria-hidden="true" />}
                  {pendingAction === chip.id ? 'Esecuzione…' : chip.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {actionError && <p role="alert" className="text-sm font-medium text-red-700">{actionError}</p>}
    </header>
  )
}
