/* eslint-disable react-hooks/set-state-in-effect --
   The recognition result is driven by the ring lifecycle effect. */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X, Video, ScanFace, Check } from 'lucide-react'
import { useDoorbells } from '../../hooks/useDoorbells'
import { useEntityStore } from '../../store/entities'
import { CameraStream } from '../widgets/CameraStream'
import { aiApi } from '../../api/ai'
import type { DoorbellDevice } from '../../api/backend'

type Recog = { status: 'scanning' | 'done' | 'error'; name?: string }
type Tone = 'scan' | 'known' | 'unknown' | 'none' | 'error'

const TONE_COLOR: Record<Tone, string> = {
  scan: '#2997ff',
  known: '#30d158',
  unknown: '#ff9f0a',
  none: 'rgba(255,255,255,0.7)',
  error: 'rgba(255,255,255,0.55)',
}

/** Builds the headline + status pill from the recognition result. */
function describe(r: Recog | null, known: string[], kiosk = false): { title: string; pill: string; tone: Tone } {
  const fallbackTitle = "C'è qualcuno alla porta!"
  if (kiosk) return { title: fallbackTitle, pill: 'Campanello attivo', tone: 'scan' }
  if (!r || r.status === 'scanning') return { title: fallbackTitle, pill: 'Riconoscimento in corso…', tone: 'scan' }
  if (r.status === 'error') return { title: fallbackTitle, pill: 'Riconoscimento non disponibile', tone: 'error' }
  const raw = (r.name ?? '').trim()
  const lower = raw.toLowerCase()
  if (!raw || lower === 'nessuno' || lower === 'niente') return { title: fallbackTitle, pill: 'Nessuno rilevato', tone: 'none' }
  const isKnown = known.some((k) => k.toLowerCase() === lower)
  return {
    title: `C'è ${raw} alla porta`,
    pill: isKnown ? `${raw} riconosciuto` : 'Riconoscimento completato',
    tone: isKnown ? 'known' : 'unknown',
  }
}

export function DoorbellAlert({ kiosk = false, doorbells }: { kiosk?: boolean; doorbells?: DoorbellDevice[] }) {
  const { active, dismiss, autoDismissMs } = useDoorbells(doorbells)
  const entities = useEntityStore((s) => s.entities)
  const ringing = Boolean(active)
  const cameraEntityId = active?.device.cameraEntityId ?? ''
  const ringAt = active?.ringAt ?? null
  const doorbellName = active?.device.name ?? 'Campanello'
  const doorbellLocation = active?.device.location
  const camera = entities[cameraEntityId]
  const hasCamera = Boolean(camera) && camera?.state !== 'unavailable'
  const [recog, setRecog] = useState<Recog | null>(null)

  const personNames = useMemo(
    () => Object.values(entities)
      .filter((e) => e.entity_id.startsWith('person.'))
      .map((e) => (e.attributes?.friendly_name as string | undefined) ?? e.entity_id.split('.')[1]),
    [entities],
  )

  // Run Gemini Vision recognition once per ring.
  useEffect(() => {
    if (kiosk || !ringing || !hasCamera) { setRecog(null); return }
    let cancelled = false
    setRecog({ status: 'scanning' })
    aiApi.recognize(cameraEntityId, personNames)
      .then((r) => { if (!cancelled) setRecog({ status: 'done', name: r.name }) })
      .catch(() => { if (!cancelled) setRecog({ status: 'error' }) })
    return () => { cancelled = true }
    // personNames intentionally read at ring time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringing, hasCamera, cameraEntityId, ringAt, kiosk])

  const { title, pill, tone } = describe(recog, personNames, kiosk)
  const toneColor = TONE_COLOR[tone]
  const countdownSec = autoDismissMs / 1000

  return (
    <AnimatePresence>
      {ringing && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {hasCamera ? (
            <div className="absolute inset-0">
              <CameraStream entityId={cameraEntityId} fit="cover" muted preferLive />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#111]">
              <Video size={40} className="text-white/30" />
              <p className="text-sm text-white/40">Nessuna telecamera associata al campanello</p>
              {!kiosk && <p className="text-xs text-white/25">Configura la videocamera nel pannello desktop.</p>}
            </div>
          )}

          {/* 30s auto-dismiss countdown bar */}
          {autoDismissMs > 0 && (
            <motion.div
              key={ringAt ?? 'bar'}
              className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left"
              style={{ background: toneColor }}
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: countdownSec, ease: 'linear' }}
            />
          )}

          <motion.div
            className="relative z-10 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-6 pt-[max(24px,env(safe-area-inset-top))] pb-10"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            <motion.div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur"
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ repeat: Infinity, duration: 1.1 }}
            >
              <Bell size={22} className="text-white" />
            </motion.div>
            <div className="min-w-0 flex-1">
              <AnimatePresence mode="popLayout">
                <motion.p
                  key={title}
                  className="truncate text-xl font-semibold text-white"
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {title}
                </motion.p>
              </AnimatePresence>
              <p className="text-sm text-white/60">
                {ringAt ? new Date(ringAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}
                {' · '}{doorbellLocation ? `${doorbellName} · ${doorbellLocation}` : doorbellName}
              </p>
            </div>
            <button
              onClick={dismiss}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-90"
              aria-label="Chiudi"
            >
              <X size={20} />
            </button>
          </motion.div>

          <motion.div
            className="relative z-10 mt-auto flex flex-col gap-4 bg-gradient-to-t from-black/75 to-transparent px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-12"
            initial={{ y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30, delay: 0.05 }}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                key={pill}
                className="flex items-center gap-2 self-start rounded-full bg-white/12 px-3.5 py-1.5 text-sm font-medium text-white/90 backdrop-blur"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {tone === 'known'
                  ? <Check size={15} style={{ color: toneColor }} />
                  : <ScanFace size={15} className={tone === 'scan' ? 'animate-pulse' : ''} style={{ color: toneColor }} />}
                {pill}
              </motion.div>
            </AnimatePresence>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
