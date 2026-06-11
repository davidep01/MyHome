/* eslint-disable react-hooks/set-state-in-effect --
   The recognition result is driven by the ring lifecycle effect. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X, Video, ScanFace, Check, LockOpen } from 'lucide-react'
import { useDoorbells } from '../../hooks/useDoorbells'
import { useEntityStore } from '../../store/entities'
import { useHaptic } from '../../hooks/useHaptic'
import { CameraStream } from '../widgets/CameraStream'
import { aiApi } from '../../api/ai'
import { callService } from '../../api/ha-websocket'
import { cn } from '../../lib/utils'
import type { DoorbellDevice } from '../../api/backend'

type Recog = { status: 'scanning' | 'done' | 'error'; name?: string; known?: boolean }
type Tone = 'scan' | 'known' | 'unknown' | 'none' | 'error'

const TONE_COLOR: Record<Tone, string> = {
  scan: '#2997ff',
  known: '#30d158',
  unknown: '#ff9f0a',
  none: 'rgba(255,255,255,0.7)',
  error: 'rgba(255,255,255,0.55)',
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Builds the headline + status pill from the recognition result. */
function describe(r: Recog | null, known: string[], vision: boolean): { title: string; pill: string; tone: Tone } {
  const fallbackTitle = "C'è qualcuno alla porta!"
  // Fallback generico: AI spenta o non configurata → solo l'avviso, onesto.
  if (!vision) return { title: fallbackTitle, pill: 'Campanello attivo', tone: 'scan' }
  if (!r || r.status === 'scanning') return { title: fallbackTitle, pill: 'Riconoscimento in corso…', tone: 'scan' }
  if (r.status === 'error') return { title: fallbackTitle, pill: 'Riconoscimento non disponibile', tone: 'error' }
  const raw = (r.name ?? '').trim()
  const lower = raw.toLowerCase()
  if (!raw || lower === 'nessuno' || lower === 'niente') return { title: fallbackTitle, pill: 'Nessuno rilevato', tone: 'none' }
  // `known` arriva dal backend quando il volto matcha una foto di riferimento
  // (Funzioni → Campanelli → Volti conosciuti) o una persona HA.
  const isKnown = r.known === true || known.some((k) => k.toLowerCase() === lower)
  const display = isKnown ? capitalize(raw) : raw
  return {
    title: `C'è ${display} alla porta`,
    pill: isKnown ? `${display} riconosciuto` : 'Riconoscimento completato',
    tone: isKnown ? 'known' : 'unknown',
  }
}

export function DoorbellAlert({ kiosk = false, doorbells, vision = true }: { kiosk?: boolean; doorbells?: DoorbellDevice[]; vision?: boolean }) {
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

  // Run Gemini Vision recognition once per ring — anche (soprattutto) sul kiosk.
  // Se la chiamata fallisce (chiave assente, AI giù) si degrada al messaggio generico.
  useEffect(() => {
    if (!ringing || !hasCamera || !vision) { setRecog(null); return }
    let cancelled = false
    setRecog({ status: 'scanning' })
    aiApi.recognize(cameraEntityId, personNames)
      .then((r) => { if (!cancelled) setRecog({ status: 'done', name: r.name, known: r.known }) })
      .catch(() => { if (!cancelled) setRecog({ status: 'error' }) })
    return () => { cancelled = true }
    // personNames intentionally read at ring time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringing, hasCamera, cameraEntityId, ringAt, vision])

  const { title, pill, tone } = describe(recog, personNames, vision && hasCamera)
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
            {(active?.device.lockEntityIds?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-3">
                {active!.device.lockEntityIds!.map((lockId) => (
                  <HoldUnlockButton key={lockId} entityId={lockId} />
                ))}
              </div>
            )}
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

/**
 * Apertura serratura dal modale del campanello: MAI un toggle — pressione
 * prolungata 900ms (canone), con riempimento di progresso e stato live.
 */
function HoldUnlockButton({ entityId }: { entityId: string }) {
  const entity = useEntityStore((s) => s.entities[entityId])
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const { heavy } = useHaptic()
  const [holding, setHolding] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const name = (entity?.attributes?.friendly_name as string | undefined) ?? entityId.split('.')[1]
  const unlocked = entity?.state === 'unlocked'
  const unavailable = !entity || entity.state === 'unavailable'

  const start = () => {
    if (unavailable || unlocked) return
    setFailed(false)
    setHolding(true)
    timer.current = setTimeout(() => {
      setHolding(false)
      heavy()
      setOptimisticState(entityId, 'unlocking')
      callService('lock', 'unlock', { entity_id: entityId }).catch(() => {
        setOptimisticState(entityId, entity?.state ?? 'locked')
        setFailed(true)
      })
    }, 900)
  }
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      disabled={unavailable || unlocked}
      className={cn(
        'relative flex min-h-[52px] flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-base font-medium backdrop-blur transition',
        unlocked ? 'bg-[#30d158]/25 text-[#7ee2a8]' : failed ? 'bg-red-500/25 text-red-200' : 'bg-white/15 text-white',
        holding && 'scale-[0.98]',
        unavailable && 'opacity-40',
      )}
    >
      {holding && (
        <span className="absolute inset-y-0 left-0 bg-white/25" style={{ animation: 'lock-hold-fill 900ms linear forwards' }} />
      )}
      {unlocked ? <Check size={18} className="relative" /> : <LockOpen size={18} className="relative" />}
      <span className="relative truncate">
        {unavailable ? `${name} non disponibile`
          : unlocked ? `${name} aperta`
            : failed ? `Riprova — ${name}`
              : `Tieni premuto: apri ${name}`}
      </span>
    </button>
  )
}
