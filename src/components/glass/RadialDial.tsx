import { useRef } from 'react'
import { tokens } from '../../design/tokens'

interface RadialDialProps {
  value: number
  min?: number
  max?: number
  step?: number
  color?: string
  size?: number
  label: string
  sublabel?: string
  /** Stable accessible name for the interactive dial. */
  ariaLabel?: string
  /** Live value while turning the wheel (fires per step). Makes the dial interactive. */
  onChange?: (value: number) => void
  /** Final value when the finger lifts — use this to send the command to HA. */
  onCommit?: (value: number) => void
  /** Per-step haptic click. */
  onTick?: () => void
}

// 270° arc with a 90° gap at the bottom: from -135° to +135° (clockwise from top).
const A0 = -135
const A1 = 135
const SWEEP = A1 - A0 // 270

/** Point on the circle for an angle measured clockwise from 12 o'clock. */
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) }
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from)
  const e = polar(cx, cy, r, to)
  const large = to - from > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

export function RadialDial({
  value,
  min = 0,
  max = 100,
  step = 0.5,
  color = tokens.accent.blue,
  size = 104,
  label,
  sublabel,
  ariaLabel,
  onChange,
  onCommit,
  onTick,
}: RadialDialProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const lastValue = useRef(value)
  const keyboardDirty = useRef(false)
  const interactive = Boolean(onChange || onCommit)
  const safeStep = step > 0 ? step : 1

  const clamped = Math.min(Math.max(value, min), max)
  const pct = (clamped - min) / (max - min || 1)
  const valAngle = A0 + pct * SWEEP

  const CX = 100
  const CY = 100
  const R = 80
  const knob = polar(CX, CY, R, valAngle)

  // Pointer (clientX/Y) → snapped temperature value.
  const valueFromPointer = (clientX: number, clientY: number): number | null => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * 200
    const py = ((clientY - rect.top) / rect.height) * 200
    const dx = px - CX
    const dy = py - CY
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI // clockwise from top, (-180,180]
    // Outside the 270° arc → snap to the nearest end (clamp handles the bottom gap).
    const clampedDeg = Math.min(A1, Math.max(A0, deg))
    const p = (clampedDeg - A0) / SWEEP
    const raw = min + p * (max - min)
    const snapped = min + Math.round((raw - min) / safeStep) * safeStep
    return Math.min(max, Math.max(min, Number(snapped.toFixed(6))))
  }

  const handleMove = (clientX: number, clientY: number) => {
    const next = valueFromPointer(clientX, clientY)
    if (next == null) return
    if (next !== lastValue.current) {
      lastValue.current = next
      onTick?.()
      onChange?.(next)
    }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return
    e.currentTarget.setPointerCapture(e.pointerId)
    keyboardDirty.current = false
    lastValue.current = clamped
    handleMove(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    handleMove(e.clientX, e.clientY)
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    onCommit?.(lastValue.current)
  }

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!interactive) return

    let next: number | undefined
    let shouldSnap = true
    const current = lastValue.current
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = current + safeStep
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current - safeStep
        break
      case 'PageUp':
        next = current + safeStep * 10
        break
      case 'PageDown':
        next = current - safeStep * 10
        break
      case 'Home':
        next = min
        shouldSnap = false
        break
      case 'End':
        next = max
        shouldSnap = false
        break
      default:
        return
    }

    e.preventDefault()
    const snapped = shouldSnap ? min + Math.round((next - min) / safeStep) * safeStep : next
    const bounded = Math.min(max, Math.max(min, Number(snapped.toFixed(6))))
    if (bounded === lastValue.current) return

    lastValue.current = bounded
    keyboardDirty.current = true
    onTick?.()
    onChange?.(bounded)
  }

  const commitKeyboardValue = () => {
    if (!keyboardDirty.current) return
    keyboardDirty.current = false
    onCommit?.(lastValue.current)
  }

  const accessibleName = ariaLabel ?? sublabel?.split('·')[0]?.trim() ?? 'Valore'

  // Tick marks around the arc (a "wheel" feel).
  const ticks = Array.from({ length: 28 }, (_, i) => {
    const a = A0 + (i / 27) * SWEEP
    const outer = polar(CX, CY, R + 11, a)
    const inner = polar(CX, CY, R + 6, a)
    const on = a <= valAngle + 0.001
    return { ...outer, x2: inner.x, y2: inner.y, on, key: i }
  })

  return (
    <div className="relative grid place-items-center select-none" style={{ width: size, height: size }}>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        className={interactive
          ? 'absolute inset-0 cursor-pointer touch-none rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc]'
          : 'absolute inset-0'}
        role={interactive ? 'slider' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? accessibleName : undefined}
        aria-valuemin={interactive ? min : undefined}
        aria-valuemax={interactive ? max : undefined}
        aria-valuenow={interactive ? clamped : undefined}
        aria-valuetext={interactive ? label : undefined}
        aria-orientation={interactive ? 'horizontal' : undefined}
        aria-hidden={interactive ? undefined : true}
        onFocus={() => { lastValue.current = clamped }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
            commitKeyboardValue()
          }
        }}
        onBlur={commitKeyboardValue}
      >
        {/* tick ring */}
        {ticks.map((t) => (
          <line
            key={t.key}
            x1={t.x} y1={t.y} x2={t.x2} y2={t.y2}
            stroke={t.on ? color : 'rgba(0,0,0,0.12)'}
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
        {/* track + value arc */}
        <path d={arc(CX, CY, R, A0, A1)} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="12" strokeLinecap="round" />
        <path d={arc(CX, CY, R, A0, Math.max(A0 + 0.01, valAngle))} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
        {/* knob */}
        {interactive && (
          <g>
            <circle cx={knob.x} cy={knob.y} r="13" fill="#fff" stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
            <circle cx={knob.x} cy={knob.y} r="5" fill={color} />
          </g>
        )}
      </svg>
      <div className="relative text-center pointer-events-none">
        <div className="text-[34px] font-semibold leading-none tabular-nums" style={{ color }}>{label}</div>
        {sublabel && <div className="mt-1.5 text-[11px] text-black/40">{sublabel}</div>}
      </div>
    </div>
  )
}
