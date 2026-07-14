import { useId, useRef } from 'react'
import { Sun } from 'lucide-react'
import { cn } from '../../lib/utils'

interface DragSliderProps {
  value: number        // 0–100
  onChange: (v: number) => void
  onChangeEnd?: (v: number) => void
  /** Pass any hex/css color — but prefer using `variant` for semantic styling */
  color?: string
  /** 'amber' = brightness (warm yellow fill), 'blue' = generic */
  variant?: 'amber' | 'blue' | 'default'
  className?: string
  label?: string
  /** Accessible name when the visible label lives outside this component. */
  ariaLabel?: string
  disabled?: boolean
}

/**
 * Refined Liquid Glass slider (hearth-design-system spec):
 * - Inset groove (recessed channel with inner shadow)
 * - Coloured fill: amber gradient for brightness, action-blue for others
 * - Layered-shadow knob with center dimple
 * - Value readout anchored to the right edge of the track
 */
export function DragSlider({
  value,
  onChange,
  onChangeEnd,
  variant = 'amber',
  className,
  label,
  ariaLabel,
  disabled = false,
}: DragSliderProps) {
  const inputId = useId()
  const pendingValue = useRef<number | null>(null)

  const clamp = (v: number) => Math.min(100, Math.max(0, v))

  const pct = clamp(value)
  const isAmber = variant === 'amber'
  const accessibleName = ariaLabel ?? label ?? (isAmber ? 'Luminosità' : variant === 'blue' ? 'Volume' : 'Valore')

  const updateValue = (next: number) => {
    const clamped = clamp(next)
    pendingValue.current = clamped
    onChange(clamped)
  }

  const commitPending = () => {
    if (pendingValue.current === null) return
    const next = pendingValue.current
    pendingValue.current = null
    onChangeEnd?.(next)
  }

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex justify-between text-sm">
          <label htmlFor={inputId} style={{ color: 'var(--ink-secondary)' }}>{label}</label>
          <span style={{ fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        </div>
      )}

      {/* Inset groove track */}
      <div
        className={cn(
          'lg-slider focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0066cc]',
          disabled && 'opacity-40',
        )}
        style={{ height: 36, cursor: disabled ? 'not-allowed' : 'pointer', touchAction: 'none', userSelect: 'none' }}
      >
        {/* A native range owns all pointer and keyboard interaction. It is
            visually transparent so the Liquid Glass presentation stays intact. */}
        <input
          id={inputId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          disabled={disabled}
          aria-label={label ? undefined : accessibleName}
          aria-valuetext={`${pct}%`}
          onChange={(event) => updateValue(Number(event.currentTarget.value))}
          onPointerUp={commitPending}
          onPointerCancel={commitPending}
          onKeyUp={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
              commitPending()
            }
          }}
          onBlur={commitPending}
          className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          style={{ touchAction: 'none' }}
        />

        {/* Coloured fill — amber variant carries a sun icon riding the fill */}
        <div
          className={cn('lg-slider-fill', isAmber && 'amber', !isAmber && 'blue')}
          style={{ width: `calc(${pct}% - 2px)` }}
        >
          {isAmber && (
            <Sun
              size={17}
              color="#fff"
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', opacity: 0.9, pointerEvents: 'none', flexShrink: 0 }}
            />
          )}
        </div>

        {/* Layered-shadow knob with center dimple */}
        <div className="lg-slider-knob" style={{ left: `${pct}%` }} />

        {/* Value readout */}
        <span className={cn('lg-slider-val', isAmber && 'amber-text')}>{pct}%</span>
      </div>
    </div>
  )
}
