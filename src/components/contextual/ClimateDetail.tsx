import { useRef, useState } from 'react'
import type { ElementType } from 'react'
import { Minus, Plus, Power, Flame, Sparkles, Snowflake, Droplets, Fan, Wind, Thermometer } from 'lucide-react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { RadialDial } from '../glass/RadialDial'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { useEntityStore } from '../../store/entities'
import { tokens } from '../../design/tokens'
import { TEMP_UNIT } from '../../lib/units'
import { cn } from '../../lib/utils'
import {
  formatClimateTemp,
  getClimateModes,
  getClimateOptionLabel,
  getClimateVisualState,
  getHvacModeLabel,
  pickOnHvacMode,
} from '../../lib/climate'

const MODE_ICONS: Record<string, ElementType> = {
  off: Power,
  heat: Flame,
  cool: Snowflake,
  auto: Sparkles,
  heat_cool: Sparkles,
  dry: Droplets,
  fan_only: Fan,
}

const TONE_COLORS: Record<string, string> = {
  heating: tokens.accent.orange,
  cooling: tokens.accent.blue,
  drying: '#0891b2',
  fan: tokens.accent.green,
  idle: 'var(--ink-secondary)',
  off: 'var(--ink-secondary)',
  unavailable: 'var(--ink-secondary)',
}

