import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '../../lib/utils'

interface GlassCardProps extends HTMLMotionProps<'div'> {
  interactive?: boolean
  /** Glow ring color (used for heating/cooling/light-on states). */
  glow?: string
  noPadding?: boolean
  /** Liquid-glass depth: inset top highlight + base thickness + a soft float.
   *  Opt-in so chrome/panels stay flat; combines with `glow` when both are set. */
  depth?: boolean
}

// Inset top light + glass thickness + a gentle float off the parchment. Box-shadow
// only (no overlay), so it can't sit over card content.
const LG_DEPTH_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.85), inset 0 0 0 0.5px rgba(255,255,255,0.22), inset 0 -14px 22px -16px rgba(17,21,28,0.10), 0 7px 18px -12px rgba(17,21,28,0.16)'

export function GlassCard({
  children,
  className,
  interactive = false,
  glow,
  noPadding = false,
  depth = false,
  style,
  ...props
}: GlassCardProps) {
  const boxShadow = [depth ? LG_DEPTH_SHADOW : '', glow ? `0 0 24px 0 ${glow}` : ''].filter(Boolean).join(', ') || undefined
  return (
    <motion.div
      className={cn(
        'glass glass-border relative overflow-hidden rounded-[18px]',
        !noPadding && 'p-[14px]',
        interactive && 'cursor-pointer select-none press-card',
        className,
      )}
      style={{
        boxShadow,
        ...style,
      }}
      whileTap={interactive ? { scale: 0.985 } : undefined}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      {...props}
    >
      {children}
    </motion.div>
  )
}
