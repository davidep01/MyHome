import { useEffect, useId, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { AlertTriangle, BatteryCharging, CarFront, Gauge, HousePlug, Zap } from 'lucide-react'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { haApi, type HAHistoryPoint } from '../../../api/backend'
import { framerSpring } from '../../../design/tokens'
import {
  powerValueInKw,
  type EnergyWindow,
  type WallboxMode,
} from '../../../lib/statusBarEnergy'
import { sumPowerPoints, type PowerPoint } from '../../../lib/powerHistory'
import { cn } from '../../../lib/utils'
import { GlassSheet } from '../../glass/GlassSheet'

export const CAR_CHARGING_POWER_ID = 'sensor.chargesplit_domus_car_charging_power'
export const PILOT_AMPS_ID = 'sensor.chargesplit_domus_pilot_amps'
const VOLTAGE_IDS = [
  'sensor.chargesplit_domus_voltage_l1',
  'sensor.chargesplit_domus_voltage_l2',
  'sensor.chargesplit_domus_voltage_l3',
] as const

function measurement(entity: HassEntity | undefined, maximumFractionDigits = 1): string {
  if (!entity || entity.state === 'unknown' || entity.state === 'unavailable') return '—'
  const value = Number(entity.state)
  if (!Number.isFinite(value)) return entity.state
  const unit = String(entity.attributes?.unit_of_measurement ?? '')
  return `${value.toLocaleString('it-IT', { maximumFractionDigits })}${unit ? ` ${unit}` : ''}`
}

function modeLabel(mode: WallboxMode): string {
  if (mode === 'charging') return 'Ricarica in corso'
  if (mode === 'connected') return 'Auto collegata'
  return 'Auto scollegata'
}

export function WallboxDetailSheet({
  open,
  onClose,
  mode,
  entities,
  statusEntityId,
}: {
  open: boolean
  onClose: () => void
  mode: WallboxMode
  entities: HassEntities
  statusEntityId: string
}) {
  const charging = mode === 'charging'
  const rawStatus = entities[statusEntityId]?.state
  const voltages = VOLTAGE_IDS.map((id) => entities[id]).filter(Boolean)

  return (
    <GlassSheet open={open} onClose={onClose} title="Wallbox" side="center">
      <div className="space-y-4 pb-1">
        <div className={cn(
          'flex items-center gap-4 rounded-[20px] p-4',
          charging ? 'bg-emerald-500/10' : mode === 'connected' ? 'bg-[#0066cc]/10' : 'bg-black/[0.04]',
        )}>
          <span className={cn(
            'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px]',
            charging ? 'energy-charge-live bg-emerald-500/14 text-emerald-600 dark:text-emerald-300' : 'bg-[#0066cc]/12 text-[#0066cc] dark:text-[#5ac8fa]',
          )}>
            <CarFront size={29} aria-hidden="true" />
            {charging && <Zap size={13} fill="currentColor" className="absolute -bottom-1 -right-1 rounded-full bg-emerald-500 p-0.5 text-white" aria-hidden="true" />}
          </span>
          <span className="min-w-0">
            <span className="block text-xl font-semibold text-[#1d1d1f] dark:text-white">{modeLabel(mode)}</span>
            <span className="mt-0.5 block truncate text-xs font-medium uppercase tracking-[0.08em] text-black/38 dark:text-white/42">{rawStatus ?? 'Stato non disponibile'}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Metric
            icon={<BatteryCharging size={18} aria-hidden="true" />}
            label="Potenza auto"
            value={measurement(entities[CAR_CHARGING_POWER_ID], 2)}
            color="text-emerald-600 dark:text-emerald-300"
          />
          <Metric
            icon={<Gauge size={18} aria-hidden="true" />}
            label="Corrente carica"
            value={measurement(entities[PILOT_AMPS_ID], 1)}
            color="text-[#0066cc] dark:text-[#5ac8fa]"
          />
        </div>

        {voltages.length > 0 && (
          <div className="rounded-[16px] bg-black/[0.035] px-3 py-2.5 dark:bg-white/[0.06]">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-white/38">Tensione fasi</p>
            <div className="grid grid-cols-3 gap-2">
              {VOLTAGE_IDS.map((id, index) => (
                <div key={id} className="rounded-[11px] bg-white/65 px-2 py-2 text-center dark:bg-black/15">
                  <p className="text-[10px] font-semibold text-black/38 dark:text-white/40">L{index + 1}</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#1d1d1f] dark:text-white">{measurement(entities[id], 0)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="px-1 text-[11px] leading-relaxed text-black/38 dark:text-white/42">
          I valori cambiano appena ChargeSplit pubblica un nuovo stato su Home Assistant.
        </p>
      </div>
    </GlassSheet>
  )
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-[16px] bg-black/[0.04] p-3 dark:bg-white/[0.06]">
      <span className={cn('flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/65 dark:bg-black/15', color)}>{icon}</span>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-black/35 dark:text-white/38">{label}</p>
      <p className="mt-0.5 truncate text-xl font-semibold tabular-nums text-[#1d1d1f] dark:text-white">{value}</p>
    </div>
  )
}

function historyPoints(
  history: HAHistoryPoint[] | undefined,
  currentKw: number | null,
  currentUpdatedAt?: string,
  sourceUnit?: unknown,
): PowerPoint[] {
  const now = Date.now()
  const cutoff = now - 30 * 60_000
  const points = (history ?? []).flatMap((point) => {
    const at = Date.parse(point.last_updated || point.last_changed)
    // `minimal_response` di HA omette gli attributi sui punti successivi al
    // primo: in quel caso l'unità live del sensore resta la fonte canonica.
    const kw = powerValueInKw(point.state, point.attributes?.unit_of_measurement ?? sourceUnit)
    return Number.isFinite(at) && at >= cutoff && kw !== null ? [{ at, kw: Math.max(0, kw) }] : []
  })
  if (currentKw !== null) {
    const entityTime = currentUpdatedAt ? Date.parse(currentUpdatedAt) : Number.NaN
    points.push({ at: Number.isFinite(entityTime) && entityTime >= cutoff ? entityTime : now, kw: Math.max(0, currentKw) })
  }
  points.sort((left, right) => left.at - right.at)
  const deduped = points.filter((point, index) => index === points.length - 1 || point.at !== points[index + 1].at)
  if (deduped.length > 0 && deduped[0].at > cutoff) deduped.unshift({ at: cutoff, kw: deduped[0].kw })
  if (deduped.length <= 120) return deduped
  const stride = Math.ceil(deduped.length / 120)
  return deduped.filter((_, index) => index % stride === 0 || index === deduped.length - 1)
}

export function EnergyDetailSheet({
  open,
  onClose,
  houseEntity,
  carEntity,
  domesticPowerKw,
  carPowerKw,
  powerKw,
  window,
  risk,
}: {
  open: boolean
  onClose: () => void
  houseEntity?: HassEntity
  carEntity?: HassEntity
  domesticPowerKw: number | null
  carPowerKw: number | null
  powerKw: number | null
  window: EnergyWindow
  risk: boolean
}) {
  const houseHistory = useQuery({
    queryKey: ['status-energy-history', houseEntity?.entity_id],
    queryFn: () => haApi.history(houseEntity!.entity_id, 1),
    enabled: open && Boolean(houseEntity),
    staleTime: 15_000,
    refetchInterval: open ? 30_000 : false,
  })
  const carHistory = useQuery({
    queryKey: ['status-energy-history', carEntity?.entity_id],
    queryFn: () => haApi.history(carEntity!.entity_id, 1),
    enabled: open && Boolean(carEntity),
    staleTime: 15_000,
    refetchInterval: open ? 30_000 : false,
  })
  const points = useMemo(
    () => sumPowerPoints(
      historyPoints(houseHistory.data, domesticPowerKw, houseEntity?.last_updated, houseEntity?.attributes?.unit_of_measurement),
      historyPoints(carHistory.data, carPowerKw, carEntity?.last_updated, carEntity?.attributes?.unit_of_measurement),
    ),
    [carEntity?.attributes?.unit_of_measurement, carEntity?.last_updated, carHistory.data, carPowerKw, domesticPowerKw, houseEntity?.attributes?.unit_of_measurement, houseEntity?.last_updated, houseHistory.data],
  )
  const isPending = Boolean(houseEntity && houseHistory.isPending) || Boolean(carEntity && carHistory.isPending)
  const isError = houseHistory.isError || carHistory.isError
  const remaining = powerKw === null ? null : Math.max(0, window.limitKw - powerKw)
  const percent = powerKw === null ? 0 : Math.min(100, (powerKw / window.limitKw) * 100)

  return (
    <GlassSheet open={open} onClose={onClose} title="Consumo totale · ultimi 30 minuti" side="center" wide>
      <div className="space-y-4 pb-1">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]',
              risk ? 'energy-risk-indicator bg-orange-500/14 text-orange-600' : 'bg-[#0066cc]/10 text-[#0066cc] dark:text-[#5ac8fa]',
            )}>
              <HousePlug size={23} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[34px] font-light leading-none tabular-nums text-[#1d1d1f] dark:text-white">
                {powerKw === null ? '—' : powerKw.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {powerKw !== null && <span className="ml-1 text-base font-semibold text-black/38 dark:text-white/42">kW</span>}
              </span>
              <span className="mt-1 block text-xs font-semibold text-black/40 dark:text-white/45">Casa + ricarica auto</span>
            </span>
          </div>
          <div className={cn('rounded-[14px] px-3 py-2 text-right', risk ? 'bg-orange-500/12' : 'bg-black/[0.04] dark:bg-white/[0.06]')}>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-black/38 dark:text-white/42">Limite attivo</p>
            <p className={cn('text-lg font-semibold tabular-nums', risk ? 'text-orange-700 dark:text-orange-300' : 'text-[#1d1d1f] dark:text-white')}>{window.limitKw} kW</p>
            <p className="text-[10px] text-black/38 dark:text-white/40">{window.label}</p>
          </div>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]" aria-label={`${Math.round(percent)}% del limite disponibile`}>
          <motion.span
            className={cn('block h-full origin-left rounded-full', risk ? 'bg-orange-500' : 'bg-[#0066cc]')}
            animate={{ scaleX: percent / 100 }}
            transition={{ type: 'spring', stiffness: 180, damping: 25 }}
          />
        </div>

        <PowerChart points={points} limitKw={window.limitKw} risk={risk} loading={isPending} />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Metric icon={<HousePlug size={18} />} label="Consumo domestico" value={domesticPowerKw === null ? '—' : `${domesticPowerKw.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kW`} color="text-[#0066cc]" />
          <Metric icon={<CarFront size={18} />} label="Ricarica auto" value={carPowerKw === null ? '—' : `${carPowerKw.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kW`} color="text-emerald-600" />
          <Metric icon={<Gauge size={18} />} label="Margine disponibile" value={remaining === null ? '—' : `${remaining.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kW`} color={risk ? 'text-orange-600' : 'text-[#0066cc]'} />
          <Metric icon={<AlertTriangle size={18} />} label="Avviso da" value={`${window.warningKw.toLocaleString('it-IT')} kW`} color="text-orange-600" />
        </div>

        <p className="px-1 text-[11px] leading-relaxed text-black/38 dark:text-white/42">
          Stato istantaneo push da Home Assistant. Lo storico del grafico viene riallineato ogni 30 secondi.
          {isError ? ' Lo storico non è momentaneamente raggiungibile: il valore live continua a funzionare.' : ''}
        </p>
      </div>
    </GlassSheet>
  )
}

function PowerChart({ points, limitKw, risk, loading }: { points: PowerPoint[]; limitKw: number; risk: boolean; loading: boolean }) {
  const gradientId = useId().replace(/:/g, '')
  // L'ultimo punto è il riferimento live; se il grafico è vuoto le coordinate
  // non vengono renderizzate e un asse temporale sintetico è sufficiente.
  const now = points.at(-1)?.at ?? 30 * 60_000
  const start = now - 30 * 60_000
  const maxKw = Math.max(limitKw, ...points.map((point) => point.kw), 1) * 1.08
  const x = (at: number) => 22 + Math.max(0, Math.min(1, (at - start) / (now - start))) * 596
  const y = (kw: number) => 166 - Math.max(0, Math.min(1, kw / maxKw)) * 136
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${x(point.at).toFixed(1)} ${y(point.kw).toFixed(1)}`).join(' ')
  const area = line ? `${line} L ${x(points.at(-1)?.at ?? now).toFixed(1)} 166 L ${x(points[0]?.at ?? start).toFixed(1)} 166 Z` : ''
  const thresholdY = y(limitKw)
  const last = points.at(-1)

  return (
    <div className="relative overflow-hidden rounded-[18px] bg-black/[0.035] p-3 dark:bg-white/[0.055]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-white/38">Andamento live</p>
        <p className="text-[10px] font-semibold text-black/35 dark:text-white/38">Soglia {limitKw} kW</p>
      </div>
      <svg viewBox="0 0 640 190" className="h-[190px] w-full" role="img" aria-label="Grafico del consumo elettrico negli ultimi trenta minuti">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={risk ? '#f97316' : '#0a84ff'} stopOpacity="0.28" />
            <stop offset="100%" stopColor={risk ? '#f97316' : '#0a84ff'} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => (
          <line key={ratio} x1="22" x2="618" y1={30 + ratio * 136} y2={30 + ratio * 136} stroke="currentColor" strokeOpacity="0.07" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1="22" x2="618" y1={thresholdY} y2={thresholdY} stroke="#f97316" strokeOpacity="0.55" strokeDasharray="5 6" vectorEffect="non-scaling-stroke" />
        {area && <motion.path d={area} fill={`url(#${gradientId})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />}
        {line && (
          <motion.path
            key={`${points.length}-${last?.at}-${last?.kw}`}
            d={line}
            fill="none"
            stroke={risk ? '#f97316' : '#0a84ff'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          />
        )}
        {last && (
          <motion.circle
            cx={x(last.at)} cy={y(last.kw)} r="5"
            fill={risk ? '#f97316' : '#0a84ff'}
            animate={{ r: [4, 7, 4], opacity: [1, 0.55, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <text x="22" y="185" fontSize="10" fill="currentColor" opacity="0.38">−30 min</text>
        <text x="320" y="185" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.38">−15 min</text>
        <text x="618" y="185" textAnchor="end" fontSize="10" fill="currentColor" opacity="0.38">ora</text>
      </svg>
      {loading && points.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-black/35 dark:text-white/38">Carico lo storico…</p>}
    </div>
  )
}

export interface EnergyAlertPayload {
  powerKw: number
  window: EnergyWindow
}

export function EnergyRiskToast({
  alert,
  onClose,
  onOpen,
}: {
  alert: EnergyAlertPayload | null
  onClose: () => void
  onOpen: () => void
}) {
  useEffect(() => {
    if (!alert) return
    const timer = window.setTimeout(onClose, 9_000)
    return () => clearTimeout(timer)
  }, [alert, onClose])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {alert && (
        <motion.button
          type="button"
          onClick={() => { onClose(); onOpen() }}
          className="fixed right-[max(16px,env(safe-area-inset-right))] top-[calc(max(14px,env(safe-area-inset-top))+68px)] z-[72] flex w-[min(410px,calc(100vw-32px))] items-center gap-3 rounded-[18px] border border-orange-500/30 bg-white/94 p-3 text-left shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)] backdrop-blur-2xl dark:bg-[#1c1c1e]/95"
          initial={{ x: 'calc(100% + 32px)', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 'calc(100% + 32px)', opacity: 0 }}
          transition={framerSpring}
          role="alert"
          aria-label="Avviso consumo elettrico elevato"
        >
          <span className="energy-risk-indicator flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-orange-500/14 text-orange-600">
            <AlertTriangle size={21} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#1d1d1f] dark:text-white">Consumo vicino al limite</span>
            <span className="mt-0.5 block text-xs leading-snug text-black/52 dark:text-white/55">
              {alert.powerKw.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kW su {alert.window.limitKw} kW. Riduci i carichi per evitare lo stacco.
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-orange-500/12 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-orange-700">Energia</span>
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  )
}
