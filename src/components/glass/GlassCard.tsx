import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '../../lib/utils'

interface GlassCardProps extends HTMLMotionProps<'div'> {
  interactive?: boolean
  /** Glow ring color (used for heating/cooling/light-on states). */
  glow?: string
  noPadding?: boolean
}

export function GlassCard({
  children,
  className,
  interactive = false,
  glow,
  noPadding = false,
  style,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        'glass glass-border relative overflow-hidden rounded-[18px]',
        !noPadding && 'p-[14px]',
        interactive && 'cursor-pointer select-none press-card',
        className,
      )}
      style={{
        boxShadow: glow ? `0 0 24px 0 ${glow}` : undefined,
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
