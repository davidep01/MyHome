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
      ? { hidden: { y: '100%', opacity: 0 }, visible: { y: 0, opacity: 1 } }
      : { hidden: { x: '100%', opacity: 0 }, visible: { x: 0, opacity: 1 } }

  // Viewport-safe sizing: dvh (not vh), clamped widths, safe-area insets.
  const sheetStyle =
    side === 'bottom'
      ? {
          maxHeight: 'min(92dvh, 920px)',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          paddingTop: '20px',
        }
      : {
          width: 'min(420px, 96vw)',
          maxWidth: '96vw',
          paddingTop: 'max(20px, env(safe-area-inset-top))',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          paddingRight: 'max(20px, env(safe-area-inset-right))',
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

          {/* Sheet — flex column: fixed header + scrollable body, never exceeds viewport */}
          <motion.div
            className={cn(
              'glass glass-border fixed z-50 flex flex-col',
              side === 'bottom'
                ? 'bottom-0 left-0 right-0 rounded-t-[28px] px-6'
                : 'top-0 right-0 bottom-0 rounded-l-[28px] pl-6',
              className,
            )}
            style={sheetStyle}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={framerSpring}
          >
            <div className="mb-4 flex shrink-0 items-center justify-between pt-1">
              {title && <span className="text-base font-semibold text-black/90">{title}</span>}
              <button
                onClick={onClose}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-black/60 transition-colors hover:text-[#1d1d1f]"
                aria-label="Chiudi"
              >
                <X size={16} />
              </button>
            </div>
            {/* Scrollable body — keeps content within the viewport */}
            <div className={cn('min-h-0 flex-1 overflow-y-auto', side === 'right' && 'pr-1')}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
