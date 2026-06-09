import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { framerSpring } from '../../design/tokens'
import { cn } from '../../lib/utils'

// Punto dell'ultimo tocco: il modal centrato "nasce" da lì e ci ritorna alla
// chiusura (zoom transition alla iOS) senza che i call-site debbano passare rect.
let lastPointer: { x: number; y: number } | null = null
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => { lastPointer = { x: e.clientX, y: e.clientY } },
    { capture: true, passive: true },
  )
}

interface GlassSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  side?: 'bottom' | 'right' | 'center'
  className?: string
  /** Hide GlassSheet's own header/close — for children that provide their own. */
  hideHeader?: boolean
}

export function GlassSheet({
  open,
  onClose,
  title,
  children,
  side = 'bottom',
  className,
  hideHeader = false,
}: GlassSheetProps) {
  const isCenter = side === 'center'

  // Offset del tocco rispetto al centro viewport, catturato all'apertura.
  // In perf-lite si torna al semplice fade+scale (meno movimento su GPU deboli).
  const origin = useMemo(() => {
    if (!isCenter || !open || !lastPointer) return null
    if (document.documentElement.classList.contains('perf-lite')) return null
    return {
      dx: lastPointer.x - window.innerWidth / 2,
      dy: lastPointer.y - window.innerHeight / 2,
    }
  }, [open, isCenter])

  const variants =
    side === 'bottom'
      ? { hidden: { y: '100%', opacity: 0 }, visible: { y: 0, opacity: 1 } }
      : side === 'right'
        ? { hidden: { x: '100%', opacity: 0 }, visible: { x: 0, opacity: 1 } }
        : origin
          ? {
              hidden: { x: origin.dx, y: origin.dy, scale: 0.28, opacity: 0 },
              visible: { x: 0, y: 0, scale: 1, opacity: 1 },
            }
          : { hidden: { scale: 0.94, opacity: 0 }, visible: { scale: 1, opacity: 1 } }

  // Viewport-safe sizing: dvh (not vh), clamped widths, safe-area insets.
  const sheetStyle =
    side === 'bottom'
      ? {
          maxHeight: 'min(92dvh, 920px)',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
          paddingTop: '20px',
        }
      : side === 'right'
        ? {
            width: 'min(420px, 96vw)',
            maxWidth: '96vw',
            paddingTop: 'max(20px, env(safe-area-inset-top))',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
            paddingRight: 'max(20px, env(safe-area-inset-right))',
          }
        : {
            // Centered modal — always fully inside the screen on any device.
            width: 'min(480px, 92vw)',
            maxHeight: 'min(88dvh, 880px)',
            paddingTop: '20px',
            paddingBottom: '20px',
          }

  const positionClass =
    side === 'bottom'
      ? 'fixed z-50 bottom-0 left-0 right-0 rounded-t-[28px] px-6'
      : side === 'right'
        ? 'fixed z-50 top-0 right-0 bottom-0 rounded-l-[28px] pl-6'
        : 'rounded-[28px] px-6'

  const panel = (
    <motion.div
      className={cn('glass glass-border flex flex-col', positionClass, className)}
      style={sheetStyle}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={framerSpring}
      onClick={isCenter ? (e) => e.stopPropagation() : undefined}
    >
      {!hideHeader && (
        <div className="mb-4 flex shrink-0 items-center justify-between pt-1">
          {title && <span className="text-base font-semibold text-black/90">{title}</span>}
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-black/60 transition-colors hover:text-[#1d1d1f]"
            aria-label="Chiudi"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', side !== 'bottom' && !hideHeader && 'pr-1')}>
        {children}
      </div>
    </motion.div>
  )

  return (
    <AnimatePresence>
      {open && (
        isCenter ? (
          // Backdrop is a flex container that centers the modal — guaranteed on-screen.
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            {panel}
          </motion.div>
        ) : (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40"
              style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            {panel}
          </>
        )
      )}
    </AnimatePresence>
  )
}
