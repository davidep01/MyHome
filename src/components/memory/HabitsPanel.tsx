import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { homeAiApi, type StoredPattern } from '../../api/homeAi'
import { useCoreLabels } from '../../hooks/useCoreLabels'
import { formatWhen, PATTERN_STATE_LABEL, reasonText, stepVerb } from '../../lib/memoryLabels'
import { GlassCard } from '../glass/GlassCard'
import { ActionButton, Badge, Empty, Failure, Loading } from './MemoryUi'

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

function PatternRow({ pattern, label }: { pattern: StoredPattern; label: (id: string) => string }) {
  const queryClient = useQueryClient()
  const [why, setWhy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const explain = useQuery({ queryKey: ['home-ai', 'explain', pattern.pattern_id], queryFn: () => homeAiApi.explainPattern(pattern.pattern_id), enabled: why })
  const feedback = useMutation({
    mutationFn: (kind: 'not_useful' | 'wrong_context' | 'never_suggest' | 'forget') => homeAiApi.patternFeedback(pattern.pattern_id, kind),
    onSuccess: async () => { setMessage('Registrato.'); await queryClient.invalidateQueries({ queryKey: ['home-ai'] }) },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Non riuscito.'),
  })
  const { counts } = pattern
  const steps = pattern.steps.map((step) => `${stepVerb(step.desired.action)} ${step.target_entity_ids.map(label).join(', ')}`).join(' → ')
  const part = pattern.context_rule_id.split('.').pop()
  const partLabel = part === 'evening' ? 'rientri serali' : part === 'afternoon' ? 'rientri pomeridiani' : part === 'morning' ? 'rientri mattutini' : 'rientri notturni'

  return (
    <li className="space-y-2 rounded-[11px] bg-[var(--fill-subtle)] p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-[var(--ink)]">{steps}</span>
        <Badge tone={pattern.state === 'supported' ? 'ok' : pattern.state === 'retired' || pattern.state === 'suppressed' ? 'neutral' : 'blue'}>{PATTERN_STATE_LABEL[pattern.state]}</Badge>
        {pattern.demo && <Badge tone="warn">Demo</Badge>}
      </div>
      <p className="text-sm text-[var(--ink-secondary)]">
        {counts.successes} {partLabel} su {counts.eligible_opportunities} osservabili · {counts.counterexamples} controesempi · {counts.distinct_days} giorni diversi · periodo {formatWhen(pattern.period.from, { day: 'numeric', month: 'short' })}–{formatWhen(pattern.period.until, { day: 'numeric', month: 'short' })}
      </p>
      <p className="text-[12px] text-[var(--ink-tertiary)]">
        Frequenza {pct(pattern.confidence)} · limite inferiore Wilson 95% {pct(pattern.wilson_lower)} · copertura {pct(pattern.coverage)} · fuori dai rientri {pct(pattern.baseline_frequency)} · peso recente {pct(pattern.weighted_score)} · {pattern.temporal_validation === 'passed' ? 'confermata nel tempo' : pattern.temporal_validation === 'failed' ? 'non confermata nel tempo' : 'non ancora verificata nel tempo'}
      </p>
      {pattern.status_reason.length > 0 && <p className="text-[12px] text-[var(--ink-secondary)]">Stato: {pattern.status_reason.map(reasonText).join('; ')}.</p>}
      {why && (explain.isPending ? <Loading what="delle evidenze" /> : explain.data && (
        <ul className="max-h-44 space-y-0.5 overflow-y-auto text-[12px] text-[var(--ink-secondary)]">
          {explain.data.episodes.map((episode) => (
            <li key={episode.episode_id}>{formatWhen(episode.arrived_at)} — {episode.role === 'success' ? 'osservata' : episode.role === 'counterexample' ? 'controesempio' : 'non coperto (escluso dal conteggio)'}</li>
          ))}
        </ul>
      ))}
      <div className="flex flex-wrap gap-2">
        <ActionButton onClick={() => setWhy((v) => !v)}>{why ? 'Nascondi evidenze' : 'Perché?'}</ActionButton>
        <ActionButton disabled={feedback.isPending} onClick={() => feedback.mutate('not_useful')}>Non utile</ActionButton>
        <ActionButton disabled={feedback.isPending} onClick={() => feedback.mutate('wrong_context')}>Contesto sbagliato</ActionButton>
        <ActionButton disabled={feedback.isPending} onClick={() => feedback.mutate('never_suggest')}>Non suggerire più</ActionButton>
        <ActionButton tone="danger" disabled={feedback.isPending} onClick={() => { if (window.confirm('Dimenticare questa abitudine e le sue evidenze?')) feedback.mutate('forget') }}>Dimentica</ActionButton>
      </div>
      {message && <p role="status" className="text-[12px] font-semibold text-[var(--ink-secondary)]">{message}</p>}
    </li>
  )
}

/** "Abitudini": campione, periodo, controesempi, stato e correzione/oblio. */
export function HabitsPanel() {
  const queryClient = useQueryClient()
  const patterns = useQuery({ queryKey: ['home-ai', 'patterns'], queryFn: homeAiApi.patterns, refetchInterval: 60_000 })
  const preferences = useQuery({ queryKey: ['home-ai', 'preferences'], queryFn: homeAiApi.preferences })
  const revoke = useMutation({
    mutationFn: homeAiApi.revokePreference,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home-ai'] }),
  })
  const label = useCoreLabels()
  const thresholds = patterns.data?.thresholds

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <GlassCard className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Abitudini e ipotesi</h2>
        {thresholds && (
          <p className="text-[12px] text-[var(--ink-tertiary)]">
            Diventa “supportata dai dati” con almeno {thresholds.min_opportunities} rientri osservabili, {thresholds.min_successes} ripetizioni in {thresholds.min_distinct_days} giorni diversi, {thresholds.min_observation_days} giorni di osservazione, copertura ≥ {Math.round(thresholds.min_coverage * 100)}% e frequenza ≥ {Math.round(thresholds.min_frequency * 100)}%. Solo gesti manuali confermati; le automazioni esistenti non contano.
          </p>
        )}
        {patterns.isPending ? <Loading what="delle abitudini" />
          : patterns.isError ? <Failure message={patterns.error instanceof Error ? patterns.error.message : 'Abitudini non disponibili.'} onRetry={() => { void patterns.refetch() }} />
            : patterns.data.patterns.length === 0 ? <Empty>Nessuna ipotesi ancora: servono più rientri osservati (o il consenso all’apprendimento).</Empty>
              : <ul className="space-y-2">{patterns.data.patterns.map((pattern) => <PatternRow key={pattern.pattern_id} pattern={pattern} label={label} />)}</ul>}
      </GlassCard>
      <GlassCard className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Preferenze esplicite</h2>
        <p className="text-[12px] text-[var(--ink-tertiary)]">Le tue scelte prevalgono sempre sulle ipotesi. Salvare una preferenza non comanda alcun dispositivo.</p>
        {preferences.isPending ? <Loading what="delle preferenze" />
          : preferences.isError ? <Failure message="Preferenze non disponibili." />
            : preferences.data.preferences.length === 0 ? <Empty>Nessuna preferenza salvata.</Empty>
              : (
                <ul className="space-y-1.5">
                  {preferences.data.preferences.map((preference) => (
                    <li key={preference.preference_id} className="flex items-center gap-2 rounded-[11px] bg-[var(--fill-subtle)] px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--ink)]">{preference.description}</p>
                        <p className="text-[11px] text-[var(--ink-tertiary)]">{preference.kind === 'never_suggest' ? 'Non suggerire' : 'Routine salvata'} · {formatWhen(preference.created_at)}</p>
                      </div>
                      <ActionButton disabled={revoke.isPending} onClick={() => revoke.mutate(preference)}>Revoca</ActionButton>
                    </li>
                  ))}
                </ul>
              )}
      </GlassCard>
    </div>
  )
}
