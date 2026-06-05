import { useRef } from 'react'
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
}: DragSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const clamp = (v: number) => Math.min(100, Math.max(0, v))

  const getVal = (clientX: number) => {
    const el = trackRef.current
    if (!el) return value
    const { left, width } = el.getBoundingClientRect()
    return clamp(Math.round(((clientX - left) / width) * 100))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(getVal(e.clientX))
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 0 && e.pressure === 0) return
    onChange(getVal(e.clientX))
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = getVal(e.clientX)
    onChange(v)
    onChangeEnd?.(v)
  }

  const pct = clamp(value)
  const isAmber = variant === 'amber'

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex justify-between text-sm">
          <span style={{ color: 'var(--ink-secondary)' }}>{label}</span>
          <span style={{ fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        </div>
      )}

      {/* Inset groove track */}
      <div
        ref={trackRef}
        className="lg-slider"
        style={{ height: 36, cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
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
