import type { CSSProperties, ElementType, MouseEvent as ReactMouseEvent } from 'react'
import { useMemo, useRef, useState } from 'react'
import { Droplets, Fan, Flame, Minus, Plus, Power, Snowflake, Sparkles, Thermometer, Wind } from 'lucide-react'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import {
  formatClimateTemp,
  getClimateModes,
  getClimateOptionLabel,
  getClimateVisualState,
  getHvacModeLabel,
  pickOnHvacMode,
} from '../../lib/climate'
import { TEMP_UNIT } from '../../lib/units'
import { cn } from '../../lib/utils'
import type { WidgetCardStatus, WidgetVisualSize } from './types'
import { WidgetCardControlButton, WidgetCardIcon, WidgetCardShell } from './WidgetCardBase'
import { temperatureTone, widgetTones, type RingTone } from './utils/getRingColorScale'

interface ClimateCardProps {
  entityId: string
  cardId?: string
  label: string
  size?: WidgetVisualSize
  className?: string
  isEditing?: boolean
  isDragging?: boolean
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

const QUICK_MODE_ORDER = ['heat_cool', 'auto', 'cool', 'heat', 'dry', 'fan_only']

function numberAttr(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function listAttr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function clampTemperature(value: number, min: number, max: number, step: number): number {
  const snapped = Math.round(value / step) * step
  return Math.min(max, Math.max(min, Number(snapped.toFixed(step < 1 ? 1 : 0))))
}

function climateTone(tone: ReturnType<typeof getClimateVisualState>['tone']): RingTone {
  if (tone === 'heating') return widgetTones.heat
  if (tone === 'cooling') return widgetTones.cool
  if (tone === 'drying') return widgetTones.water
  if (tone === 'fan') return widgetTones.ok
  return widgetTones.neutral
}

function climateStatus(tone: ReturnType<typeof getClimateVisualState>['tone']): WidgetCardStatus {
  if (tone === 'heating') return 'heating'
  if (tone === 'cooling') return 'cooling'
  if (tone === 'drying') return 'dry'
  if (tone === 'fan') return 'fan'
  if (tone === 'off') return 'off'
  if (tone === 'unavailable') return 'unavailable'
  return 'idle'
}

function modeIconKey(visual: ReturnType<typeof getClimateVisualState>): string {
  if (visual.activeAction === 'heating') return 'heat'
  if (visual.activeAction === 'cooling') return 'cool'
  if (visual.activeAction === 'drying') return 'dry'
  if (visual.activeAction === 'fan') return 'fan_only'
  return visual.mode
}

/** Card clima canonica: un'unica sorgente live, cinque layout realmente adattivi. */
export function ClimateCard({
  entityId,
  cardId,
  label,
  size = 'M',
  className,
  isEditing = false,
  isDragging = false,
}: ClimateCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light, medium } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const setOptimisticState = useEntityStore((state) => state.setOptimisticState)
  const setSelectedEntity = useUIStore((state) => state.setSelectedEntity)
  const busyRef = useRef(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const current = numberAttr(entity?.attributes?.current_temperature)
  const target = numberAttr(entity?.attributes?.temperature)
  const humidity = numberAttr(entity?.attributes?.current_humidity)
  const min = numberAttr(entity?.attributes?.min_temp) ?? 7
  const max = numberAttr(entity?.attributes?.max_temp) ?? 35
  const step = numberAttr(entity?.attributes?.target_temp_step) ?? 0.5
  const modes = getClimateModes(entity)
  const fanModes = listAttr(entity?.attributes?.fan_modes)
  const fanMode = typeof entity?.attributes?.fan_mode === 'string' ? entity.attributes.fan_mode : undefined
  const swingMode = typeof entity?.attributes?.swing_mode === 'string' ? entity.attributes.swing_mode : undefined
  const presetMode = typeof entity?.attributes?.preset_mode === 'string' ? entity.attributes.preset_mode : undefined
  const visual = getClimateVisualState(entity)
  const modeTone = climateTone(visual.tone)
  const targetTone = temperatureTone(target ?? current)
  const Icon = MODE_ICONS[modeIconKey(visual)] ?? Thermometer
  const unavailable = visual.unavailable
  const busy = pendingAction !== null
  const controlsDisabled = busy || unavailable || isEditing
  const onMode = pickOnHvacMode(modes, entity?.state)
  const quickModes = useMemo(() => {
    const currentMode = visual.mode !== 'off' ? visual.mode : undefined
    return [...new Set([currentMode, ...QUICK_MODE_ORDER])]
      .filter((mode): mode is string => typeof mode === 'string' && modes.includes(mode))
      .slice(0, size === 'L' ? 5 : 4)
  }, [modes, size, visual.mode])

  const perform = (
    key: string,
    optimistic: () => void,
    task: () => Promise<unknown>,
    rollback: () => void,
  ) => {
    if (busyRef.current || unavailable || isEditing) return
    busyRef.current = true
    setPendingAction(key)
    setError(null)
    optimistic()
    void Promise.resolve()
      .then(task)
      .catch(() => {
        rollback()
        actionFailed()
        setError('Comando non eseguito')
      })
      .finally(() => {
        busyRef.current = false
        setPendingAction(null)
      })
  }

  const setTemperature = (nextValue: number) => {
    if (!entity || target === undefined) return
    const next = clampTemperature(nextValue, min, max, step)
    perform(
      'temperature',
      () => { light(); setOptimisticState(entityId, entity.state, { temperature: next }) },
      () => call('climate', 'set_temperature', { entity_id: entityId, temperature: next }),
      () => setOptimisticState(entityId, entity.state, { temperature: target }),
    )
  }

  const setMode = (mode: string) => {
    if (!entity) return
    const previousAction = entity.attributes?.hvac_action
    perform(
      `mode:${mode}`,
      () => { medium(); setOptimisticState(entityId, mode, { hvac_action: mode === 'off' ? 'off' : undefined }) },
      () => call('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: mode }),
      () => setOptimisticState(entityId, entity.state, { hvac_action: previousAction }),
    )
  }

  const togglePower = () => setMode(visual.isOn ? 'off' : onMode)

  const cycleFan = () => {
    if (!entity || fanModes.length === 0) return
    const index = Math.max(0, fanModes.indexOf(fanMode ?? fanModes[0]))
    const next = fanModes[(index + 1) % fanModes.length]
    perform(
      'fan',
      () => { light(); setOptimisticState(entityId, entity.state, { fan_mode: next }) },
      () => call('climate', 'set_fan_mode', { entity_id: entityId, fan_mode: next }),
      () => setOptimisticState(entityId, entity.state, { fan_mode: fanMode }),
    )
  }

  const common = {
    label,
    size,
    Icon,
    visual,
    current,
    target,
    humidity,
    fanMode,
    swingMode,
    presetMode,
    accent: modeTone.color,
    targetAccent: targetTone.color,
    min,
    max,
    step,
    controlsDisabled,
    preview: isEditing,
    pendingAction,
    error,
    quickModes,
    onAdjust: (delta: number) => target !== undefined && setTemperature(target + delta * step),
    onPower: togglePower,
    onMode: setMode,
    onFan: cycleFan,
  }

  return (
    <WidgetCardShell
      id={cardId}
      type="climate"
      size={size}
      title={label}
      icon={Icon}
      status={climateStatus(visual.tone)}
      accentColor={modeTone.color}
      isActive={visual.isOn}
      isUnavailable={unavailable}
      isPending={busy}
      isEditing={isEditing}
      isDragging={isDragging}
      onClick={() => setSelectedEntity(entityId)}
      className={cn('widget-card-climate', feedbackClass, className)}
    >
      {size === 'XS' ? <ClimateXS {...common} />
        : size === 'S' ? <ClimateS {...common} />
          : size === 'M' ? <ClimateM {...common} />
            : size === 'L' ? <ClimateL {...common} />
              : <ClimateXL {...common} />}
    </WidgetCardShell>
  )
}

interface ClimateLayoutProps {
  label: string
  size: WidgetVisualSize
  Icon: ElementType
  visual: ReturnType<typeof getClimateVisualState>
  current?: number
  target?: number
  humidity?: number
  fanMode?: string
  swingMode?: string
  presetMode?: string
  accent: string
  targetAccent: string
  min: number
  max: number
  step: number
  controlsDisabled: boolean
  preview: boolean
  pendingAction: string | null
  error: string | null
  quickModes: string[]
  onAdjust: (delta: number) => void
  onPower: () => void
  onMode: (mode: string) => void
  onFan: () => void
}

function ClimateXS(props: ClimateLayoutProps) {
  return (
    <div className="flex h-full min-w-0 items-center gap-2">
      <WidgetCardIcon Icon={props.Icon} size="XS" accentColor={props.accent} active={props.visual.isOn} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold leading-tight text-[#1d1d1f] dark:text-white">{props.label}</p>
        <p className="mt-0.5 truncate text-[10px] font-medium leading-tight" style={{ color: props.error ? '#dc2626' : props.accent }}>
          {props.error ?? climateHeadline(props.visual)}
        </p>
      </div>
      <div className="climate-xs-temperature shrink-0 text-right">
        <p className="text-[18px] font-semibold leading-none tabular-nums text-[#1d1d1f] dark:text-white">{formatClimateTemp(props.current, TEMP_UNIT)}</p>
        <p className="mt-1 text-[9px] font-semibold tabular-nums text-black/38 dark:text-white/42">SET {formatClimateTemp(props.target, TEMP_UNIT)}</p>
      </div>
      <ClimatePowerButton {...props} compact />
    </div>
  )
}

function ClimateS(props: ClimateLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ClimateHeader {...props} compact />
      <div className="climate-layout-s mt-auto flex min-w-0 items-end gap-2 pt-1.5">
        <div className="climate-s-current"><TemperatureMetric label="Stanza" value={props.current} size="sm" /></div>
        <div className="mx-auto flex items-center gap-1">
          <span className="climate-s-step"><TemperatureButton direction="down" {...props} /></span>
          <div className="min-w-[58px] text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-white/38">Set</p>
            <p className="mt-0.5 text-[20px] font-semibold leading-none tabular-nums" style={{ color: props.targetAccent }}>{formatClimateTemp(props.target, TEMP_UNIT)}</p>
          </div>
          <span className="climate-s-step"><TemperatureButton direction="up" {...props} /></span>
        </div>
      </div>
    </div>
  )
}

function ClimateM(props: ClimateLayoutProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ClimateHeader {...props} />
      <div className="climate-layout-m mt-auto grid min-h-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3 pt-1.5">
        <div className="min-w-0">
          <TemperatureMetric label="Temperatura stanza" value={props.current} size="lg" />
          <p className="climate-m-meta mt-1 truncate text-[11px] text-black/42 dark:text-white/45">{climateMeta(props)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="climate-m-step"><TemperatureButton direction="down" {...props} /></span>
          <TargetDial {...props} diameter={62} />
          <span className="climate-m-step"><TemperatureButton direction="up" {...props} /></span>
        </div>
      </div>
    </div>
  )
}

function ClimateL(props: ClimateLayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2.5">
      <ClimateHeader {...props} />
      <div className="grid min-h-0 grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.35fr)] items-center gap-4">
        <div className="min-w-0">
          <TemperatureMetric label="Temperatura stanza" value={props.current} size="xl" />
          {props.humidity !== undefined && <p className="mt-2 flex items-center gap-1 text-xs text-black/42 dark:text-white/45"><Droplets size={13} /> Umidità {Math.round(props.humidity)}%</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <TemperatureButton direction="down" {...props} />
          <TargetDial {...props} diameter={80} />
          <TemperatureButton direction="up" {...props} />
        </div>
        <QuickModes {...props} />
      </div>
      <ClimateFooter {...props} />
    </div>
  )
}

function ClimateXL(props: ClimateLayoutProps) {
  return (
    <div className="climate-layout-xl grid h-full min-h-0 grid-cols-[minmax(0,1.15fr)_auto_minmax(240px,1.35fr)] items-center gap-5">
      <div className="flex h-full min-w-0 flex-col">
        <ClimateHeader {...props} />
        <div className="mt-auto flex items-end gap-3 pt-1">
          <TemperatureMetric label="Stanza" value={props.current} size="lg" />
          <p className="mb-0.5 min-w-0 truncate text-[11px] text-black/42 dark:text-white/45">{climateMeta(props)}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <TemperatureButton direction="down" {...props} />
        <TargetDial {...props} diameter={70} />
        <TemperatureButton direction="up" {...props} />
      </div>
      <div className="climate-xl-actions flex h-full min-w-0 flex-col justify-center gap-2">
        <QuickModes {...props} wide />
        <ClimateFooter {...props} compact />
      </div>
    </div>
  )
}

function ClimateHeader(props: ClimateLayoutProps & { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <WidgetCardIcon Icon={props.Icon} size={props.compact ? 'S' : props.size} accentColor={props.accent} active={props.visual.isOn} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn('truncate font-semibold leading-tight text-[#1d1d1f] dark:text-white', props.compact ? 'text-[13px]' : 'text-[15px]')}>{props.label}</p>
        <p className="mt-0.5 truncate text-[11px] font-medium" style={{ color: props.error ? '#dc2626' : props.accent }}>
          {props.error ?? climateHeadline(props.visual)}
        </p>
      </div>
      <ClimatePowerButton {...props} />
    </div>
  )
}

function ClimatePowerButton(props: ClimateLayoutProps & { compact?: boolean }) {
  const stop = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    props.onPower()
  }
  const className = cn(
    'relative flex shrink-0 items-center justify-center rounded-full transition',
    !props.preview && 'tap-target pointer-events-auto active:scale-90 disabled:opacity-35',
    props.compact ? 'h-8 w-8' : 'h-9 min-w-9 gap-1 px-2.5',
  )
  const style = {
    color: props.visual.isOn ? props.accent : 'var(--ink-secondary)',
    background: props.visual.isOn ? `color-mix(in srgb, ${props.accent} 16%, transparent)` : 'var(--fill-subtle)',
  }
  const content = <>
      <Power size={props.compact ? 14 : 15} aria-hidden="true" />
      {!props.compact && <span className="text-[10px] font-bold">{props.pendingAction?.startsWith('mode:') ? '…' : props.visual.onOffLabel}</span>}
    </>
  if (props.preview) return <span className={className} style={style} aria-hidden="true">{content}</span>
  return (
    <button
      type="button"
      onClick={stop}
      disabled={props.controlsDisabled}
      aria-label={props.visual.isOn ? `Spegni ${props.label}` : `Accendi ${props.label}`}
      aria-pressed={props.visual.isOn}
      className={className}
      style={style}
    >{content}</button>
  )
}

function TemperatureButton(props: ClimateLayoutProps & { direction: 'up' | 'down' }) {
  const icon = props.direction === 'up' ? <Plus size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />
  if (props.preview) return <span className="widget-card-control inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-black/35 dark:text-white/38" aria-hidden="true">{icon}</span>
  return (
    <WidgetCardControlButton
      disabled={props.controlsDisabled || props.target === undefined}
      onClick={() => props.onAdjust(props.direction === 'up' ? 1 : -1)}
      label={props.direction === 'up' ? 'Aumenta temperatura' : 'Diminuisci temperatura'}
    >
      {icon}
    </WidgetCardControlButton>
  )
}

function TemperatureMetric({ label, value, size }: { label: string; value?: number; size: 'sm' | 'lg' | 'xl' }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-white/38">{label}</p>
      <p className={cn(
        'mt-1 font-semibold leading-none tracking-tight tabular-nums text-[#1d1d1f] dark:text-white',
        size === 'sm' ? 'text-[20px]' : size === 'lg' ? 'text-[30px]' : 'text-[38px]',
      )}>{formatClimateTemp(value, TEMP_UNIT)}</p>
    </div>
  )
}