function listAttr(entity: HassEntity, key: string): string[] {
  const value = entity.attributes?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function snapTemperature(value: number, min: number, max: number, step: number): number {
  const snapped = Math.round(value / step) * step
  return Math.min(max, Math.max(min, Number(snapped.toFixed(step < 1 ? 1 : 0))))
}

function controlButtonClass(active: boolean) {
  return cn(
    'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[14px] px-3 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
    active ? 'text-white shadow-sm' : 'bg-black/6 text-black/50 hover:text-black/75',
  )
}

export function ClimateDetail({ entity }: { entity: HassEntity }) {
  const { call } = useHAService()
  const { light, medium, tick } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const [dragValue, setDragValue] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  const entityId = entity.entity_id
  const current = entity.attributes?.current_temperature as number | undefined
  const target = (entity.attributes?.temperature as number | undefined) ?? current ?? 20
  const min = (entity.attributes?.min_temp as number | undefined) ?? 7
  const max = (entity.attributes?.max_temp as number | undefined) ?? 35
  const step = (entity.attributes?.target_temp_step as number | undefined) ?? 0.5
  const mode = entity.state
  const modes = getClimateModes(entity)
  const fanModes = listAttr(entity, 'fan_modes')
  const fanMode = entity.attributes?.fan_mode as string | undefined
  const swingModes = listAttr(entity, 'swing_modes')
  const swingMode = entity.attributes?.swing_mode as string | undefined
  const presetModes = listAttr(entity, 'preset_modes')
  const presetMode = entity.attributes?.preset_mode as string | undefined
  const visual = getClimateVisualState(entity)
  const color = TONE_COLORS[visual.tone] ?? 'var(--ink-secondary)'
  const onMode = pickOnHvacMode(modes, mode)

  const run = (task: () => Promise<unknown>, optimistic: () => void, rollback: () => void) => {
    if (busyRef.current || visual.unavailable) return
    busyRef.current = true
    setPending(true)
    setError(null)
    optimistic()
    void Promise.resolve()
      .then(task)
      .catch(() => {
        rollback()
        actionFailed()
        setError('Comando clima non eseguito. Riprova.')
      })
      .finally(() => {
        busyRef.current = false
        setPending(false)
      })
  }

  const setTemp = (next: number) => {
    const clamped = snapTemperature(next, min, max, step)
    run(
      () => call('climate', 'set_temperature', { entity_id: entityId, temperature: clamped }),
      () => { light(); setOptimisticState(entityId, mode, { temperature: clamped }) },
      () => setOptimisticState(entityId, mode, { temperature: target }),
    )
  }

  const setMode = (hvacMode: string) => {
    const originalAction = entity.attributes?.hvac_action
    run(
      () => call('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: hvacMode }),
      () => { medium(); setOptimisticState(entityId, hvacMode, { hvac_action: hvacMode === 'off' ? 'off' : 'idle' }) },
      () => setOptimisticState(entityId, mode, { hvac_action: originalAction }),
    )
  }

  const setFan = (fan: string) => {
    run(
      () => call('climate', 'set_fan_mode', { entity_id: entityId, fan_mode: fan }),
      () => { light(); setOptimisticState(entityId, mode, { fan_mode: fan }) },
      () => setOptimisticState(entityId, mode, { fan_mode: fanMode }),
    )
  }

  const setSwing = (swing: string) => {
    run(
      () => call('climate', 'set_swing_mode', { entity_id: entityId, swing_mode: swing }),
      () => { light(); setOptimisticState(entityId, mode, { swing_mode: swing }) },
      () => setOptimisticState(entityId, mode, { swing_mode: swingMode }),
    )
  }

  const setPreset = (preset: string) => {
    run(
      () => call('climate', 'set_preset_mode', { entity_id: entityId, preset_mode: preset }),
      () => { light(); setOptimisticState(entityId, mode, { preset_mode: preset }) },
      () => setOptimisticState(entityId, mode, { preset_mode: presetMode }),
    )
  }

  return (
    <div className={cn('flex flex-col gap-5', feedbackClass)} aria-busy={pending}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[18px] bg-black/[0.05] p-3">
          <p className="text-xs font-semibold text-black/45">Stanza</p>
          <p className="mt-1 text-[30px] font-semibold leading-none text-[#1d1d1f] tabular-nums">
            {formatClimateTemp(current, TEMP_UNIT)}
          </p>
        </div>
        <div className="rounded-[18px] bg-black/[0.05] p-3">
          <p className="text-xs font-semibold text-black/45">Impostata</p>
          <p className="mt-1 text-[30px] font-semibold leading-none tabular-nums" style={{ color }}>
            {formatClimateTemp(dragValue ?? target, TEMP_UNIT)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-[18px] bg-black/[0.04] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1d1d1f]">{visual.actionLabel}</p>
          <p className="mt-0.5 text-xs text-black/45">
            Modalità {visual.modeLabel}
            {fanMode ? ` · Ventola ${getClimateOptionLabel(fanMode)}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold',
            visual.isOn ? 'bg-green-500/12 text-green-700' : 'bg-black/8 text-black/45',
          )}
        >
          {visual.onOffLabel}
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 pt-1">
        <RadialDial
          value={dragValue ?? target}
          min={min}
          max={max}
          step={step}
          color={color}
          size={236}
          label={formatClimateTemp(dragValue ?? target, TEMP_UNIT)}
          sublabel={`Setpoint · ambiente ${formatClimateTemp(current, TEMP_UNIT)}`}
          onChange={pending || visual.unavailable ? undefined : setDragValue}
          onTick={pending || visual.unavailable ? undefined : tick}
          onCommit={pending || visual.unavailable ? undefined : (value) => { setTemp(value); setDragValue(null) }}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTemp(target - step)}
            disabled={pending || visual.unavailable}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/8 text-black/70 transition hover:bg-black/14 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Diminuisci temperatura"
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { if (current !== undefined) setTemp(current) }}
            disabled={pending || visual.unavailable || current === undefined}
            className="rounded-full bg-black/8 px-6 py-3 text-sm font-semibold text-black/80 transition hover:bg-black/14 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Imposta la temperatura ambiente come target"
          >
            Allinea all’ambiente
          </button>
          <button
            type="button"
            onClick={() => setTemp(target + step)}
            disabled={pending || visual.unavailable}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/8 text-black/70 transition hover:bg-black/14 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Aumenta temperatura"
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-black/40">Accensione</p>
        <div className="flex gap-2 rounded-[18px] bg-black/5 p-1.5">
          <button
            type="button"
            onClick={() => setMode(onMode)}
            disabled={pending || visual.unavailable}
            aria-pressed={visual.isOn}
            className={controlButtonClass(visual.isOn)}
            style={visual.isOn ? { background: tokens.accent.green } : undefined}
          >
            ON
            <span className="text-[10px] font-semibold opacity-75">{getHvacModeLabel(onMode)}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('off')}
            disabled={pending || visual.unavailable}
            aria-pressed={mode === 'off'}
            className={controlButtonClass(mode === 'off')}
            style={mode === 'off' ? { background: 'rgba(29,29,31,0.70)' } : undefined}
          >
            <Power size={15} aria-hidden="true" />
            OFF
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-black/40">Modalità HASS</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {modes.map((id) => {
            const active = mode === id
            const Icon = MODE_ICONS[id] ?? Thermometer
            return (
              <button
                type="button"
                key={id}
                onClick={() => setMode(id)}
                disabled={pending || visual.unavailable}
                aria-pressed={active}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[14px] px-2 text-xs font-semibold leading-tight transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
                  active ? 'text-white shadow-sm' : 'bg-black/6 text-black/45 hover:text-black/70',
                )}
                style={active ? { background: id === 'off' ? 'rgba(29,29,31,0.70)' : tokens.accent.blue } : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="text-center">{getHvacModeLabel(id)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {fanModes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-black/40">Ventilatore</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {fanModes.map((fan) => {
              const active = fanMode === fan
              return (
                <button
                  type="button"
                  key={fan}
                  onClick={() => setFan(fan)}
                  disabled={pending || visual.unavailable}
                  aria-pressed={active}
                  className={cn(
                    'flex min-h-[44px] min-w-[64px] items-center justify-center rounded-[14px] px-3 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
                    active ? 'bg-black/16 text-[#1d1d1f]' : 'bg-black/6 text-black/45 hover:text-black/70',
                  )}
                >
                  {getClimateOptionLabel(fan)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {swingModes.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-black/40">
            <Wind size={13} aria-hidden="true" /> Swing
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {swingModes.map((swing) => {
              const active = swingMode === swing
              return (
                <button
                  type="button"
                  key={swing}
                  onClick={() => setSwing(swing)}
                  disabled={pending || visual.unavailable}
                  aria-pressed={active}
                  className={cn(
                    'flex min-h-[44px] min-w-[76px] items-center justify-center rounded-[14px] px-3 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
                    active ? 'bg-black/16 text-[#1d1d1f]' : 'bg-black/6 text-black/45 hover:text-black/70',
                  )}
                >
                  {getClimateOptionLabel(swing)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {presetModes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-black/40">Preset</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {presetModes.map((preset) => {
              const active = presetMode === preset
              return (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setPreset(preset)}
                  disabled={pending || visual.unavailable}
                  aria-pressed={active}
                  className={cn(
                    'flex min-h-[44px] min-w-[76px] items-center justify-center rounded-[14px] px-3 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
                    active ? 'bg-black/16 text-[#1d1d1f]' : 'bg-black/6 text-black/45 hover:text-black/70',
                  )}
                >
                  {getClimateOptionLabel(preset)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-[14px] bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
