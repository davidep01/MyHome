import { motion, type HTMLMotionProps } from 'framer-motion'
import { AlertTriangle, GripVertical, Loader2, WifiOff } from 'lucide-react'
import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { getWidgetSizeConfig } from './utils/getWidgetSizeConfig'
import { widgetTones } from './utils/getRingColorScale'
import type { WidgetAnimationPreset, WidgetCardBaseProps, WidgetVisualSize } from './types'

function presetClass(preset?: WidgetAnimationPreset) {
  if (!preset || preset === 'none') return ''
  return `widget-anim-${preset}`
}

export function WidgetCardShell({
  id,
  type,
  size = 'M',
  title,
  subtitle,
  icon: Icon,
  status = 'default',
  accentColor = widgetTones.neutral.color,
  gradient,
  animationPreset = 'none',
  isActive = false,
  isLoading = false,
  isError = false,
  isUnavailable = false,
  isOffline = false,
  isEditing = false,
  isDragging = false,
  actions,
  children,
  className,
  onClick,
}: WidgetCardBaseProps) {
  const cfg = getWidgetSizeConfig(size)
  const blocked = isLoading || isError || isUnavailable || isOffline
  const interactive = Boolean(onClick) && !blocked && !isEditing

  return (
    <motion.div
      id={id}
      data-widget-card
      data-widget-type={type}
      data-widget-size={size}
      data-widget-status={status}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={title}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.()
        }
      } : undefined}
      className={cn(
        'widget-card-shell glass glass-border relative flex h-full min-w-0 flex-col overflow-hidden rounded-[18px]',
        cfg.paddingClass,
        interactive && 'cursor-pointer select-none',
        isActive && 'widget-card-active',
        isUnavailable && 'widget-card-muted',
        isOffline && 'widget-card-muted',
        isDragging && 'widget-card-dragging',
        presetClass(animationPreset),
        className,
      )}
      style={{
        minHeight: cfg.minHeight,
        '--widget-accent': accentColor,
        '--widget-gradient': gradient ?? 'linear-gradient(135deg, rgba(255,255,255,0.80), rgba(255,255,255,0.44))',
        '--widget-glow': isActive ? `${accentColor}3b` : 'rgba(0,0,0,0)',
      } as CSSProperties}
      whileTap={interactive ? { scale: 0.982 } : undefined}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
    >
      <WidgetCardMotionLayer preset={animationPreset} active={isActive} />
      <WidgetCardGlossLayer />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {isLoading ? (
          <WidgetCardSkeleton size={size} />
        ) : isError ? (
          <WidgetCardError title={title} />
        ) : isUnavailable || isOffline ? (
          <WidgetCardUnavailable title={title} offline={isOffline} />
        ) : (
          children ?? (
            <>
              <WidgetCardHeader title={title} subtitle={subtitle} Icon={Icon} accentColor={accentColor} size={size} />
              <div className="mt-auto">
                {actions?.length ? <WidgetCardActions actions={actions} /> : null}
              </div>
            </>
          )
        )}
      </div>
      {isEditing && <WidgetCardEditOverlay size={size} />}
    </motion.div>
  )
}

export function WidgetCardHeader({
  title,
  subtitle,
  Icon,
  accentColor = widgetTones.neutral.color,
  size = 'M',
  trailing,
}: {
  title: string
  subtitle?: ReactNode
  Icon?: ElementType
  accentColor?: string
  size?: WidgetVisualSize
  trailing?: ReactNode
}) {
  const cfg = getWidgetSizeConfig(size)
  return (
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <WidgetCardIcon Icon={Icon} size={size} accentColor={accentColor} />}
        <div className="min-w-0">
          <p className={cn('line-clamp-2 font-semibold leading-tight text-[#1d1d1f]', cfg.titleClass)}>{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs font-medium text-black/45">{subtitle}</p>}
        </div>
      </div>
      {trailing}
    </div>
  )
}

