import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { readStorage, writeStorage } from '../../lib/browserStorage'

const DISMISS_KEY = 'myhome.legacyActivationDismissed'

/**
 * Dispositivi configurati prima dell'opt-in e mai attivati: oggi sono
 * invisibili sul tablet. La proposta è esplicita (un tocco, con l'elenco
 * sotto gli occhi) e si può rimandare: "Non ora" vale finché l'elenco non cambia.
 */
export function LegacyActivationBanner({
  entityIds,
  nameOf,
  readOnly,
  onActivate,
}: {
  entityIds: string[]
  nameOf: (id: string) => string
  readOnly: boolean
  onActivate: (ids: string[]) => void
}) {
  const signature = entityIds.join(',')
  const [dismissed, setDismissed] = useState(() => readStorage(DISMISS_KEY) === signature)
  if (entityIds.length === 0 || dismissed) return null

  const count = entityIds.length
  const names = entityIds.map(nameOf)
  return (
    <section
      aria-labelledby="legacy-activation-title"
      className="shrink-0 rounded-[18px] border border-[var(--action-blue)]/20 bg-[var(--action-blue)]/[0.07] px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles size={18} className="shrink-0 text-[var(--action-blue)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="legacy-activation-title" className="text-[15px] font-semibold text-[var(--ink)]">
            {count === 1 ? 'Un dispositivo configurato non è ancora sul tablet' : `${count} dispositivi configurati non sono ancora sul tablet`}
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--ink-secondary)]">
            Li avevi impostati prima che la dashboard diventasse a scelta esplicita: {names.join(', ')}.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onActivate(entityIds)}
            className="min-h-[44px] rounded-full bg-[var(--action-blue)] px-4 text-sm font-semibold text-[var(--on-accent)] transition active:scale-95 disabled:opacity-50"
          >
            {count === 1 ? 'Attivalo' : `Attiva tutti e ${count}`}
          </button>
          <button
            type="button"
            onClick={() => { writeStorage(DISMISS_KEY, signature); setDismissed(true) }}
            className="min-h-[44px] rounded-full bg-[var(--fill-subtle)] px-4 text-sm font-semibold text-[var(--ink-secondary)] transition active:scale-95"
          >
            Non ora
          </button>
        </div>
      </div>
    </section>
  )
}
