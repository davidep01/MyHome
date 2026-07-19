import { AlertTriangle, LoaderCircle, ShieldAlert, Thermometer } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'
import { cn } from '../../../lib/utils'
import type { HomeChip } from '../../../hooks/useComposedHome'
import { WeatherIcon } from '../../weather/WeatherIcon'
import { NotificationBell } from '../../notifications/NotificationCenter'
import { BRAND_EXPANDED, BRAND_NAME } from '../../../lib/brand'
import { externalTemperatureFromEntities, meanIndoorClimateTemperature } from '../../../lib/dashboardSelection'

/**
 * Strato 1 — Stato di casa. Sempre presente, mai configurato: ora, saluto,
 * temperature esterna/interna, notifiche e chip-anomalia del composer.
 * L'icona dice il dominio, il colore lo stato, il testo il valore.
 */
export function StatusHeader({
  userName,
  alerts,
  onAlertTap,
  onAlertAction,
  onClockTap,
  contextTitle,
}: {
  userName?: string
  alerts: HomeChip[]
  onAlertTap: (chip: HomeChip) => void
  /** Esegue l'azione proposta da un suggerimento (il tap È la conferma). */
  onAlertAction?: (chip: HomeChip) => Promise<void>
  /** Tocco sull'orologio → timeline "Oggi a casa". */
  onClockTap?: () => void
  /** Titolo della dashboard stanza; assente nella Home generale. */
  contextTitle?: string
}) {
  const { time, date } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: weather } = useCurrentWeather()
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

  const indoorTemperature = useMemo(() => meanIndoorClimateTemperature(entities), [entities])
  const outdoorTemperature = weather?.temp ?? externalTemperatureFromEntities(entities)

  return (
    <header className="min-w-0 shrink-0 space-y-3.5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <button
          type="button"
          onClick={onClockTap}
          disabled={!onClockTap}
          className="min-h-11 min-w-0 max-w-full text-left transition enabled:active:scale-[0.99]"
          aria-label={onClockTap ? 'Apri la timeline di oggi' : 'Ora e data correnti'}
        >
          <div className="flex min-w-0 items-baseline gap-2.5 sm:gap-3">
            <span className="shrink-0 text-[clamp(46px,15vw,56px)] font-light leading-none text-[#1d1d1f] tabular-nums dark:text-white">{time}</span>
            <span className="min-w-0 text-sm capitalize leading-snug text-black/45 dark:text-white/48 sm:text-base">{date}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0066cc]" title={BRAND_EXPANDED}>{BRAND_NAME}</span>
            <p className="break-words text-xl font-semibold leading-tight text-[#1d1d1f] dark:text-white">
              {contextTitle ?? `${greeting}${userName ? `, ${userName}` : ''}`}
            </p>
          </div>
        </button>

        <div
          className="flex h-14 shrink-0 items-center overflow-hidden rounded-[18px] border border-black/[0.07] bg-white/65 shadow-sm backdrop-blur-xl dark:border-white/[0.10] dark:bg-white/[0.07]"
          aria-label="Stato temperature e notifiche"
        >
          <StatusTemperature
            label="Esterna"
            value={outdoorTemperature}
            icon={weather ? <WeatherIcon code={weather.icon} size={23} /> : <WeatherIcon code="01d" size={23} />}
          />
          <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
          <StatusTemperature
            label="Interna"
            value={indoorTemperature}
            icon={<Thermometer size={18} className="text-orange-500" aria-hidden="true" />}
          />
          <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
          <NotificationBell allowDismiss={false} variant="statusBar" />
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
      {actionError && <p role="alert" className="text-sm font-semibold text-red-700">{actionError}</p>}
    </header>
  )
}

function formatTemperature(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${String(Math.round(value * 10) / 10).replace('.', ',')}°`
}

function StatusTemperature({ label, value, icon }: { label: string; value: number | null; icon: ReactNode }) {
  return (
    <div className="flex h-full min-w-[108px] items-center gap-2 px-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-white/38">{label}</span>
        <span className="block text-[19px] font-semibold leading-none tabular-nums text-[#1d1d1f] dark:text-white">{formatTemperature(value)}</span>
      </span>
    </div>
  )
}
