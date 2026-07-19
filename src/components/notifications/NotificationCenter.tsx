import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Wifi, Battery, AlertTriangle, CheckCircle, ShieldAlert, X } from 'lucide-react'
import { GlassSheet } from '../glass/GlassSheet'
import { useNotifications, type HANotification } from '../../hooks/useNotifications'
import { useHAService } from '../../hooks/useHAService'
import { tokens, framerSpring } from '../../design/tokens'
import { cn } from '../../lib/utils'
import { selectNewLiveNotification } from '../../lib/liveNotification'

const OFFLINE_TOAST_SESSION_KEY = 'simi.offline-notifications-announced'

function readAnnouncedOfflineIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const value = JSON.parse(window.sessionStorage.getItem(OFFLINE_TOAST_SESSION_KEY) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function rememberAnnouncedOfflineIds(ids: ReadonlySet<string>): void {
  try {
    window.sessionStorage.setItem(OFFLINE_TOAST_SESSION_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage disabilitato: il Set in memoria mantiene comunque la deduplica.
  }
}

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
  safety: {
    Icon: ShieldAlert,
    color: '#dc2626',
    label: 'Sicurezza',
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
      className="flex items-start gap-3 rounded-[14px] bg-black/5 p-3"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: `${color}20` }}
      >
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-black/85 leading-snug">{notification.title}</p>
        {notification.message && (
          <p className="text-[10px] mt-0.5" style={{ color: tokens.text.tertiary }}>
            {notification.message}
          </p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/30 hover:text-black/60 transition-colors"
          aria-label={`Rimuovi notifica: ${notification.title}`}
        >
          <X size={10} aria-hidden="true" />
        </button>
      )}
    </motion.div>
  )
}

export function NotificationBell({
  allowDismiss = true,
  variant = 'standalone',
}: {
  allowDismiss?: boolean
  variant?: 'standalone' | 'statusBar'
}) {
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
  const safetyNotifs = notifications.filter((n) => n.type === 'safety')

  return (
    <>
      <motion.button
        type="button"
        className={cn(
          'relative flex items-center justify-center transition-colors',
          variant === 'statusBar'
            ? 'h-12 w-12 rounded-none bg-transparent hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
            : 'h-11 w-11 rounded-[14px] bg-black/8 hover:bg-black/12 dark:bg-white/[0.09] dark:hover:bg-white/[0.14]',
        )}
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.92 }}
        transition={framerSpring}
        aria-label={badgeCount ? `Apri notifiche: ${badgeCount} attive` : 'Apri notifiche: nessun avviso'}
      >
        <Bell size={17} className={cn(hasCritical ? 'text-red-500' : 'text-black/50 dark:text-white/65')} aria-hidden="true" />
        <AnimatePresence>
          {badgeCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={framerSpring}
              className={cn(
                'absolute flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white',
                variant === 'statusBar' ? 'right-1 top-1' : '-right-1 -top-1',
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
              <p className="text-sm text-black/50">Tutto ok</p>
              <p className="text-xs" style={{ color: tokens.text.tertiary }}>
                Nessun avviso attivo
              </p>
            </div>
          ) : (
            <>
              {safetyNotifs.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-600">Sicurezza</p>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {safetyNotifs.map((n) => <NotificationItem key={n.id} notification={n} />)}
                    </AnimatePresence>
                  </div>
                </section>
              )}
              {systemNotifs.length > 0 && (
                <section>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: tokens.accent.blue }}>
                    Sistemi
                  </p>
                  <div className="space-y-2">
                    <AnimatePresence>
                      {systemNotifs.map((n) => (
                        <NotificationItem key={n.id} notification={n} onDismiss={allowDismiss ? () => dismiss(n) : undefined} />
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
      {variant === 'statusBar' && (
        <LiveNotificationToast
          notifications={notifications}
          onOpen={() => setOpen(true)}
        />
      )}
    </>
  )
}

/**
 * Mostra soltanto le notifiche nate dopo la sincronizzazione iniziale di HA.
 * Il toast vive in un portal per non essere tagliato dall'overflow della
 * status bar e scorre esplicitamente da destra verso sinistra.
 */
function LiveNotificationToast({
  notifications,
  onOpen,
}: {
  notifications: HANotification[]
  onOpen: () => void
}) {
  const [current, setCurrent] = useState<HANotification | null>(null)
  const seenRef = useRef(new Set<string>())
  const announcedOfflineRef = useRef(readAnnouncedOfflineIds())
  const readyRef = useRef(false)

  useEffect(() => {
    seenRef.current = new Set(notifications.map((notification) => notification.id))
    const timer = window.setTimeout(() => { readyRef.current = true }, 1_800)
    return () => clearTimeout(timer)
    // La baseline va fissata una sola volta: gli aggiornamenti successivi sono live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const nextIds = new Set(notifications.map((notification) => notification.id))
    const added = selectNewLiveNotification(notifications, seenRef.current, announcedOfflineRef.current)
    seenRef.current = nextIds
    if (readyRef.current && added) {
      if (added.type === 'offline') {
        announcedOfflineRef.current.add(added.id)
        rememberAnnouncedOfflineIds(announcedOfflineRef.current)
      }
      setCurrent(added)
    }
  }, [notifications])

  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(() => setCurrent(null), current.severity === 'critical' ? 8_000 : 5_500)
    return () => clearTimeout(timer)
  }, [current])

  if (typeof document === 'undefined') return null

  const content = (
    <AnimatePresence initial={false}>
      {current && (
        <motion.button
          key={current.id}
          type="button"
          onClick={() => { setCurrent(null); onOpen() }}
          className={cn(
            'fixed right-[max(16px,env(safe-area-inset-right))] top-[calc(max(14px,env(safe-area-inset-top))+68px)] z-[70] flex w-[min(390px,calc(100vw-32px))] items-center gap-3 overflow-hidden rounded-[18px] border bg-white/92 p-3 text-left shadow-[0_18px_50px_-20px_rgba(0,0,0,0.45)] backdrop-blur-2xl dark:bg-[#1c1c1e]/94',
            current.severity === 'critical' ? 'border-red-500/30' : current.severity === 'warning' ? 'border-orange-500/25' : 'border-black/8 dark:border-white/10',
          )}
          initial={{ x: 'calc(100% + 32px)', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 'calc(100% + 32px)', opacity: 0 }}
          transition={framerSpring}
          aria-label={`Notifica live: ${current.title}`}
        >
          <NotificationToastIcon notification={current} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[#1d1d1f] dark:text-white">{current.title}</span>
            <span className="mt-0.5 block truncate text-xs text-black/48 dark:text-white/52">{current.message ?? 'Nuovo aggiornamento dalla casa'}</span>
          </span>
          <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-black/40 dark:bg-white/[0.09] dark:text-white/45">Live</span>
        </motion.button>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}

function NotificationToastIcon({ notification }: { notification: HANotification }) {
  const { Icon, color } = typeConfig[notification.type]
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]" style={{ background: `${color}20`, color }}>
      <Icon size={18} aria-hidden="true" />
    </span>
  )
}
