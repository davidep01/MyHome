import { GlassCard } from '../glass/GlassCard'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type GlassProps = Omit<ComponentProps<typeof GlassCard>, 'children'>

interface AnimatedCardProps extends GlassProps {
  children?: ReactNode
  /** Ambient decorative motion drawn behind the content (never animates the
   *  frosted container itself, so the backdrop blur isn't re-rendered). */
  ambient?: 'drift' | 'sheen' | 'none'
  /** Tints the drift blob. */
  ambientColor?: string
  /** Desyncs identical cards so they don't animate in lockstep. */
  index?: number
  /** Layout classes for the content wrapper (which sits above the ambient layer). */
  contentClassName?: string
}

/**
 * GlassCard + a slow, always-on ambient layer (a drifting glow or a faint sheen).
 * Subtle by design and disabled under perf-lite / reduced-motion via the CSS.
 */
export function AnimatedCard({
  ambient = 'drift',
  ambientColor = 'rgba(0,102,204,0.10)',
  index = 0,
  contentClassName,
  children,
  className,
  ...rest
}: AnimatedCardProps) {
  const delay = `${-((index % 6) * 2.3).toFixed(1)}s`

  return (
    <GlassCard className={cn('relative overflow-hidden', className)} {...rest}>
      {ambient === 'drift' && (
        <span
          aria-hidden
          className="amb-drift pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full"
          style={{ background: `radial-gradient(circle, ${ambientColor}, transparent 70%)`, animationDelay: delay }}
        />
      )}
      {ambient === 'sheen' && (
        <span
          aria-hidden
          className="amb-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3"
          style={{ background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.16), transparent)', animationDelay: delay }}
        />
      )}
      <div className={cn('relative flex h-full flex-col', contentClassName)}>{children}</div>
    </GlassCard>
  )
}