export function WidgetCardIcon({
  Icon,
  size = 'M',
  accentColor = widgetTones.neutral.color,
  active = false,
  animationPreset,
}: {
  Icon: ElementType
  size?: WidgetVisualSize
  accentColor?: string
  active?: boolean
  animationPreset?: WidgetAnimationPreset
}) {
  const cfg = getWidgetSizeConfig(size)
  const box = size === 'S' ? 40 : size === 'M' ? 44 : 52
  return (
    <span
      className={cn('widget-card-icon flex shrink-0 items-center justify-center rounded-full', active && 'widget-card-icon-active', presetClass(animationPreset))}
      style={{
        width: box,
        height: box,
        background: `${accentColor}1f`,
        color: accentColor,
      }}
    >
      <Icon size={cfg.icon} />
    </span>
  )
}

export function WidgetCardValue({
  value,
  unit,
  secondary,
  size = 'M',
}: {
  value: ReactNode
  unit?: string
  secondary?: ReactNode
  size?: WidgetVisualSize
}) {
  const cfg = getWidgetSizeConfig(size)
  return (
    <div className="min-w-0">
      <div className={cn('font-semibold leading-none tracking-normal text-[#1d1d1f] tabular-nums', cfg.valueClass)}>
        {value}
        {unit && <span className="ml-1 align-baseline text-base font-medium text-black/45">{unit}</span>}
      </div>
      {secondary && <p className="mt-1 truncate text-xs font-medium text-black/45">{secondary}</p>}
    </div>
  )
}

export function WidgetCardBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof widgetTones }) {
  const t = widgetTones[tone]
  return (
    <span className="inline-flex min-h-6 items-center rounded-full px-2.5 text-[11px] font-bold" style={{ background: t.bg, color: t.color }}>
      {children}
    </span>
  )
}

export function WidgetCardFooter({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex min-h-[28px] items-center justify-between gap-2 pt-2">{children}</div>
}

export function WidgetCardActions({ actions }: { actions: NonNullable<WidgetCardBaseProps['actions']> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map(({ id, label, Icon, onClick, disabled, primary }) => (
        <button
          key={id}
          type="button"
          onClick={(event) => { event.stopPropagation(); onClick() }}
          disabled={disabled}
          className={cn(
            'inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40',
            primary ? 'bg-[#1d1d1f] text-white' : 'bg-black/[0.07] text-black/60',
          )}
          aria-label={label}
        >
          {Icon && <Icon size={16} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

export function WidgetCardRing({
  value,
  max = 100,
  size = 'M',
  color = widgetTones.neutral.color,
  trackColor = 'rgba(0,0,0,0.08)',
  label,
  children,
}: {
  value: number
  max?: number
  size?: WidgetVisualSize
  color?: string
  trackColor?: string
  label?: string
  children?: ReactNode
}) {
  const cfg = getWidgetSizeConfig(size)
  const px = cfg.ring
  const pct = Math.max(0, Math.min(1, value / max))
  const deg = pct * 360
  return (
    <div className="widget-ring relative grid shrink-0 place-items-center rounded-full" style={{ width: px, height: px }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${deg}deg, ${trackColor} 0deg)`,
        }}
      />
      {/* niente backdrop-blur annidato: blur dentro la card frosted costa caro sulle GPU dei tablet */}
      <div className="absolute inset-[5px] rounded-full bg-white/85" />
      <div className="relative z-10 grid place-items-center text-center">
        {children ?? (
          <>
            <span className="text-base font-bold leading-none tabular-nums text-[#1d1d1f]">{Math.round(value)}</span>
            {label && <span className="mt-0.5 text-[10px] font-semibold text-black/42">{label}</span>}
          </>
        )}
      </div>
    </div>
  )
}

export function WidgetCardDial({
  value,
  min = 0,
  max = 40,
  current,
  size = 'M',
  color = widgetTones.cool.color,
  children,
}: {
  value: number
  min?: number
  max?: number
  current?: number
  size?: WidgetVisualSize
  color?: string
  children?: ReactNode
}) {
  const cfg = getWidgetSizeConfig(size)
  const px = cfg.ring
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const currentPct = current === undefined ? null : Math.max(0, Math.min(1, (current - min) / (max - min)))
  return (
    <div className="widget-dial relative grid shrink-0 place-items-center rounded-full" style={{ width: px, height: px }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 220deg, #0ea5e9 0deg, #22c55e 92deg, #f59e0b 188deg, #dc2626 ${Math.max(200, pct * 280)}deg, rgba(0,0,0,0.08) 0deg)`,
        }}
      />
      <div className="absolute inset-[6px] rounded-full bg-white/88" />
      {currentPct !== null && (
        <span
          className="absolute h-2.5 w-2.5 rounded-full bg-[#1d1d1f] shadow"
          style={{
            transform: `rotate(${220 + currentPct * 280}deg) translateY(calc(-${px / 2}px + 5px))`,
            transformOrigin: '50% 50%',
          }}
        />
      )}
      <div className="relative z-10 grid place-items-center text-center" style={{ color }}>
        {children}
      </div>
    </div>
  )
}

export function WidgetCardSlider({
  value,
  color = widgetTones.cool.color,
  onChange,
  onCommit,
}: {
  value: number
  color?: string
  onChange?: (value: number) => void
  onCommit?: (value: number) => void
}) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={Math.round(value)}
      onChange={(event) => onChange?.(Number(event.target.value))}
      onPointerUp={(event) => onCommit?.(Number((event.currentTarget as HTMLInputElement).value))}
      // Regolare lo slider non deve aprire il pannello della card né avviare il drag del grid
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="widget-card-slider h-8 w-full"
      style={{ accentColor: color }}
      aria-label="Regola valore"
    />
  )
}

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
      className={cn('widget-card-toggle relative h-9 w-[58px] rounded-full transition active:scale-95 disabled:opacity-40', checked ? 'on' : '')}
      style={{ '--toggle-color': color } as CSSProperties}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      disabled={disabled}
      aria-label={label}
      aria-pressed={checked}
    >
      <span className="absolute left-[4px] top-[4px] h-7 w-7 rounded-full bg-white shadow transition-transform" />
    </button>
  )
}

