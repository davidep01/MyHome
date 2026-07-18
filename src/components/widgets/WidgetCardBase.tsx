import { motion, type HTMLMotionProps } from 'framer-motion'
import { AlertTriangle, GripVertical, Lock, LockOpen, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ElementType, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { getWidgetSizeConfig } from './utils/getWidgetSizeConfig'
import { widgetTones } from './utils/getRingColorScale'
import type { WidgetCardBaseProps, WidgetVisualSize } from './types'

/**
 * Card entità — anatomia HomeKit a due zone:
 *   [icona]                [controllo]
 *   …spazio…
 *   Nome dispositivo
 *   Stato · dettaglio
 * Il vetro prende una tinta contestuale molto leggera dalla famiglia; quando
 * la card è attiva la tinta cresce insieme alla luminosità del fondo.
 */
export function WidgetCardShell({
  id,
  type,
  size = 'M',
  title,
  icon: Icon,
  status = 'default',
  accentColor = widgetTones.neutral.color,
  isActive = false,
  isLoading = false,
  isError = false,
  isUnavailable = false,
  isOffline = false,
  isPending = false,
  isEditing = false,
  isDragging = false,
  children,
  media,
  className,
  onClick,
}: WidgetCardBaseProps) {
  const cfg = getWidgetSizeConfig(size)
  // An unavailable entity can still be opened to inspect diagnostics and
  // attributes. Only states with no useful detail surface block the affordance.
  const blocked = isLoading || isError || isOffline
  const interactive = Boolean(onClick) && !blocked && !isEditing

  return (
    <motion.div
      id={id}
      data-widget-card
      data-widget-type={type}
      data-widget-size={size}
      data-widget-status={status}
      aria-busy={isPending || undefined}
      className={cn(
        'widget-card-shell relative flex h-full min-w-0 flex-col overflow-hidden rounded-[18px]',
        cfg.paddingClass,
        interactive && 'select-none',
        isActive && 'widget-card-active',
        (isUnavailable || isOffline) && 'widget-card-muted',
        isDragging && 'widget-card-dragging',
        className,
      )}
      style={{ minHeight: cfg.minHeight, '--widget-accent': accentColor } as CSSProperties}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
    >
      {/* Stato attivo = vetro più luminoso: layer bianco che fa solo fade. */}
      <span className="widget-card-fill absolute inset-0 z-0" aria-hidden="true" />
      <span className="widget-card-tint pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
      {/* Media full-bleed (live camera / artwork): sopra il vetro, sotto controlli e testo. */}
      {media && !isUnavailable && !isOffline && !isLoading && !isError && (
        <div className="absolute inset-0 z-[5] overflow-hidden rounded-[18px]" aria-hidden="true">
          {media}
        </div>
      )}
      {interactive && (
        <button
          type="button"
          className="absolute inset-0 z-20 cursor-pointer rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc]"
          onClick={onClick}
          aria-label={`Apri dettagli di ${title}`}
          aria-haspopup="dialog"
        />
      )}
      <div className={cn('relative z-30 flex h-full min-h-0 flex-col', interactive && 'pointer-events-none')}>
        {isLoading ? (
          <WidgetCardSkeleton size={size} />
        ) : isError ? (
          <WidgetCardError title={title} />
        ) : isUnavailable || isOffline ? (
          <WidgetCardUnavailable title={title} offline={isOffline} />
        ) : (
          children ?? (
            <>
              <div className="flex items-start justify-between gap-2">
                {Icon && <WidgetCardIcon Icon={Icon} size={size} accentColor={accentColor} active={isActive} />}
              </div>
              <WidgetCardIdentity title={title} size={size} active={isActive} />
            </>
          )
        )}
      </div>
      {isEditing && <WidgetCardEditOverlay size={size} />}
    </motion.div>
  )
}

/**
 * Il glifo della card: cerchio piatto, colorato SOLO quando il dispositivo è
 * attivo (come HomeKit). `widget-card-icon-active` accende anche le parti
 * animate delle icone SVG (.ai-part).
 */
export function WidgetCardIcon({
  Icon,
  size = 'M',
  accentColor = widgetTones.neutral.color,
  active = false,
}: {
  Icon: ElementType
  size?: WidgetVisualSize
  accentColor?: string
  active?: boolean
}) {
  const cfg = getWidgetSizeConfig(size)
  const box = size === 'S' ? 34 : size === 'M' ? 38 : 44
  return (
    <span
      className={cn('widget-card-icon flex shrink-0 items-center justify-center rounded-full', active && 'widget-card-icon-active')}
      style={{
        width: box,
        height: box,
        background: active ? `color-mix(in srgb, ${accentColor} 15%, transparent)` : 'var(--widget-icon-idle)',
        color: active ? accentColor : 'var(--widget-icon-ink)',
      }}
    >
      <Icon size={cfg.icon} />
    </span>
  )
}

/** Blocco identità in basso: (valore grande) + nome + riga di stato. */
export function WidgetCardIdentity({
  title,
  state,
  stateColor,
  value,
  unit,
  size = 'M',
  active = false,
  singleLineTitle = false,
}: {
  title: string
  state?: string
  /** Colore della riga di stato quando significativo (riscalda, allarme…). */
  stateColor?: string
  value?: string
  unit?: string
  size?: WidgetVisualSize
  active?: boolean
  /** true quando sotto c'è lo slider: il nome non deve rubargli la riga. */
  singleLineTitle?: boolean
}) {
  const cfg = getWidgetSizeConfig(size)
  return (
    <div className="mt-auto min-w-0 pt-2">
      {value !== undefined && (
        <p className={cn('font-semibold leading-none tracking-tight text-[#1d1d1f] tabular-nums', cfg.valueClass)}>
          {value}
          {unit && <span className="ml-0.5 align-baseline text-[0.55em] font-semibold text-black/40">{unit}</span>}
        </p>
      )}
      <p className={cn(
        'font-semibold leading-snug text-[#1d1d1f]',
        cfg.titleClass,
        value !== undefined ? 'mt-1 line-clamp-1 text-black/55' : singleLineTitle ? 'line-clamp-1' : 'line-clamp-2',
        !active && value === undefined && 'text-[#1d1d1f]/80',
      )}>
        {title}
      </p>
      {state && (
        <p
          className="mt-0.5 truncate text-[13px] font-normal leading-snug"
          style={{ color: stateColor ?? 'var(--ink-secondary)' }}
        >
          {state}
        </p>
      )}
    </div>
  )
}

/** Interruttore iOS — visivo 32×52, area tocco ≥44 via ::before. */
export function WidgetCardToggle({
  checked,
  disabled,
  onToggle,
  color = widgetTones.ok.color,
  label = 'Toggle',
}: {
  checked: boolean
  disabled?: boolean
  onToggle: () => void
  color?: string
  label?: string
}) {
  return (
    <button
      type="button"
      className={cn('widget-card-toggle pointer-events-auto relative h-8 w-[52px] shrink-0 rounded-full transition active:scale-95 disabled:opacity-40', checked ? 'on' : '')}
      style={{ '--toggle-color': color } as CSSProperties}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      disabled={disabled}
      aria-label={label}
      aria-pressed={checked}
    >
      <span className="absolute left-[3px] top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-sm transition-transform" />
    </button>
  )
}

/** Bottoncino di controllo rotondo (±, play, ↑■↓): 36px visivi, tocco 44. */
export function WidgetCardControlButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="widget-card-control tap-target pointer-events-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-black/55 transition active:scale-90 disabled:opacity-35"
      onClick={(event) => { event.stopPropagation(); onClick() }}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </button>
  )
}

