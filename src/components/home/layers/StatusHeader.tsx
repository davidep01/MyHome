import { AlertTriangle, CarFront, HousePlug, LoaderCircle, ShieldAlert, ShieldCheck, Thermometer, Video, VideoOff, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'
import { cn } from '../../../lib/utils'
import type { HomeChip } from '../../../hooks/useComposedHome'
import { WeatherIcon } from '../../weather/WeatherIcon'
import { NotificationBell } from '../../notifications/NotificationCenter'
import { BRAND_EXPANDED, BRAND_NAME } from '../../../lib/brand'
import { externalTemperatureFromEntities, indoorClimateTemperatureSources } from '../../../lib/dashboardSelection'
import { energyWindowAt, formatPowerKw, isEnergyRisk, powerInKw, totalPowerInKw, wallboxMode } from '../../../lib/statusBarEnergy'
import { ALARM_STATE_LABELS, isArmed } from '../../../lib/alarm'
import { GlassSheet } from '../../glass/GlassSheet'
import { AlarmDetail } from '../../contextual/AlarmDetail'
import {
  CAR_CHARGING_POWER_ID,
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
  const [alarmOpen, setAlarmOpen] = useState(false)
  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(null)
  const [indoorOpen, setIndoorOpen] = useState(false)
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

  const indoorSources = useMemo(() => indoorClimateTemperatureSources(entities), [entities])
  const indoorTemperature = indoorSources.length > 0
    ? indoorSources.reduce((sum, source) => sum + source.value, 0) / indoorSources.length
    : null
  const alarmEntities = useMemo(() => Object.values(entities)
    .filter((entity) => entity.entity_id.startsWith('alarm_control_panel.') && !isIgnoredAlarm(entity))
    .sort((a, b) => alarmEntityRank(b) - alarmEntityRank(a) || a.entity_id.localeCompare(b.entity_id)), [entities])
  const primaryAlarmEntity = alarmEntities.find((entity) => isArmed(entity.state)) ?? alarmEntities[0] ?? null
  const selectedAlarmEntity = alarmEntities.find((entity) => entity.entity_id === selectedAlarmId) ?? primaryAlarmEntity
  const outdoorTemperature = weather?.temp ?? externalTemperatureFromEntities(entities)
  const wallboxVisual = wallboxMode(entities[WALLBOX_STATUS_ID])
  const housePowerEntity = entities[HOUSE_CONSUMPTION_ID]
  const carPowerEntity = entities[CAR_CHARGING_POWER_ID]
  const domesticPowerKw = powerInKw(housePowerEntity)
  const carPowerKw = powerInKw(carPowerEntity)
  const totalPowerKw = totalPowerInKw(housePowerEntity, carPowerEntity)
  const totalPower = formatPowerKw(totalPowerKw)
  const energyWindow = useMemo(() => energyWindowAt(now), [now])
  const energyRisk = isEnergyRisk(totalPowerKw, energyWindow)
  const closeEnergyAlert = useCallback(() => setEnergyAlert(null), [])

  useEffect(() => {
    if (totalPowerKw === null || typeof window === 'undefined') return
    // Isteresi: un nuovo avviso è consentito solo dopo che il carico è
    // rientrato con un margine reale, non a ogni oscillazione sul confine.
    if (totalPowerKw < 2.3) window.sessionStorage.removeItem('simi.energy-risk-alert.3')
    if (totalPowerKw < 5.3) window.sessionStorage.removeItem('simi.energy-risk-alert.6')
    if (!energyRisk) return
    const key = `simi.energy-risk-alert.${energyWindow.limitKw}`
    if (window.sessionStorage.getItem(key) === 'shown') return
    // La chiave va scritta insieme all'apertura effettiva: in Strict Mode il
    // primo effect viene annullato intenzionalmente e non deve bruciare l'avviso.
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(key, 'shown')
      setEnergyAlert({ powerKw: totalPowerKw, window: energyWindow })
    }, 0)
    return () => clearTimeout(timer)
  }, [energyRisk, energyWindow, totalPowerKw])

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
            onClick={() => setIndoorOpen(true)}
          />
          <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
          <StatusPower value={totalPower} risk={energyRisk} onClick={() => setEnergyOpen(true)} />
          {wallboxVisual !== 'hidden' && (
            <>
              <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
              <WallboxStatus mode={wallboxVisual} onClick={() => setWallboxOpen(true)} />
            </>
          )}
          {alarmEntities.length > 0 && (
            <>
              <span className="h-7 w-px bg-black/[0.08] dark:bg-white/[0.12]" aria-hidden="true" />
              <AlarmStatus
                entities={alarmEntities}
                onClick={() => {
                  setSelectedAlarmId(primaryAlarmEntity?.entity_id ?? null)
                  setAlarmOpen(true)
                }}
              />
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
        houseEntity={housePowerEntity}
        carEntity={carPowerEntity}
        domesticPowerKw={domesticPowerKw}
        carPowerKw={carPowerKw}
        powerKw={totalPowerKw}
        window={energyWindow}
        risk={energyRisk}
      />
      <EnergyRiskToast
        alert={energyAlert}
        onClose={closeEnergyAlert}
        onOpen={() => setEnergyOpen(true)}
      />
      <GlassSheet open={indoorOpen} onClose={() => setIndoorOpen(false)} title="Temperatura interna" side="center">
        <IndoorTemperatureDetail sources={indoorSources} average={indoorTemperature} />
      </GlassSheet>
      <GlassSheet open={alarmOpen} onClose={() => setAlarmOpen(false)} title="Stato allarme" side="center">
        {selectedAlarmEntity
          ? <div className="space-y-3">
              {alarmEntities.length > 1 && (
                <div className="flex rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.08]" role="group" aria-label="Pannello allarme">
                  {alarmEntities.map((entity) => (
                    <button
                      key={entity.entity_id}
                      type="button"
                      onClick={() => setSelectedAlarmId(entity.entity_id)}
                      aria-pressed={selectedAlarmEntity.entity_id === entity.entity_id}
                      className={cn(
                        'min-h-10 min-w-0 flex-1 truncate rounded-full px-3 text-xs font-semibold transition',
                        selectedAlarmEntity.entity_id === entity.entity_id
                          ? 'bg-white text-[#1d1d1f] shadow-sm dark:bg-white/16 dark:text-white'
                          : 'text-black/45 dark:text-white/48',
                      )}
                    >
                      {String(entity.attributes?.friendly_name ?? entity.entity_id)}
                    </button>
                  ))}
                </div>
              )}
              <AlarmDetail entity={selectedAlarmEntity} />
            </div>
          : <p className="py-8 text-center text-sm text-black/45 dark:text-white/45">Allarme non disponibile</p>}
      </GlassSheet>
    </header>
  )
}

