import { motion, type HTMLMotionProps } from 'framer-motion'
import { framerSpring } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface GlassCardProps extends HTMLMotionProps<'div'> {
  interactive?: boolean
  glow?: string
  noPadding?: boolean
}

export function GlassCard({
  children,
  className,
  interactive = false,
  glow,
  noPadding = false,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        'glass glass-border relative overflow-hidden',
        'rounded-[24px]',
        !noPadding && 'p-4',
        interactive && 'cursor-pointer select-none',
        className,
      )}
      style={glow ? { boxShadow: `0 0 24px ${glow}` } : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      transition={framerSpring}
      {...props}
    >
      {children}
    </motion.div>
  )
}
