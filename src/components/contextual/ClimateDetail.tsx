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
import { cn } from '../../lib/utils'
import { temperatureTone } from '../widgets/utils/getRingColorScale'
import {
  formatClimateTemp,
  getClimateControls,
  snapClimateTemperature,
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

function listAttr(entity: HassEntity, key: string): string[] {
  const value = entity.attributes?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function controlButtonClass(active: boolean) {
  return cn(
    'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[14px] px-3 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
    active ? 'text-[var(--on-accent)] shadow-sm' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink)]',
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
  const { current, target, min, max, step, unit, adjustable } = getClimateControls(entity)
  const mode = entity.state
  const modes = getClimateModes(entity)
  const fanModes = listAttr(entity, 'fan_modes')
  const fanMode = entity.attributes?.fan_mode as string | undefined
  const swingModes = listAttr(entity, 'swing_modes')
  const swingMode = entity.attributes?.swing_mode as string | undefined
  const presetModes = listAttr(entity, 'preset_modes')
  const presetMode = entity.attributes?.preset_mode as string | undefined
  const visual = getClimateVisualState(entity)
  const displayedTemperature = dragValue ?? target
  const color = temperatureTone(displayedTemperature, unit).color
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
    if (!adjustable || !Number.isFinite(next)) return
    const clamped = snapClimateTemperature(next, min, max, step)
    if (clamped === target) return
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
        <div className="rounded-[18px] bg-[var(--fill-subtle)] p-3">
          <p className="text-xs font-semibold text-[var(--ink-secondary)]">Stanza</p>
          <p className="mt-1 text-[30px] font-semibold leading-none text-[var(--ink)] tabular-nums">
            {formatClimateTemp(current, unit)}
          </p>
        </div>
        <div className="rounded-[18px] bg-[var(--fill-subtle)] p-3">
          <p className="text-xs font-semibold text-[var(--ink-secondary)]">Impostata</p>
          <p className="mt-1 text-[30px] font-semibold leading-none tabular-nums" style={{ color }}>
            {formatClimateTemp(displayedTemperature, unit)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-[18px] bg-[var(--fill-subtle)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">{visual.actionLabel}</p>
          <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
            Modalità {visual.modeLabel}
            {fanMode ? ` · Ventola ${getClimateOptionLabel(fanMode)}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold',
            visual.isOn ? 'bg-green-500/12 text-green-700' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)]',
          )}
        >
          {visual.onOffLabel}
        </span>
      </div>

      {!adjustable && <p className="text-[13px] text-[var(--ink-secondary)]">Temperatura impostabile non disponibile: i controlli di temperatura sono disabilitati.</p>}
      <div className="flex flex-col items-center gap-4 pt-1">
        <RadialDial
          value={displayedTemperature ?? min}
          min={min}
          max={max}
          step={step}
          color={color}
          size={236}
          label={formatClimateTemp(displayedTemperature, unit)}
          sublabel={`Setpoint · ambiente ${formatClimateTemp(current, unit)}`}
          onChange={pending || visual.unavailable || !adjustable ? undefined : setDragValue}
          onTick={pending || visual.unavailable || !adjustable ? undefined : tick}
          onCancel={() => setDragValue(null)}
          ariaLabel="Temperatura impostata"
          onCommit={pending || visual.unavailable || !adjustable ? undefined : (value) => { setTemp(value); setDragValue(null) }}
        />
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => target !== undefined && setTemp(target - step)}
            disabled={pending || visual.unavailable || !adjustable || target === undefined || target <= min}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--fill-subtle)] text-[var(--ink-secondary)] transition hover:bg-[var(--widget-control)] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Diminuisci temperatura"
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { if (current !== undefined) setTemp(current) }}
            disabled={pending || visual.unavailable || !adjustable || current === undefined}
            className="rounded-full bg-[var(--fill-subtle)] px-6 py-3 text-sm font-semibold text-[var(--ink-secondary)] transition hover:bg-[var(--widget-control)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Imposta la temperatura ambiente come target"
          >
            Allinea all’ambiente
          </button>
          <button
            type="button"
            onClick={() => target !== undefined && setTemp(target + step)}
            disabled={pending || visual.unavailable || !adjustable || target === undefined || target >= max}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--fill-subtle)] text-[var(--ink-secondary)] transition hover:bg-[var(--widget-control)] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Aumenta temperatura"
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--ink-secondary)]">Accensione</p>
        <div className="flex gap-2 rounded-[18px] bg-[var(--fill-subtle)] p-1.5">
          <button
            type="button"
            onClick={() => setMode(onMode)}
            disabled={pending || visual.unavailable}
            aria-pressed={visual.isOn}
            className={controlButtonClass(visual.isOn)}
            style={visual.isOn ? { background: tokens.accent.blue } : undefined}
          >
            Accendi
            <span className="text-[10px] font-semibold opacity-75">{getHvacModeLabel(onMode)}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('off')}
            disabled={pending || visual.unavailable}
            aria-pressed={mode === 'off'}
            className={controlButtonClass(mode === 'off')}
            style={mode === 'off' ? { background: tokens.accent.blue } : undefined}
          >
            <Power size={15} aria-hidden="true" />
            Spegni
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--ink-secondary)]">Modalità</p>
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
                  active ? 'text-[var(--on-accent)] shadow-sm' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink)]',
                )}
                style={active ? { background: tokens.accent.blue } : undefined}
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
          <p className="mb-2 text-xs font-semibold text-[var(--ink-secondary)]">Ventilatore</p>
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
                    active ? 'bg-[var(--action-fill)] text-[var(--on-accent)]' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink)]',
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
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)]">
            <Wind size={13} aria-hidden="true" /> Oscillazione
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
                    active ? 'bg-[var(--action-fill)] text-[var(--on-accent)]' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink)]',
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
          <p className="mb-2 text-xs font-semibold text-[var(--ink-secondary)]">Preset</p>
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
                    active ? 'bg-[var(--action-fill)] text-[var(--on-accent)]' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink)]',
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
