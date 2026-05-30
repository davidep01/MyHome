import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { GlassSheet } from '../glass/GlassSheet'
import { useNotifications } from '../../hooks/useNotifications'
import { tokens, framerSpring } from '../../design/tokens'

export function StatusBar() {
  const notifications = useNotifications()
  const [open, setOpen] = useState(false)
  const urgent = notifications.find((n) => n.severity === 'critical') ?? notifications.find((n) => n.severity === 'warning')
  const active = notifications.filter((n) => n.severity !== 'info')

  return (
    <>
      <AnimatePresence initial={false}>
        {urgent && (
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            className="glass glass-border flex min-h-[56px] shrink-0 items-center gap-3 rounded-[20px] px-4 text-left"
            style={{
              background: urgent.severity === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.13)',
              borderColor: urgent.severity === 'critical' ? 'rgba(239,68,68,0.35)' : 'rgba(249,115,22,0.30)',
            }}
            initial={{ height: 0, opacity: 0, y: -8 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -8 }}
            transition={framerSpring}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10">
              <AlertTriangle size={17} style={{ color: urgent.severity === 'critical' ? tokens.accent.red : tokens.accent.orange }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-black/90">{urgent.title}</p>
              <p className="truncate text-xs text-black/45">{urgent.message ?? urgent.entityId}</p>
            </div>
            {active.length > 1 && (
              <span className="rounded-full bg-black/10 px-2 py-1 text-xs font-semibold text-black/70">+{active.length - 1}</span>
            )}
            <ChevronRight size={17} className="text-black/40" />
          </motion.button>
        )}
      </AnimatePresence>

      <GlassSheet open={open} onClose={() => setOpen(false)} title="Avvisi" side="right">
        <div className="space-y-2">
          {active.map((notification) => (
            <div key={notification.id} className="rounded-[14px] bg-black/6 p-3">
              <p className="text-sm font-semibold text-black/85">{notification.title}</p>
              <p className="mt-1 text-xs text-black/40">{notification.message ?? notification.entityId}</p>
            </div>
          ))}
        </div>
      </GlassSheet>
    </>
  )
}
