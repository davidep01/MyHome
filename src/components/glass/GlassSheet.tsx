import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { framerSpring } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface GlassSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  side?: 'bottom' | 'right'
  className?: string
}

export function GlassSheet({
  open,
  onClose,
  title,
  children,
  side = 'bottom',
  className,
}: GlassSheetProps) {
  const variants =
    side === 'bottom'
      ? {
          hidden: { y: '100%', opacity: 0 },
          visible: { y: 0, opacity: 1 },
        }
      : {
          hidden: { x: '100%', opacity: 0 },
          visible: { x: 0, opacity: 1 },
        }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className={cn(
              'glass glass-border fixed z-50',
              side === 'bottom'
                ? 'bottom-0 left-0 right-0 rounded-t-[28px] p-6'
                : 'top-0 right-0 bottom-0 w-96 rounded-l-[28px] p-6',
              className,
            )}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={framerSpring}
          >
            <div className="flex items-center justify-between mb-5">
              {title && (
                <span className="text-base font-semibold text-white/90">{title}</span>
              )}
              <button
                onClick={onClose}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