function alarmEntityRank(entity: HassEntity): number {
  const text = `${entity.entity_id} ${String(entity.attributes?.friendly_name ?? '')}`.toLowerCase()
  let score = entity.state === 'unavailable' || entity.state === 'unknown' ? -1_000 : 0
  if (entity.attributes?.lastArmedTime || entity.attributes?.targetState) score += 200
  if (text.includes('casa') || text.includes('home')) score += 100
  if (text.includes('ring')) score += 50
  return score
}

/** EZVIZ espone un pannello ausiliario che non rappresenta l'allarme di casa. */
function isIgnoredAlarm(entity: HassEntity): boolean {
  const text = `${entity.entity_id} ${String(entity.attributes?.friendly_name ?? '')}`.toLowerCase()
  return text.includes('ezviz')
}

function AlarmStatus({ entities, onClick }: { entities: HassEntity[]; onClick: () => void }) {
  const active = entities.find((entity) => isArmed(entity.state))
  const armed = Boolean(active)
  const disarmed = entities.every((entity) => entity.state === 'disarmed')
  const label = active
    ? (ALARM_STATE_LABELS[active.state] ?? active.state)
    : disarmed ? 'Disinserito' : 'Stato non disponibile'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full w-[58px] shrink-0 items-center justify-center transition hover:bg-black/[0.05] active:scale-95 dark:hover:bg-white/[0.08]"
      aria-label={`Allarme ${label}: apri controlli`}
      title={`Allarme · ${label}`}
    >
      <span className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-[13px]',
        armed
          ? 'alarm-armed-indicator bg-red-500/14 text-red-600 dark:bg-red-400/16 dark:text-red-300'
          : disarmed
            ? 'bg-emerald-500/14 text-emerald-600 dark:bg-emerald-400/16 dark:text-emerald-300'
            : 'bg-black/[0.06] text-black/40 dark:bg-white/[0.08] dark:text-white/45',
      )}>
        <ShieldCheck size={22} aria-hidden="true" />
        <span className={cn(
          'absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-white/90 dark:ring-[#1d1d1f]',
          armed ? 'bg-red-500' : disarmed ? 'bg-emerald-500' : 'bg-black/25 dark:bg-white/30',
        )} aria-hidden="true" />
      </span>
    </button>
  )
}

