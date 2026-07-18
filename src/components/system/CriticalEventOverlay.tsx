import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronUp, ShieldAlert, TriangleAlert } from 'lucide-react'
import type { CriticalAlert } from '../../lib/criticalAlerts'
import type { ActionShortcut } from '../../api/backend'
import { markKioskActivity } from '../../lib/kioskActivity'
import { visibleShortcuts } from '../../lib/actionShortcuts'
import { ShortcutActionButton } from '../controls/ShortcutActionButton'
import { useSoundNotifications } from '../../hooks/useSoundNotifications'
import { useUIStore } from '../../store/ui'
import { startRepeatingSound } from '../../lib/sound/SoundManager'

export function CriticalEventOverlay({ alerts, shortcuts }: { alerts: CriticalAlert[]; shortcuts?: ActionShortcut[] }) {
  const [minimizedFor, setMinimizedFor] = useState<string | null>(null)
  const setSelectedEntity = useUIStore((state) => state.setSelectedEntity)
  const { play } = useSoundNotifications()
  const reduceMotion = useReducedMotion()
  const focusRef = useRef<HTMLButtonElement | null>(null)
  const emergencyActions = visibleShortcuts(shortcuts)
    // In emergenza NIENTE tap: ogni azione richiede la pressione prolungata.
    .map((shortcut) => ({ ...shortcut, confirm: true }))
  const signature = useMemo(
    () => alerts.map((alert) => `${alert.id}:${alert.changedAt}`).join('|'),
    [alerts],
  )
  const minimized = Boolean(signature) && minimizedFor === signature
  const current = alerts[0]
  const currentKind = current?.kind

  useEffect(() => {
    if (!signature || !currentKind) return
    markKioskActivity()
    const preset = currentKind === 'siren' || currentKind === 'intrusion' ? 'siren' : 'alert'
    const repeatMs = preset === 'siren' ? 1_900 : 3_200
    const sound = () => play(preset, {
      key: `critical:${signature}`,
      cooldownMs: 0,
      volume: 1,
      boost: preset === 'siren' ? 1.8 : 1.5,
    })
    return startRepeatingSound(sound, repeatMs)
  }, [signature, currentKind, play])

  useEffect(() => {
    if (current && !minimized) focusRef.current?.focus()
  }, [current, minimized])

  if (!current) return null

  const openControl = () => {
    setMinimizedFor(signature)
    setSelectedEntity(current.entityId)
  }

  return (
    <AnimatePresence mode="wait">
      {minimized ? (
        <motion.button
          key="critical-banner"
          type="button"
          onClick={() => setMinimizedFor(null)}
          className="critical-edge fixed inset-x-3 top-[max(10px,env(safe-area-inset-top))] z-[110] flex min-h-[54px] items-center gap-3 rounded-[18px] bg-[#a8071a] px-4 text-left text-white shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-[min(680px,calc(100%-32px))] sm:-translate-x-1/2"
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -18 }}
          aria-label={`Espandi avviso critico: ${current.title}`}
        >
          <TriangleAlert size={22} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">Avviso critico</span>
            <span className="block truncate text-sm font-semibold">{current.title} · {current.detail}</span>
          </span>
          <ChevronUp size={20} className="shrink-0" aria-hidden="true" />
        </motion.button>
      ) : (
        <motion.section
          key="critical-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="critical-title"
          aria-describedby="critical-description"
          className="critical-screen fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_50%_20%,rgba(180,14,35,.94),rgba(38,3,10,.98)_62%)] px-5 py-[max(24px,env(safe-area-inset-top))] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Pulsazione rossa intermittente (§11): solo opacity, spenta con reduced-motion. */}
          {!reduceMotion && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[#ff2038]"
              animate={{ opacity: [0, 0.14, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <motion.div
            className="flex w-full max-w-[720px] flex-col items-center text-center"
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <motion.div
              className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-white/25 bg-white/12 shadow-[0_0_60px_rgba(255,255,255,.16)]"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ShieldAlert size={48} strokeWidth={1.6} aria-hidden="true" />
            </motion.div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/65">Emergenza casa</p>
            <h2 id="critical-title" className="mt-3 text-[clamp(36px,7vw,72px)] font-semibold leading-[0.98] tracking-[-0.035em]">
              {current.title}
            </h2>
            <p id="critical-description" className="mt-5 max-w-[620px] text-[clamp(17px,2.4vw,24px)] leading-relaxed text-white/80">
              {current.detail}
            </p>
            <p className="mt-3 max-w-[620px] rounded-[18px] border border-white/15 bg-black/15 px-5 py-4 text-base font-semibold leading-relaxed text-white/90">
              {current.instruction}
            </p>
            {alerts.length > 1 && (
              <p className="mt-4 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold">
                Altri {alerts.length - 1} {alerts.length === 2 ? 'evento critico attivo' : 'eventi critici attivi'}
              </p>
            )}
            {emergencyActions.length > 0 && (
              <div className="mt-7 flex w-full max-w-[580px] flex-wrap gap-3">
                {emergencyActions.map((shortcut) => (
                  <ShortcutActionButton key={shortcut.id} shortcut={shortcut} />
                ))}
              </div>
            )}
            <div className="mt-8 flex w-full max-w-[580px] flex-col gap-3 sm:flex-row">
              <button
                ref={focusRef}
                type="button"
                onClick={openControl}
                className="min-h-[56px] flex-1 rounded-full bg-white px-6 text-base font-bold text-[#7d0617] shadow-xl transition active:scale-[0.97]"
              >
                Apri controllo
              </button>
              <button
                type="button"
                onClick={() => setMinimizedFor(signature)}
                className="min-h-[56px] flex-1 rounded-full border border-white/25 bg-white/10 px-6 text-base font-semibold text-white backdrop-blur transition active:scale-[0.97]"
              >
                Riduci a banner
              </button>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-white/55">
              L’avviso resta visibile finché il sensore non torna in sicurezza.
            </p>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
