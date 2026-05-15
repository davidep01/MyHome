import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Wifi, Battery, AlertTriangle, CheckCircle, X } from 'lucide-react'
import { GlassSheet } from '../glass/GlassSheet'
import { useNotifications, type HANotification } from '../../hooks/useNotifications'
import { useHAService } from '../../hooks/useHAService'
import { tokens, framerSpring } from '../../design/tokens'
import { cn } from '../../lib/utils'

const typeConfig = {
  system: {
    Icon: AlertTriangle,
    color: tokens.accent.blue,
    label: 'Sistemi',
  },
  offline: {
    Icon: Wifi,
    color: tokens.accent.orange,
    label: 'Dispositivi offline',
  },
  battery: {
    Icon: Battery,
    color: tokens.accent.yellow,
    label: 'Batteria scarica',
  },
}

function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: HANotification
  onDismiss?: () => void
}) {
  const { Icon, color } = typeConfig[notification.type]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={framerSpring}
      className="flex items-start gap-3 rounded-[14px] bg-white/5 p-3"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: `${color}20` }}
      >
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white/85 leading-snug">{notification.title}</p>
        {notification.message && (
          <p className="text-[10px] mt-0.5" style={{ color: tokens.text.tertiary }}>
            {notification.message}
          </p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/30 hover:text-white/60 transition-colors"
        >
          <X size={10} />
        </button>
      )}
    </motion.div>
  )
}

export function NotificationBell() {
  const notifications = useNotifications()
  const { call } = useHAService()
  const [open, setOpen] = useState(false)

  const criticalCount = notifications.filter((n) => n.severity === 'critical').length
  const badgeCount = notifications.length
  const hasCritical = criticalCount > 0

  const dismiss = (notification: HANotification) => {
    if (notification.type === 'system') {
      call('persistent_notification', 'dismiss', { notification_id: notification.entityId.replace('persistent_notification.', '') })
    }
  }

  const systemNotifs = notifications.filter((n) => n.type === 'system')
  const offlineNotifs = notifications.filter((n) => n.type === 'offline')
  const batteryNotifs = notifications.filter((n) => n.type === 'battery')

  return (
    <>
      <motion.button
        className="relative flex h-9 w-9 items-center justify-center rounded-[12px] bg-white/8 hover:bg-white/12 transition-colors"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.92 }}
        transition={framerSpring}
      >
        <Bell size={16} className={cn(hasCritical ? 'text-red-400' : 'text-white/50')} />
        <AnimatePresence>
          {badgeCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={framerSpring}
              className={cn(
                'absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white',
                hasCritical ? 'bg-red-500' : 'bg-orange-500',
              )}
            >
              {badgeCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <GlassSheet open={open} onClose={() => setOpen(false)} title="Notifiche" side="right">
        <div className="flex flex-col gap-4 h-full overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <CheckCircle size={32} className="text-green-400/60" />
              <p className="text-sm text-white/50">Tutto ok</p>
              <p className="text-xs" style={{ color: tokens.text.tertiary }}>
                Nessun avviso attivo
              </p>
            </div>
          ) : (
            <>
              {systemNotifs.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: tokens.accent.blue }}>
                    Sistemi
                  </p>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {systemNotifs.map((n) => (
                        <NotificationItem key={n.id} notification={n} onDismiss={() => dismiss(n)} />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              )}

              {offlineNotifs.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: tokens.accent.orange }}>
                    Dispositivi offline
                  </p>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {offlineNotifs.map((n) => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              )}

              {batteryNotifs.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: tokens.accent.yellow }}>
                    Batteria scarica
                  </p>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {batteryNotifs.map((n) => (
                        <NotificationItem key={n.id} notification={n} />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </GlassSheet>
    </>
  )
}
