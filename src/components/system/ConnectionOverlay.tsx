import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff, RotateCw, Settings } from 'lucide-react'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import { connectHAStream, disconnectHAStream } from '../../api/ha-websocket'

/**
 * Fullscreen "Home Assistant non disponibile" overlay. Appears when the connection
 * drops or errors and dismisses automatically as soon as it reconnects.
 * A short grace delay avoids flashing during the initial handshake.
 */
export function ConnectionOverlay() {
  const status = useEntityStore((s) => s.connectionStatus)
  const lastError = useEntityStore((s) => s.lastError)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const [show, setShow] = useState(false)

  // Never block the System page — that's where the user fixes the credentials.
  const down = (status === 'error' || status === 'disconnected') && activeView !== 'system'

  useEffect(() => {
    if (!down) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- dismiss as soon as reconnected
      setShow(false)
      return
    }
    // Grace period: only block the UI if it stays down for >2s.
    const id = setTimeout(() => setShow(true), 2000)
    return () => clearTimeout(id)
  }, [down])

  const retry = () => {
    // Rebuild the stream from scratch (covers a wedged EventSource or a poll
    // fallback that should try SSE again).
    disconnectHAStream()
    connectHAStream().catch(() => {})
  }

  return (
    <AnimatePresence>
      {show && down && (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 px-8 text-center"
          style={{ background: 'rgba(245,245,247,0.86)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-white shadow-sm"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ repeat: Infinity, duration: 1.8 }}
          >
            <WifiOff size={36} className="text-[#dc2626]" />
          </motion.div>
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[#1d1d1f]">Home Assistant non disponibile</h2>
            <p className="mt-2 max-w-sm text-sm text-black/50">
              Riconnessione automatica appena torna online.
            </p>
            {lastError && <p className="mt-1 text-xs text-black/35">{lastError}</p>}
          </div>
          <div className="flex items-center gap-2 text-sm text-black/45">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-400" />
            In attesa della connessione
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={retry}
              className="flex items-center gap-2 rounded-full bg-[#0066cc] px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
            >
              <RotateCw size={15} /> Riprova adesso
            </button>
            <button
              onClick={() => setActiveView('system')}
              className="flex items-center gap-2 rounded-full bg-black/8 px-5 py-2.5 text-sm font-semibold text-[#1d1d1f] transition hover:bg-black/12 active:scale-95"
            >
              <Settings size={15} /> Configura connessione
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