/**
 * Slider inline custom (niente input range nativo): track 5px, riempimento
 * accent, knob bianco 26px. Pointer-driven con capture, non propaga alla card.
 */
export function WidgetCardSlider({
  value,
  color = widgetTones.cool.color,
  onChange,
  onCommit,
  label = 'Regola valore',
  disabled = false,
}: {
  value: number
  color?: string
  onChange?: (value: number) => void
  onCommit?: (value: number) => void
  label?: string
  disabled?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const pct = Math.max(0, Math.min(100, drag ?? value))

  const valueFromPointer = (event: ReactPointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return pct
    return Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100)))
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      aria-valuenow={Math.round(pct)}
      aria-valuetext={`${Math.round(pct)}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('tap-target pointer-events-auto relative h-7 w-full touch-none select-none', disabled && 'cursor-not-allowed opacity-40')}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (disabled) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const v = valueFromPointer(event)
        setDrag(v)
        onChange?.(v)
      }}
      onPointerMove={(event) => {
        if (disabled || drag === null) return
        const v = valueFromPointer(event)
        setDrag(v)
        onChange?.(v)
      }}
      onPointerUp={(event) => {
        if (disabled || drag === null) return
        onCommit?.(valueFromPointer(event))
        setDrag(null)
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (disabled) return
        const step = event.shiftKey ? 10 : 5
        const next = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? Math.max(0, pct - step)
          : event.key === 'ArrowRight' || event.key === 'ArrowUp'
            ? Math.min(100, pct + step)
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? 100
                : null
        if (next === null) return
        event.preventDefault()
        event.stopPropagation()
        onChange?.(next)
        onCommit?.(next)
      }}
    >
      <span className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-black/10" />
      <span
        className="absolute left-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
      <span
        className="widget-card-slider-knob absolute top-1/2"
        style={{ left: `${pct}%` }}
      />
    </div>
  )
}

/**
 * Serrature: MAI un toggle (canone). Da bloccata si apre con pressione
 * prolungata 900ms — il disco interno si riempie (transform-only) come
 * conferma di progresso; da sbloccata un tap richiude.
 */
export function WidgetCardHoldButton({
  locked,
  onUnlock,
  onLock,
  disabled,
  accentColor = widgetTones.warning.color,
}: {
  locked: boolean
  onUnlock: () => void
  onLock: () => void
  disabled?: boolean
  accentColor?: string
}) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }
  const begin = () => {
    if (disabled) return
    if (!locked) { onLock(); return }
    if (timer.current) return
    setHolding(true)
    timer.current = setTimeout(() => { cancel(); onUnlock() }, 900)
  }
  const start = (event: ReactPointerEvent) => {
    event.stopPropagation()
    begin()
  }

  return (
    <button
      type="button"
      className={cn(
        'widget-card-control tap-target pointer-events-auto relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-black/55 transition disabled:opacity-35',
        holding && 'scale-95',
      )}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if (event.repeat) return
        event.preventDefault()
        event.stopPropagation()
        begin()
      }}
      onKeyUp={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        if (locked) cancel()
      }}
      onBlur={cancel}
      disabled={disabled}
      aria-label={locked ? 'Tieni premuto per sbloccare' : 'Blocca'}
      aria-description={locked ? 'Tieni premuto Invio o Spazio per 1 secondo.' : undefined}
    >
      {holding && (
        <span
          className="widget-card-hold-fill absolute inset-0 rounded-full"
          style={{ background: `color-mix(in srgb, ${accentColor} 30%, transparent)` }}
        />
      )}
      <span className="relative">{locked ? <LockOpen size={16} /> : <Lock size={16} />}</span>
    </button>
  )
}

export function WidgetCardSkeleton({ size = 'M' }: { size?: WidgetVisualSize }) {
  return (
    <div className="flex h-full flex-col">
      <div className="h-9 w-9 rounded-full bg-black/[0.06] widget-anim-shimmer" />
      <div className="mt-auto space-y-2 pt-2">
        <div className="h-3.5 w-2/3 rounded-full bg-black/[0.06] widget-anim-shimmer" />
        {size !== 'S' && <div className="h-3 w-1/2 rounded-full bg-black/[0.05] widget-anim-shimmer" />}
      </div>
    </div>
  )
}

export function WidgetCardUnavailable({ title, offline = false }: { title: string; offline?: boolean }) {
  const Icon = offline ? WifiOff : AlertTriangle
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.05] text-black/30">
        <Icon size={17} />
      </div>
      <div className="mt-auto pt-2">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-black/55">{title}</p>
        <p className="mt-0.5 text-[13px] text-black/35">{offline ? 'Offline' : 'Non disponibile'}</p>
      </div>
    </div>
  )
}

export function WidgetCardError({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col widget-anim-errorShake">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-red-600">
        <AlertTriangle size={17} />
      </div>
      <div className="mt-auto pt-2">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-black/70">{title}</p>
        <p className="mt-0.5 text-[13px] text-red-600">Errore controllato</p>
      </div>
    </div>
  )
}

export function WidgetCardEditOverlay({ size }: { size: WidgetVisualSize }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 rounded-[18px] border border-dashed border-[#0066cc]/45 bg-[#0066cc]/[0.035]">
      <div className="absolute right-2 top-2 rounded-full bg-white/92 px-2 py-1 text-[10px] font-bold text-[#0066cc] shadow-sm">{size}</div>
      <div className="absolute bottom-2 left-1/2 flex h-8 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-white/92 text-black/45 shadow-sm">
        <GripVertical size={17} />
      </div>
    </div>
  )
}

export type WidgetCardShellProps = WidgetCardBaseProps & Omit<HTMLMotionProps<'div'>, keyof WidgetCardBaseProps>
