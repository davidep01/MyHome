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
  /** Broad, static tint that keeps category color visible without relying on motion. */
  colorWash?: boolean
}

/**
 * GlassCard with a static material edge shared by all widget families.
 * Subtle by design and disabled under perf-lite / reduced-motion via the CSS.
 */
export function AnimatedCard({
  ambient = 'drift',
  ambientColor = 'rgba(0,102,204,0.10)',
  index = 0,
  contentClassName,
  colorWash = true,
  children,
  className,
  ...rest
}: AnimatedCardProps) {
  // Retain the public props for existing callers; material is shared and static.
  void ambientColor
  void index
  void colorWash
  return (
    <GlassCard className={cn('relative overflow-hidden', className)} {...rest}>
      {ambient !== 'none' && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ boxShadow: 'inset 0 1px 0 var(--glass-edge)' }} />}
      <div className={cn('info-card-content relative flex h-full min-h-0 flex-col', contentClassName)}>{children}</div>
    </GlassCard>
  )
}
