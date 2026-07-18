import type { ElementType } from 'react'
import { ChevronDown, ChevronUp, Droplets, Fan, Flame, Power, Snowflake, Sparkles, Thermometer } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useUIStore } from '../../store/ui'
import { useEntityStore } from '../../store/entities'
import { TEMP_UNIT } from '../../lib/units'
import {
  formatClimateTemp,
  getClimateModes,
  getClimateVisualState,
  getHvacModeLabel,
  pickOnHvacMode,
} from '../../lib/climate'
import { cn } from '../../lib/utils'

interface ClimateCardProps {
  entityId: string
  label: string
  className?: string
}

const MODE_ICONS: Record<string, ElementType> = {
  off: Power,
  heat: Flame,
  cool: Snowflake,
  auto: Sparkles,
  heat_cool: Sparkles,
  dry: Droplets,
  fan_only: Fan,
}

function toneStyle(tone: string) {
  if (tone === 'heating') {
    return {
      accent: 'var(--alert-orange)',
      iconBg: 'rgba(194,65,12,0.12)',
      cardBg: 'rgba(249,115,22,0.10)',
      border: 'rgba(194,65,12,0.20)',
      glow: 'rgba(194,65,12,0.26)',
    }
  }
  if (tone === 'cooling') {
    return {
      accent: 'var(--cold-blue)',
      iconBg: 'rgba(0,102,204,0.10)',
      cardBg: 'rgba(0,102,204,0.09)',
      border: 'rgba(0,102,204,0.20)',
      glow: 'rgba(0,102,204,0.24)',
    }
  }
  if (tone === 'drying') {
    return {
      accent: 'var(--state-water)',
      iconBg: 'rgba(8,145,178,0.10)',
      cardBg: 'rgba(8,145,178,0.08)',
      border: 'rgba(8,145,178,0.18)',
      glow: 'rgba(8,145,178,0.20)',
    }
  }
  if (tone === 'fan') {
    return {
      accent: 'var(--ok-green)',
      iconBg: 'rgba(21,128,61,0.10)',
      cardBg: 'rgba(21,128,61,0.08)',
      border: 'rgba(21,128,61,0.18)',
      glow: 'rgba(21,128,61,0.18)',
    }
  }
  return {
    accent: 'var(--ink-secondary)',
    iconBg: 'var(--fill-subtle)',
    cardBg: undefined,
    border: undefined,
    glow: undefined,
  }
}

function clampTemperature(value: number, min: number, max: number, step: number) {
  const snapped = Math.round(value / step) * step
  return Math.min(max, Math.max(min, Number(snapped.toFixed(step < 1 ? 1 : 0))))
}

export function ClimateCard({ entityId, label, className }: ClimateCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light, medium } = useHaptic()
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)

  const currentTemp = entity?.attributes?.current_temperature as number | undefined
  const targetTemp = entity?.attributes?.temperature as number | undefined
  const min = (entity?.attributes?.min_temp as number | undefined) ?? 7
  const max = (entity?.attributes?.max_temp as number | undefined) ?? 35
  const step = (entity?.attributes?.target_temp_step as number | undefined) ?? 0.5
  const visual = getClimateVisualState(entity)
  const modes = getClimateModes(entity)
  const unavailable = visual.unavailable
  const modeIconKey = visual.activeAction === 'heating'
    ? 'heat'
    : visual.activeAction === 'cooling'
      ? 'cool'
      : visual.activeAction === 'drying'
        ? 'dry'
        : visual.activeAction === 'fan'
          ? 'fan_only'
          : visual.mode
  const Icon = MODE_ICONS[modeIconKey] ?? Thermometer
  const style = toneStyle(visual.tone)

  const adjust = (delta: number) => {
    if (targetTemp === undefined || !entity || unavailable) return
    light()
    const next = clampTemperature(targetTemp + delta, min, max, step)
    setOptimisticState(entityId, entity.state, { temperature: next })
    call('climate', 'set_temperature', { entity_id: entityId, temperature: next })
  }

  const togglePower = () => {
    if (!entity || unavailable) return
    medium()
    const hvacMode = visual.isOn ? 'off' : pickOnHvacMode(modes, entity.state)
    setOptimisticState(entityId, hvacMode, { hvac_action: hvacMode === 'off' ? 'off' : 'idle' })
    call('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: hvacMode })
  }

  return (
    <GlassCard
      interactive
      onClick={() => setSelectedEntity(entityId)}
      glow={visual.activeAction ? style.glow : undefined}
      className={cn('flex min-h-[168px] flex-col gap-2', unavailable && 'opacity-55', className)}
      style={style.cardBg ? { background: style.cardBg, borderColor: style.border } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: style.iconBg, color: style.accent }}>
          <Icon size={20} />
        </div>
        <div className="flex min-w-0 flex-col items-end gap-1">
          <span
            className={cn(
              'rounded-full px-2 py-1 text-[10px] font-bold',
              visual.isOn ? 'bg-green-500/12 text-green-700' : 'bg-black/[0.07] text-black/45',
            )}
          >
            {visual.onOffLabel}
          </span>
          <span className="max-w-[92px] truncate rounded-full bg-black/5 px-2 py-1 text-[10px] font-semibold text-black/50">
            {visual.modeLabel}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight text-black/90">{label}</p>
        <p className="mt-0.5 truncate text-xs text-black/45">{visual.actionLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[12px] bg-black/[0.04] px-2.5 py-2">
          <p className="text-[10px] font-semibold text-black/40">Stanza</p>
          <p className="mt-1 text-[21px] font-semibold leading-none text-[#1d1d1f] tabular-nums">
            {formatClimateTemp(currentTemp, TEMP_UNIT)}
          </p>
        </div>
        <div className="rounded-[12px] bg-black/[0.04] px-2.5 py-2">
          <p className="text-[10px] font-semibold text-black/40">Set</p>
          <p className="mt-1 text-[21px] font-semibold leading-none tabular-nums" style={{ color: style.accent }}>
            {formatClimateTemp(targetTemp, TEMP_UNIT)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => adjust(-step)}
          disabled={unavailable || targetTemp === undefined}
          aria-label="Diminuisci temperatura"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.06] transition active:scale-90 disabled:opacity-35"
        >
          <ChevronDown size={18} style={{ color: 'var(--ink)' }} />
        </button>
        <button
          onClick={() => adjust(step)}
          disabled={unavailable || targetTemp === undefined}
          aria-label="Aumenta temperatura"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.06] transition active:scale-90 disabled:opacity-35"
        >
          <ChevronUp size={18} style={{ color: 'var(--ink)' }} />
        </button>
        <button
          onClick={togglePower}
          disabled={unavailable}
          className="ml-auto flex h-10 items-center gap-1.5 rounded-full bg-black/[0.06] px-3 text-xs font-bold text-black/60 transition active:scale-95 disabled:opacity-35"
          aria-label={visual.isOn ? 'Spegni clima' : `Accendi clima in ${getHvacModeLabel(pickOnHvacMode(modes, entity?.state))}`}
        >
          <Power size={14} />
          {visual.isOn ? 'OFF' : 'ON'}
        </button>
      </div>
    </GlassCard>
  )
}
