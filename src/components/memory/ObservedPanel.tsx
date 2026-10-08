import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { homeAiApi, type ObservedEvent } from '../../api/homeAi'
import { useCoreLabels } from '../../hooks/useCoreLabels'
import { actionLabel, ATTRIBUTION_LABEL, EVENT_KIND_LABEL, formatWhen } from '../../lib/memoryLabels'
import { GlassCard } from '../glass/GlassCard'
import { Badge, Empty, Failure, Loading } from './MemoryUi'
import { cn } from '../../lib/utils'

const FILTERS = [
  { id: 'all', label: 'Tutto', kinds: [] as string[] },
  { id: 'manual', label: 'Gesti', kinds: ['manual.intent', 'manual.result'] },
  { id: 'state', label: 'Stati', kinds: ['state.changed'] },
  { id: 'presence', label: 'Presenza', kinds: ['presence.signal'] },
  { id: 'gaps', label: 'Copertura', kinds: ['coverage.gap'] },
] as const

function describe(event: ObservedEvent, label: (id: string) => string): string {
  switch (event.kind) {
    case 'manual.intent': return `${actionLabel(event.payload.action_key)} ${event.payload.target_entity_ids.map(label).join(', ')}`
    case 'manual.result': return event.payload.result === 'accepted' ? 'Comando accettato' : event.payload.result === 'failed' ? 'Comando rifiutato' : 'Esito ignoto (es. timeout): nessun nuovo tentativo dal core'
    case 'state.changed': return `${label(event.payload.entity_id)}: ${event.payload.after ? (event.payload.after.availability === 'available' ? event.payload.after.state : event.payload.after.availability === 'unavailable' ? 'non disponibile' : 'sconosciuto') : 'rimossa'}`
    case 'presence.signal': return event.payload.status === 'home' ? 'Rientro di un abitante' : event.payload.status === 'away' ? 'Uscita di un abitante' : 'Presenza incerta'
    case 'forecast.updated': return `${event.payload.points.length} punti di previsione da ${event.payload.forecast_source_id}`
    case 'calendar.updated': return `Calendario ${event.payload.calendar_id} rev. ${event.payload.revision}`
    case 'coverage.gap': return event.payload.until ? 'Collegamento ripristinato' : 'Collegamento perso: osservazione incompleta'
  }
}

const ATTRIBUTION_TONE: Record<string, 'blue' | 'neutral' | 'warn' | 'ok'> = { manual_confirmed: 'blue', manual_likely: 'warn', automation: 'neutral', system: 'neutral', unknown: 'warn' }

/** "Cosa ho osservato": timeline leggibile con attribuzioni, ritardi e gap visibili. */
export function ObservedPanel() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const kinds = FILTERS.find((f) => f.id === filter)?.kinds ?? []
  const events = useQuery({ queryKey: ['home-ai', 'events', filter], queryFn: () => homeAiApi.events({ kinds: [...kinds], limit: 150 }), refetchInterval: 20_000 })
  const episodes = useQuery({ queryKey: ['home-ai', 'episodes'], queryFn: homeAiApi.episodes, refetchInterval: 60_000 })
  const label = useCoreLabels()

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <GlassCard className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold text-[var(--ink)]">Cosa ho osservato</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro eventi">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                className={cn('min-h-11 rounded-full px-3 text-xs font-semibold', filter === f.id ? 'bg-[var(--action-blue)] text-[var(--on-accent)]' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)]')}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {events.data?.gaps.length ? <p className="rounded-[11px] bg-[var(--alert-orange)]/10 p-3 text-sm text-[var(--alert-orange)]">Copertura incompleta dal {formatWhen(events.data.gaps[0].from)}: gli eventi intermedi possono mancare.</p> : null}
        {events.isPending ? <Loading what="degli eventi" />
          : events.isError ? <Failure message={events.error instanceof Error ? events.error.message : 'Eventi non disponibili.'} onRetry={() => { void events.refetch() }} />
            : events.data.events.length === 0 ? <Empty>Nessun evento osservato con i filtri scelti.</Empty>
              : (
                <ol className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
                  {events.data.events.map((event) => (
                    <li key={event.event_id} className="flex items-start gap-3 rounded-[11px] bg-[var(--fill-subtle)] px-3 py-2">
                      <span className="w-24 shrink-0 text-[11px] tabular-nums text-[var(--ink-tertiary)]">{formatWhen(event.occurred_at)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--ink)]">{describe(event, label)}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge>{EVENT_KIND_LABEL[event.kind]}</Badge>
                          <Badge tone={ATTRIBUTION_TONE[event.quality.attribution]}>{ATTRIBUTION_LABEL[event.quality.attribution]}</Badge>
                          {event.quality.reason_codes.includes('LATE_EVENT') && <Badge tone="warn">Arrivato in ritardo</Badge>}
                          {event.delivery === 'snapshot' && <Badge>Riallineamento</Badge>}
                          {events.data.demo && <Badge tone="warn">Demo</Badge>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
      </GlassCard>

      <GlassCard className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Rientri riconosciuti</h2>
        <p className="text-[12px] text-[var(--ink-tertiary)]">Un rientro conta solo dopo un’assenza reale e una presenza stabile. Senza copertura completa non vale né come successo né come controesempio.</p>
        {episodes.isPending ? <Loading what="dei rientri" />
          : episodes.isError ? <Failure message="Rientri non disponibili." onRetry={() => { void episodes.refetch() }} />
            : episodes.data.episodes.length === 0 ? <Empty>Nessun rientro ancora osservato.</Empty>
              : (
                <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
                  {episodes.data.episodes.slice(0, 40).map((episode) => (
                    <li key={episode.episode_id} className="rounded-[11px] bg-[var(--fill-subtle)] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-[var(--ink)]">{formatWhen(episode.arrived_at)}</span>
                        {episode.state === 'present_stable' ? <Badge tone="ok">Rientro stabile</Badge> : episode.state === 'cancelled' ? <Badge>Annullato (presenza instabile)</Badge> : episode.state === 'ambiguous' ? <Badge tone="warn">Ambiguo</Badge> : <Badge>In verifica</Badge>}
                        {episode.coverage !== 'complete' && <Badge tone="warn">Dati incompleti</Badge>}
                        {episode.late_corrected && <Badge>Corretto in ritardo</Badge>}
                      </div>
                      <p className="mt-1 text-[12px] text-[var(--ink-secondary)]">
                        {episode.actions.length ? episode.actions.map((a) => `${actionLabel(a.action_key)} ${a.targets.map(label).join(', ')} (+${Math.round(a.offset_s / 60 * 10) / 10} min${a.session_updates > 1 ? `, ${a.session_updates} regolazioni in una sessione` : ''})`).join(' → ') : 'Nessun gesto manuale nella finestra.'}
                      </p>
                      {episode.automation_effects.length > 0 && <p className="text-[11px] text-[var(--ink-tertiary)]">Automazioni esistenti: {episode.automation_effects.map(label).join(', ')} (escluse dalle abitudini)</p>}
                    </li>
                  ))}
                </ul>
              )}
      </GlassCard>
    </div>
  )
}
