import { tokens } from '../../design/tokens'

interface RadialDialProps {
  value: number
  min?: number
  max?: number
  color?: string
  size?: number
  label: string
  sublabel?: string
}

export function RadialDial({
  value,
  min = 0,
  max = 100,
  color = tokens.accent.blue,
  size = 104,
  label,
  sublabel,
}: RadialDialProps) {
  const clamped = Math.min(Math.max(value, min), max)
  const pct = (clamped - min) / (max - min || 1)
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const dash = circumference * pct

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 104 104" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="52" cy="52" r={radius} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="8" />
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="relative text-center">
        <div className="text-2xl font-semibold leading-none text-white tabular-nums">{label}</div>
        {sublabel && <div className="mt-1 text-[10px] text-white/35">{sublabel}</div>}
      </div>
    </div>
  )
}
