import { motion, AnimatePresence } from 'framer-motion'
import { ADMIN_NAVIGATION } from './adminNavigation'
import { useUIStore, VIEW_PATHS } from '../../store/ui'
import { framerSpringBounce } from '../../design/tokens'
import { cn } from '../../lib/utils'

export function BottomTabBar() {
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const tabs = ADMIN_NAVIGATION

  return (
    <nav
      aria-label="Navigazione principale"
      className="glass glass-border fixed bottom-0 inset-x-0 z-30 flex items-center justify-around px-2 md:hidden"
      style={{
        position: 'fixed',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingTop: '8px',
        borderRadius: '20px 20px 0 0',
      }}
    >
      {tabs.map(({ id, label, Icon }) => {
        const isActive = activeView === id
        return (
          <motion.a
            key={id}
            href={VIEW_PATHS[id]}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              setActiveView(id)
            }}
            whileTap={{ scale: 0.88 }}
            transition={framerSpringBounce}
            // 44×44px minimum touch target via padding
            className="relative flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 rounded-[14px]"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-current={isActive ? 'page' : undefined}
          >
            {/* Active pill background */}
            <AnimatePresence>
              {isActive && (
                <motion.span
                  layoutId="tab-bg"
                  className="absolute inset-0 rounded-[14px] bg-[var(--fill-muted)]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={framerSpringBounce}
                />
              )}
            </AnimatePresence>

            <span className={cn('relative transition-colors duration-200', isActive ? 'text-[var(--action-blue)]' : 'text-[var(--ink-tertiary)]')}>
              <Icon size={22} />
            </span>
            <span
              className={cn(
                'relative text-[10px] font-semibold leading-none transition-colors duration-200',
                isActive ? 'text-[var(--action-blue)]' : 'text-[var(--ink-tertiary)]',
              )}
            >
              {label}
            </span>
          </motion.a>
        )
      })}
    </nav>
  )
}
