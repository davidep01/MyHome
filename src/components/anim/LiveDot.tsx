import { cn } from '../../lib/utils'

/** A soft pulsing "live" indicator — CSS only (opacity + scale). */
export function LiveDot({ color = '#30d158', size = 9, className }: { color?: string; size?: number; className?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }} aria-hidden>
      <span className="amb-pulse absolute inset-0 rounded-full" style={{ background: color }} />
      <span
        className="absolute rounded-full"
        style={{ background: color, width: size * 0.55, height: size * 0.55, left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
      />
    </span>
  )
}