function TargetDial(props: ClimateLayoutProps & { diameter: number }) {
  const value = props.target ?? props.current
  const progress = value === undefined ? 0 : Math.max(0, Math.min(1, (value - props.min) / (props.max - props.min)))
  return (
    <div
      className="climate-target-ring flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: props.diameter,
        height: props.diameter,
        '--climate-target-accent': props.targetAccent,
        '--climate-target-progress': `${progress * 100}%`,
      } as CSSProperties}
      aria-label={`Temperatura impostata ${formatClimateTemp(props.target, TEMP_UNIT)}`}
    >
      <span className="climate-target-core flex h-[calc(100%_-_8px)] w-[calc(100%_-_8px)] flex-col items-center justify-center rounded-full">
        <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-black/35 dark:text-white/38">Set</span>
        <span className={cn('mt-0.5 font-semibold leading-none tabular-nums', props.diameter >= 78 ? 'text-[22px]' : 'text-[18px]')} style={{ color: props.targetAccent }}>
          {formatClimateTemp(props.target, TEMP_UNIT)}
        </span>
      </span>
    </div>
  )
}

function QuickModes(props: ClimateLayoutProps & { compact?: boolean; wide?: boolean }) {
  if (props.quickModes.length === 0) return null
  return (
    <div className="min-w-0">
      {!props.compact && !props.wide && <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-white/38">Modalità</p>}
      <div className={cn('grid gap-1.5', props.compact ? 'grid-cols-4' : props.wide || props.quickModes.length >= 4 ? 'grid-cols-2' : 'grid-cols-1')}>
        {props.quickModes.map((mode) => {
          const active = props.visual.mode === mode
          const Icon = MODE_ICONS[mode] ?? Thermometer
          const className = cn(
            'flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-[11px] px-2 text-[10px] font-semibold transition',
            !props.preview && 'pointer-events-auto active:scale-95 disabled:opacity-35',
            active ? 'text-white shadow-sm' : 'bg-black/[0.055] text-black/50 dark:bg-white/[0.08] dark:text-white/52',
          )
          const content = <>
              <Icon size={13} className="shrink-0" aria-hidden="true" />
              {!props.compact && <span className="truncate">{getHvacModeLabel(mode)}</span>}
            </>
          if (props.preview) return <span key={mode} className={className} style={active ? { background: props.accent } : undefined}>{content}</span>
          return (
            <button
              key={mode}
              type="button"
              onClick={(event) => { event.stopPropagation(); props.onMode(mode) }}
              disabled={props.controlsDisabled}
              aria-pressed={active}
              aria-label={`Modalità ${getHvacModeLabel(mode)}`}
              className={className}
              style={active ? { background: props.accent } : undefined}
            >
              {content}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ClimateFooter(props: ClimateLayoutProps & { compact?: boolean }) {
  const items: { Icon: ElementType; label: string; action?: () => void }[] = []
  if (props.fanMode) items.push({ Icon: Fan, label: `Ventola ${getClimateOptionLabel(props.fanMode)}`, action: props.onFan })
  if (props.swingMode) items.push({ Icon: Wind, label: `Swing ${getClimateOptionLabel(props.swingMode)}` })
  if (props.presetMode) items.push({ Icon: Sparkles, label: getClimateOptionLabel(props.presetMode) })
  if (items.length === 0) return null
  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {items.map(({ Icon, label, action }) => action && !props.preview ? (
        <button
          key={label}
          type="button"
          onClick={(event) => { event.stopPropagation(); action() }}
          disabled={props.controlsDisabled}
          className="pointer-events-auto flex min-h-7 min-w-0 items-center gap-1 rounded-full bg-black/[0.05] px-2 text-[9px] font-semibold text-black/45 transition active:scale-95 disabled:opacity-35 dark:bg-white/[0.07] dark:text-white/48"
          aria-label={`${label}; tocca per cambiare`}
        >
          <Icon size={11} className="shrink-0" /><span className="truncate">{props.compact ? label.replace('Ventola ', '') : label}</span>
        </button>
      ) : (
        <span key={label} className="flex min-h-7 min-w-0 items-center gap-1 rounded-full bg-black/[0.05] px-2 text-[9px] font-semibold text-black/40 dark:bg-white/[0.07] dark:text-white/45">
          <Icon size={11} className="shrink-0" /><span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  )
}

function climateMeta(props: ClimateLayoutProps): string {
  const parts = [
    props.fanMode ? `Ventola ${getClimateOptionLabel(props.fanMode)}` : null,
    props.swingMode ? `Swing ${getClimateOptionLabel(props.swingMode)}` : null,
    props.humidity !== undefined ? `Umidità ${Math.round(props.humidity)}%` : null,
  ].filter(Boolean)
  return parts.join(' · ') || props.visual.actionLabel
}

function climateHeadline(visual: ReturnType<typeof getClimateVisualState>): string {
  return visual.actionLabel.startsWith('Modalità') || visual.actionLabel === 'Spento'
    ? visual.actionLabel
    : `${visual.actionLabel} · ${visual.modeLabel}`
}
