import { tokens } from '../../design/tokens'

interface SparklineProps {
  values: number[]
  color?: string
  className?: string
}

export function Sparkline({ values, color = tokens.accent.blue, className }: SparklineProps) {
  const finite = values.filter(Number.isFinite)
  const min = finite.length ? Math.min(...finite) : 0
  const max = finite.length ? Math.max(...finite) : 1
  const range = max - min || 1
  const points = finite.length
    ? finite.map((value, index) => {
        const x = finite.length === 1 ? 100 : (index / (finite.length - 1)) * 100
        const y = 28 - ((value - min) / range) * 24
        return `${x.toFixed(2)},${y.toFixed(2)}`
      }).join(' ')
    : '0,28 100,28'

  return (
    <svg className={className} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