function IndoorTemperatureDetail({
  sources,
  average,
}: {
  sources: ReturnType<typeof indoorClimateTemperatureSources>
  average: number | null
}) {
  return (
    <div className="space-y-4 pb-1">
      <div className="flex items-center justify-between rounded-[18px] bg-orange-500/10 px-5 py-4 dark:bg-orange-400/12">
        <span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-black/40 dark:text-white/42">Media</span>
          <span className="mt-1 block text-sm text-black/50 dark:text-white/52">{sources.length} {sources.length === 1 ? 'clima disponibile' : 'climi disponibili'}</span>
        </span>
        <span className="text-4xl font-semibold tabular-nums text-orange-600 dark:text-orange-300">{formatTemperature(average)}</span>
      </div>
      {sources.length > 0 ? (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.entityId} className="flex min-h-14 items-center gap-3 rounded-[15px] bg-black/[0.045] px-4 dark:bg-white/[0.07]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-orange-500/10 text-orange-600 dark:bg-orange-400/12 dark:text-orange-300">
                <Thermometer size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#1d1d1f] dark:text-white">{source.label}</span>
                <span className="block truncate text-[11px] text-black/35 dark:text-white/38">{source.entityId}</span>
              </span>
              <span className="shrink-0 text-xl font-semibold tabular-nums text-[#1d1d1f] dark:text-white">{formatTemperature(source.value)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-[15px] bg-black/[0.045] px-4 py-8 text-center text-sm text-black/45 dark:bg-white/[0.07] dark:text-white/45">
          Nessun climate sta riportando una temperatura interna.
        </p>
      )}
      <p className="px-1 text-[11px] leading-relaxed text-black/38 dark:text-white/40">
        La media usa esclusivamente l’attributo “temperatura corrente” dei climate disponibili. Ogni variazione ricevuta da Home Assistant aggiorna subito valori e media.
      </p>
    </div>
  )
}

function StatusPower({ value, risk, onClick }: { value: string | null; risk: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-w-[102px] items-center gap-2 px-3 text-left transition hover:bg-black/[0.05] active:scale-[0.98] dark:hover:bg-white/[0.08]"
      aria-label={`Apri consumo totale casa e auto: ${value ?? 'non disponibile'}`}
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

function StatusTemperature({ label, value, icon, onClick }: { label: string; value: number | null; icon: ReactNode; onClick?: () => void }) {
  const content = <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-white/38">{label}</span>
        <span className="block text-[19px] font-semibold leading-none tabular-nums text-[#1d1d1f] dark:text-white">{formatTemperature(value)}</span>
      </span>
    </>
  if (onClick) return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-w-[108px] items-center gap-2 px-3.5 text-left transition hover:bg-black/[0.05] active:scale-[0.98] dark:hover:bg-white/[0.08]"
      aria-label={`Apri dettaglio temperatura ${label.toLowerCase()}: ${formatTemperature(value)}`}
    >
      {content}
    </button>
  )
  return (
    <div className="flex h-full min-w-[108px] items-center gap-2 px-3.5">
      {content}
    </div>
  )
}