export function WidgetCardSkeleton({ size = 'M' }: { size?: WidgetVisualSize }) {
  const lines = size === 'S' ? 2 : size === 'M' ? 3 : 4
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="h-10 w-10 rounded-full bg-black/[0.06] widget-anim-shimmer" />
      <div className="mt-auto space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <div key={index} className={cn('h-3 rounded-full bg-black/[0.06] widget-anim-shimmer', index === 0 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  )
}

export function WidgetCardUnavailable({ title, offline = false }: { title: string; offline?: boolean }) {
  const Icon = offline ? WifiOff : AlertTriangle
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.06] text-black/35">
        <Icon size={20} />
      </div>
      <div>
        <p className="truncate text-sm font-semibold text-black/65">{title}</p>
        <p className="mt-1 text-xs font-medium text-black/38">{offline ? 'Offline' : 'Non disponibile'}</p>
      </div>
    </div>
  )
}

export function WidgetCardError({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col justify-between gap-3 widget-anim-errorShake">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/12 text-red-600">
        <AlertTriangle size={20} />
      </div>
      <div>
        <p className="truncate text-sm font-semibold text-black/75">{title}</p>
        <p className="mt-1 text-xs font-medium text-red-600">Errore controllato</p>
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

export function WidgetCardMotionLayer({ preset, active }: { preset?: WidgetAnimationPreset; active?: boolean }) {
  if (!active || !preset || preset === 'none') return null
  return <span className={cn('widget-card-motion-layer absolute inset-0 z-0', presetClass(preset))} aria-hidden="true" />
}

export function WidgetCardGlossLayer() {
  return (
    <>
      {/* Liquid-glass depth stack — back → front. See `.widget-card-*` in index.css. */}
      <span className="widget-card-gradient-layer absolute inset-0 z-0" aria-hidden="true" />
      <span className="widget-card-lens absolute inset-0 z-0" aria-hidden="true" />
      <span className="widget-card-gloss-layer absolute inset-0 z-0" aria-hidden="true" />
      <span className="widget-card-state-glow absolute inset-0 z-0" aria-hidden="true" />
    </>
  )
}

export function WidgetIconButton({
  children,
  onClick,
  label,
  disabled,
  className,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn('inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.07] text-black/60 transition active:scale-95 disabled:opacity-40', className)}
      onClick={(event) => { event.stopPropagation(); onClick() }}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </button>
  )
}

export function WidgetCardLoader() {
  return <Loader2 size={18} className="animate-spin text-black/40" />
}

export type WidgetCardShellProps = WidgetCardBaseProps & Omit<HTMLMotionProps<'div'>, keyof WidgetCardBaseProps>
