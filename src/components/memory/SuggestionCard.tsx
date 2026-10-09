import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CloudRain, Home, Lightbulb } from 'lucide-react'
import { homeAiApi, type StoredProposal } from '../../api/homeAi'
import { formatWhen, PROPOSAL_STATE_LABEL, reasonText } from '../../lib/memoryLabels'
import { ActionButton, Badge, NoControlNotice } from './MemoryUi'

const AGENT_ICON = { arrival: Home, waste: CalendarClock, weather: CloudRain, comfort: Lightbulb, energy: Lightbulb } as const

/**
 * Un suggerimento o promemoria del core con le sole azioni ammesse
 * (specifica §17): spiegare, salvare una preferenza, simulare, dare feedback,
 * rimandare, non suggerire più, dimenticare, segnare come fatto. Nessuna
 * azione comanda un dispositivo.
 */
export function SuggestionCard({ proposal, diagnostic = false }: { proposal: StoredProposal; diagnostic?: boolean }) {
  const queryClient = useQueryClient()
  const [why, setWhy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const Icon = AGENT_ICON[proposal.agent_key] ?? Lightbulb
  const isReminder = proposal.kind === 'reminder'
  const learned = Boolean(proposal.pattern_id)

  const explain = useQuery({
    queryKey: ['home-ai', 'explain', proposal.pattern_id],
    queryFn: () => homeAiApi.explainPattern(proposal.pattern_id!),
    enabled: why && learned,
  })

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['home-ai'] }),
  ])

  const run = useMutation({
    mutationFn: async (action: string) => {
      switch (action) {
        case 'save': return (await homeAiApi.approve(proposal, 'save_preference')).notice
        case 'simulate': {
          await homeAiApi.approve(proposal, 'simulate_once')
          const report = await homeAiApi.simulate(proposal.proposal_id)
          return report.status === 'simulated' ? 'Simulazione completata: nessun dispositivo è stato toccato. Il risultato è in “Simulazioni”.' : 'Simulazione terminata con esito negativo: dettagli in “Simulazioni”.'
        }
        case 'done': await homeAiApi.feedback(proposal.proposal_id, 'done'); return 'Segnato come fatto.'
        case 'snooze': await homeAiApi.feedback(proposal.proposal_id, 'snooze', 60); return 'Rimandato di un’ora (mai oltre la scadenza utile).'
        case 'not_useful': await homeAiApi.feedback(proposal.proposal_id, 'not_useful'); return 'Grazie: ne terrò conto per questo contesto.'
        case 'wrong_context': await homeAiApi.feedback(proposal.proposal_id, 'wrong_context'); return 'Segnato come contesto sbagliato: l’ipotesi viene sospesa.'
        case 'never': await homeAiApi.feedback(proposal.proposal_id, 'never_suggest'); return 'Non lo suggerirò più.'
        case 'forget':
          if (!window.confirm('Dimenticare l’abitudine e i dati derivati (episodi, evidenze, proposte)? L’operazione non si annulla.')) return null
          await homeAiApi.feedback(proposal.proposal_id, 'forget')
          return 'Dati dimenticati.'
        default: return null
      }
    },
    onSuccess: async (text) => { if (text) setMessage(text); await refresh() },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Operazione non riuscita.'),
  })

  const busy = run.isPending
  const act = (action: string) => { setMessage(null); run.mutate(action) }

  return (
    <article className="space-y-3 rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface-solid)] p-4" aria-label={proposal.title}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[var(--fill-subtle)] text-[var(--ink-secondary)]"><Icon size={18} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-semibold text-[var(--ink)]">{proposal.title}</h3>
            {proposal.demo && <Badge tone="warn">Dati dimostrativi</Badge>}
            {diagnostic && <Badge>{PROPOSAL_STATE_LABEL[proposal.state] ?? proposal.state}</Badge>}
            {proposal.risk !== 'information' && <Badge>Rischio prospettico: {proposal.risk === 'low' ? 'basso' : proposal.risk === 'medium' ? 'medio' : 'alto'}</Badge>}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-secondary)]">{proposal.explanation}</p>
          <p className="mt-1 text-[11px] text-[var(--ink-tertiary)]">Scade {formatWhen(proposal.expires_at)} · revisione {proposal.revision}</p>
        </div>
      </div>

      {why && (
        <div className="space-y-2 rounded-[11px] bg-[var(--fill-subtle)] p-3 text-sm">
          <p className="font-semibold text-[var(--ink)]">Perché te lo propongo</p>
          <ul className="list-disc space-y-0.5 pl-5 text-[var(--ink-secondary)]">
            {proposal.reason_codes.map((code) => <li key={code}>{reasonText(code)}</li>)}
          </ul>
          {learned && (explain.isPending ? <p className="text-[var(--ink-tertiary)]">Carico le evidenze…</p>
            : explain.data && (
              <div>
                <p className="font-semibold text-[var(--ink)]">Evidenze ({explain.data.pattern.counts.successes} su {explain.data.pattern.counts.eligible_opportunities} rientri osservabili)</p>
                <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-[var(--ink-secondary)]">
                  {explain.data.episodes.slice(0, 20).map((episode) => (
                    <li key={episode.episode_id}>
                      {formatWhen(episode.arrived_at)} — {episode.role === 'success' ? 'routine osservata' : episode.role === 'counterexample' ? 'controesempio: non è successo' : 'dati incompleti (non conteggiato)'}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          <NoControlNotice />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={() => setWhy((v) => !v)}>{why ? 'Nascondi spiegazione' : 'Perché me lo proponi?'}</ActionButton>
        {isReminder ? (
          <>
            <ActionButton tone="primary" disabled={busy} onClick={() => act('done')}>Fatto</ActionButton>
            <ActionButton disabled={busy} onClick={() => act('snooze')}>Più tardi</ActionButton>
          </>
        ) : (
          <>
            {proposal.kind === 'preference' && !diagnostic && <ActionButton tone="primary" disabled={busy} onClick={() => act('save')}>Salva come preferenza</ActionButton>}
            {proposal.steps.length > 0 && <ActionButton disabled={busy} onClick={() => act('simulate')}>Simula</ActionButton>}
            {!diagnostic && <ActionButton disabled={busy} onClick={() => act('not_useful')}>Non utile</ActionButton>}
            {learned && !diagnostic && <ActionButton disabled={busy} onClick={() => act('wrong_context')}>Contesto sbagliato</ActionButton>}
            {!diagnostic && <ActionButton disabled={busy} onClick={() => act('snooze')}>Più tardi</ActionButton>}
            {!diagnostic && <ActionButton disabled={busy} onClick={() => act('never')}>Non suggerire più</ActionButton>}
            {learned && <ActionButton tone="danger" disabled={busy} onClick={() => act('forget')}>Dimentica questi dati</ActionButton>}
          </>
        )}
      </div>
      {message && <p role="status" aria-live="polite" className="text-sm font-semibold text-[var(--ink-secondary)]">{message}</p>}
    </article>
  )
}
