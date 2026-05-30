/* eslint-disable react-hooks/set-state-in-effect --
   Snapshot fallback + per-ring reset are deliberately driven by effects. */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X, Video, ScanFace } from 'lucide-react'
import { useDoorbell } from '../../hooks/useDoorbell'
import { useEntityStore } from '../../store/entities'
import { haApi } from '../../api/backend'

export function DoorbellAlert() {
  const { ringing, cameraEntityId, ringAt, dismiss } = useDoorbell()
  const camera = useEntityStore((s) => s.entities[cameraEntityId])
  const hasCamera = Boolean(camera) && camera?.state !== 'unavailable'
  const [streamFailed, setStreamFailed] = useState(false)
  const [snap, setSnap] = useState('')

  // Snapshot fallback (cache-busted) if the live MJPEG stream errors out.
  useEffect(() => {
    if (!ringing || !hasCamera || !streamFailed) return
    const tick = () => setSnap(`${haApi.cameraProxyUrl(cameraEntityId)}?_t=${Date.now()}`)
    tick()
    const id = setInterval(tick, 1500)
    return () => clearInterval(id)
  }, [ringing, hasCamera, streamFailed, cameraEntityId])

  useEffect(() => { if (ringing) setStreamFailed(false) }, [ringing, ringAt])

  return (
    <AnimatePresence>
      {ringing && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Live video / snapshot */}
          {hasCamera ? (
            <img
              src={streamFailed ? snap : haApi.cameraStreamUrl(cameraEntityId)}
              alt="Campanello"
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setStreamFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#111]">
              <Video size={40} className="text-white/30" />
              <p className="text-sm text-white/40">Nessuna telecamera associata al campanello</p>
              <p className="text-xs text-white/25">Configura <code>cameraEntityId</code> in doorbell.ts</p>
            </div>
          )}

          {/* Top gradient + title */}
          <div className="relative z-10 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-6 pt-[max(24px,env(safe-area-inset-top))] pb-10">
            <motion.div
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur"
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ repeat: Infinity, duration: 1.1 }}
            >
              <Bell size={22} className="text-white" />
            </motion.div>
            <div className="flex-1">
              <p className="text-xl font-semibold text-white">Qualcuno alla porta</p>
              <p className="text-sm text-white/60">
                {ringAt ? new Date(ringAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}
                {' · Ingresso'}
              </p>
            </div>
            <button
              onClick={dismiss}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-90"
              aria-label="Chiudi"
            >
              <X size={20} />
            </button>
          </div>

          {/* Bottom: AI recognition placeholder (deploy-later) + actions */}
          <div className="relative z-10 mt-auto flex flex-col gap-4 bg-gradient-to-t from-black/75 to-transparent px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-12">
            <div className="flex items-center gap-2 self-start rounded-full bg-white/12 px-3 py-1.5 text-sm text-white/80 backdrop-blur">
              <ScanFace size={15} className="text-[#2997ff]" />
              Riconoscimento volto: <span className="text-white/50">in arrivo</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={dismiss}
                className="flex-1 rounded-full bg-white/15 py-3.5 text-base font-medium text-white backdrop-blur transition active:scale-95"
              >
                Ignora
              </button>
              <button
                onClick={dismiss}
                className="flex-1 rounded-full bg-[#0066cc] py-3.5 text-base font-medium text-white transition active:scale-95"
              >
                Visto
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
