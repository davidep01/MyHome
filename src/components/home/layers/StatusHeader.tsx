import { AlertTriangle, CarFront, HousePlug, LoaderCircle, ShieldAlert, Thermometer, Video, VideoOff, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { energyWindowAt, formatHousePower, isEnergyRisk, powerInKw, wallboxMode } from '../../../lib/statusBarEnergy'
import {
  EnergyDetailSheet,
  EnergyRiskToast,
  WallboxDetailSheet,
  type EnergyAlertPayload,
} from './EnergyStatusDetails'

const WALLBOX_STATUS_ID = 'sensor.chargesplit_domus_wallbox_status'
const HOUSE_CONSUMPTION_ID = 'sensor.chargesplit_domus_actual_house_consumption'

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
  cameraRowVisible,
  onCameraRowToggle,
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
  /** Comando della fila di monitoraggio globale; omesso nelle viste senza camere fisse. */
  cameraRowVisible?: boolean
  onCameraRowToggle?: () => void
}) {
  const { time, date, now } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: weather } = useCurrentWeather()
  const entities = useEntityStore((s) => s.entities)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [wallboxOpen, setWallboxOpen] = useState(false)
  const [energyOpen, setEnergyOpen] = useState(false)
  const [energyAlert, setEnergyAlert] = useState<EnergyAlertPayload | null>(null)

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
  const wallboxVisual = wallboxMode(entities[WALLBOX_STATUS_ID])
  const housePowerEntity = entities[HOUSE_CONSUMPTION_ID]
  const housePower = formatHousePower(housePowerEntity)
  const housePowerKw = powerInKw(housePowerEntity)
  const energyWindow = useMemo(() => energyWindowAt(now), [now])
  const energyRisk = isEnergyRisk(housePowerKw, energyWindow)
  const closeEnergyAlert = useCallback(() => setEnergyAlert(null), [])

  useEffect(() => {
    if (housePowerKw === null || typeof window === 'undefined') return
    // Isteresi: un nuovo avviso è consentito solo dopo che il carico è
    // rientrato con un margine reale, non a ogni oscillazione sul confine.
    if (housePowerKw < 2.3) window.sessionStorage.removeItem('simi.energy-risk-alert.3')
    if (housePowerKw < 5.3) window.sessionStorage.removeItem('simi.energy-risk-alert.6')
    if (!energyRisk) return
    const key = `simi.energy-risk-alert.${energyWindow.limitKw}`
    if (window.sessionStorage.getItem(key) === 'shown') return
    window.sessionStorage.setItem(key, 'shown')
    const timer = window.setTimeout(() => setEnergyAlert({ powerKw: housePowerKw, window: energyWindow }), 0)
    return () => clearTimeout(timer)
  }, [energyRisk, energyWindow, housePowerKw])

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
          aria-label="Stato temperature, energia e notifiche"
        >
          <StatusTemperature
            label="Esterna"
            value={outdoorTemperature}
            icon={weather ? <WeatherIcon code={weather.icon} size={23} /> : <WeatherIcon code="01d" size={23} />}
          />
          {onCameraRowToggle && (
            <>
              <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
              <button
                type="button"
                onClick={onCameraRowToggle}
                className="flex h-12 w-12 shrink-0 items-center justify-center text-black/50 transition hover:bg-black/[0.05] active:scale-95 dark:text-white/65 dark:hover:bg-white/[0.08]"
                aria-label={cameraRowVisible ? 'Nascondi la fila videocamere' : 'Mostra la fila videocamere'}
                aria-pressed={cameraRowVisible}
                title={cameraRowVisible ? 'Nascondi videocamere' : 'Mostra videocamere'}
              >
                {cameraRowVisible ? <Video size={18} aria-hidden="true" /> : <VideoOff size={18} aria-hidden="true" />}
              </button>
            </>
          )}
          <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
          <StatusTemperature
            label="Interna"
            value={indoorTemperature}
            icon={<Thermometer size={18} className="text-orange-500" aria-hidden="true" />}
          />
          <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
          <StatusPower value={housePower} risk={energyRisk} onClick={() => setEnergyOpen(true)} />
          {wallboxVisual !== 'hidden' && (
            <>
              <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
              <WallboxStatus mode={wallboxVisual} onClick={() => setWallboxOpen(true)} />
            </>
          )}
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
      <WallboxDetailSheet
        open={wallboxOpen}
        onClose={() => setWallboxOpen(false)}
        mode={wallboxVisual}
        entities={entities}
        statusEntityId={WALLBOX_STATUS_ID}
      />
      <EnergyDetailSheet
        open={energyOpen}
        onClose={() => setEnergyOpen(false)}
        entity={housePowerEntity}
        powerKw={housePowerKw}
        window={energyWindow}
        risk={energyRisk}
      />
      <EnergyRiskToast
        alert={energyAlert}
        onClose={closeEnergyAlert}
        onOpen={() => setEnergyOpen(true)}
      />
    </header>
  )
}

function StatusPower({ value, risk, onClick }: { value: string | null; risk: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-w-[102px] items-center gap-2 px-3 text-left transition hover:bg-black/[0.05] active:scale-[0.98] dark:hover:bg-white/[0.08]"
      aria-label={`Apri consumo casa: ${value ?? 'non disponibile'}`}
      title={risk ? 'Consumo vicino al limite disponibile' : 'Apri andamento consumi'}
    >
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center', risk ? 'energy-risk-indicator text-orange-600' : 'text-[#0066cc]')}>
        <HousePlug size={19} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-white/38">Casa</span>
        <span className="block whitespace-nowrap text-[16px] font-semibold leading-none tabular-nums text-[#1d1d1f] dark:text-white">{value ?? '—'}</span>
      </span>
    </button>
  )
}

function WallboxStatus({ mode, onClick }: { mode: 'connected' | 'charging'; onClick: () => void }) {
  const charging = mode === 'charging'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-[58px] shrink-0 items-center justify-center"
      aria-label={charging ? 'Auto elettrica in carica: apri dettagli wallbox' : 'Auto elettrica collegata: apri dettagli wallbox'}
      title={charging ? 'Ricarica in corso' : 'Auto elettrica collegata'}
    >
      <span className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-[13px] transition active:scale-95',
        charging
          ? 'wallbox-charge-indicator bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/14 dark:text-emerald-300'
          : 'bg-[#0066cc]/10 text-[#0066cc] dark:bg-[#0a84ff]/16 dark:text-[#5ac8fa]',
      )}>
        <CarFront size={22} aria-hidden="true" />
        {charging && (
          <span className="wallbox-charge-bolt absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
            <Zap size={10} fill="currentColor" aria-hidden="true" />
          </span>
        )}
      </span>
    </button>
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
