import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, Download, RefreshCw } from 'lucide-react'
import { useAddonUpdate, type AddonUpdateState } from '../../hooks/useAddonUpdate'
import { BRAND_NAME } from '../../lib/brand'

/**
 * Schermo pieno mostrato sul kiosk mentre l'add-on si aggiorna.
 *
 * Sta sopra `ConnectionOverlay` (z 90) di proposito: durante la sostituzione
 * dell'immagine il servizio sparisce, e senza questo schermo il tablet a muro
 * mostrerebbe "connessione assente" — che sembra un guasto proprio mentre sta
 * andando tutto bene.
 */
export function AddonUpdateOverlay() {
  return <AddonUpdateScreen {...useAddonUpdate()} />
}

/**
 * Presentazione pura, separata dai dati: è l'unico modo di verificarla in
 * test, perché lo store Zustand in render server restituisce lo stato
 * iniziale e non quello vivo.
 */
export function AddonUpdateScreen({
  phase, percentage, installedVersion, latestVersion,
}: AddonUpdateState) {
  if (phase === 'idle') return null

  const done = phase === 'done'
  const title = done ? 'Aggiornamento completato' : 'Aggiornamento in corso'
  const detail = done
    ? 'Ricarico la dashboard con la versione nuova…'
    : phase === 'restarting'
      ? 'Il servizio si sta riavviando. Non spegnere il tablet.'
      : 'Sto installando la nuova versione. Non spegnere il tablet.'

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-6 px-8 text-center"
        style={{ background: 'rgba(7,7,9,0.94)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="status"
        aria-live="polite"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-white/10 text-white">
          {done
            ? <CheckCircle2 size={38} />
            : phase === 'restarting'
              ? <RefreshCw size={34} className="animate-spin" />
              : <Download size={34} />}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">{BRAND_NAME}</p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
          <p className="text-base text-white/55">{detail}</p>
        </div>

        {!done && (
          <div className="w-full max-w-md space-y-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
              <motion.div
                className="h-full rounded-full bg-[#2997ff]"
                // Percentuale reale se HA la fornisce, altrimenti una barra che
                // respira: mai una percentuale inventata.
                initial={{ scaleX: 0 }}
                animate={percentage !== null
                  ? { scaleX: Math.max(0.02, percentage / 100) }
                  : { scaleX: [0.15, 0.85, 0.15] }}
                transition={percentage !== null
                  ? { duration: 0.4 }
                  : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: 'left center' }}
              />
            </div>
            {percentage !== null && (
              <p className="text-sm font-semibold tabular-nums text-white/60">{Math.round(percentage)}%</p>
            )}
          </div>
        )}

        {installedVersion && latestVersion && installedVersion !== latestVersion && (
          <p className="text-sm text-white/35">
            {installedVersion} → <span className="font-semibold text-white/60">{latestVersion}</span>
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
