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
  onChange,
  onCommit,
  onTick,
}: RadialDialProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const lastValue = useRef(value)
  const interactive = Boolean(onChange || onCommit)

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
    return Math.min(max, Math.max(min, Math.round(raw / step) * step))
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
    lastValue.current = value
    handleMove(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    handleMove(e.clientX, e.clientY)
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    onCommit?.(lastValue.current)
  }

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
        className={interactive ? 'absolute inset-0 cursor-pointer touch-none' : 'absolute inset-0'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
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
        <div className="text-[34px] font-semibold leading-none text-[#1d1d1f] tabular-nums">{label}</div>
        {sublabel && <div className="mt-1.5 text-[11px] text-black/40">{sublabel}</div>}
      </div>
    </div>
  )
}
