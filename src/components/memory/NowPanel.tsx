import { useQuery } from '@tanstack/react-query'
import { homeAiApi } from '../../api/homeAi'
import { GlassCard } from '../glass/GlassCard'
import { Badge, Empty, Failure, Loading, NoControlNotice } from './MemoryUi'
import { SuggestionCard } from './SuggestionCard'

const OCCUPANCY = { home: 'qualcuno è in casa', away: 'casa vuota', unknown: 'presenza non nota' } as const
const DAYPART = { night: 'notte', morning: 'mattina', afternoon: 'pomeriggio', evening: 'sera' } as const

/** "Adesso": contesto essenziale, promemoria e suggerimenti ammessi dalle policy. */
export function NowPanel() {
  const context = useQuery({ queryKey: ['home-ai', 'context'], queryFn: homeAiApi.context, refetchInterval: 30_000 })
  const inbox = useQuery({ queryKey: ['home-ai', 'suggestions'], queryFn: () => homeAiApi.suggestions(false), refetchInterval: 15_000 })
  const all = useQuery({ queryKey: ['home-ai', 'suggestions', 'all'], queryFn: () => homeAiApi.suggestions(true), refetchInterval: 30_000 })
  const diagnostic = (all.data?.suggestions ?? []).filter((p) => p.state === 'policy_checked' || p.state === 'candidate').slice(0, 10)
  const ctx = context.data

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <GlassCard className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Contesto</h2>
        {context.isPending ? <Loading what="del contesto" />
          : context.isError ? <Failure message={context.error instanceof Error ? context.error.message : 'Contesto non disponibile.'} onRetry={() => { void context.refetch() }} />
            : ctx && (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-[11px] bg-[var(--fill-subtle)] p-3"><dt className="text-[11px] text-[var(--ink-tertiary)]">Ora locale</dt><dd className="font-semibold text-[var(--ink)]">{ctx.local_time} · {DAYPART[ctx.daypart]}</dd></div>
                <div className="rounded-[11px] bg-[var(--fill-subtle)] p-3"><dt className="text-[11px] text-[var(--ink-tertiary)]">Presenza</dt><dd className="font-semibold text-[var(--ink)]">{OCCUPANCY[ctx.occupancy]}</dd></div>
                <div className="rounded-[11px] bg-[var(--fill-subtle)] p-3"><dt className="text-[11px] text-[var(--ink-tertiary)]">Previsioni</dt><dd className="font-semibold text-[var(--ink)]">{ctx.forecast ? (ctx.forecast.valid ? `valide (${ctx.forecast.source_id})` : 'scadute: nessuna affermazione su pioggia futura') : 'non disponibili'}</dd></div>
                <div className="rounded-[11px] bg-[var(--fill-subtle)] p-3"><dt className="text-[11px] text-[var(--ink-tertiary)]">Fascia di quiete</dt><dd className="font-semibold text-[var(--ink)]">{ctx.quiet_hours ? 'attiva: suggerimenti in coda' : 'non attiva'}</dd></div>
                {ctx.open_gaps.length > 0 && <div className="col-span-2 rounded-[11px] bg-[var(--alert-orange)]/10 p-3 text-[var(--alert-orange)]">Copertura incompleta in corso: alcune osservazioni mancano.</div>}
                {ctx.missing_capabilities.length > 0 && <div className="col-span-2 text-[12px] text-[var(--ink-tertiary)]">Non configurato: {ctx.missing_capabilities.join(', ')}.</div>}
              </dl>
            )}
        <div className="flex flex-wrap gap-1.5">
          {ctx?.demo && <Badge tone="warn">Demo: dati sintetici</Badge>}
          {ctx && <Badge tone="blue">Modalità: {ctx.mode === 'suggest' ? 'suggerimenti' : ctx.mode === 'shadow' ? 'in ombra' : 'sola osservazione'}</Badge>}
          {ctx?.guests && <Badge>Ospiti</Badge>}
        </div>
        <NoControlNotice />
      </GlassCard>

      <div className="space-y-4">
        <GlassCard className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Promemoria e suggerimenti</h2>
          {inbox.isPending ? <Loading what="dei suggerimenti" />
            : inbox.isError ? <Failure message={inbox.error instanceof Error ? inbox.error.message : 'Suggerimenti non disponibili.'} onRetry={() => { void inbox.refetch() }} />
              : (inbox.data?.suggestions.length ?? 0) === 0
                ? <Empty>{ctx?.mode === 'shadow' ? 'Modalità in ombra: le proposte restano in diagnostica e non arrivano al tablet.' : ctx?.mode === 'observe' ? 'Sola osservazione: nessun suggerimento.' : 'Niente da segnalare adesso.'}</Empty>
                : inbox.data!.suggestions.map((proposal) => <SuggestionCard key={proposal.proposal_id} proposal={proposal} />)}
        </GlassCard>
        {diagnostic.length > 0 && (
          <GlassCard className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">In ombra — solo diagnostica</h2>
              <p className="text-[12px] text-[var(--ink-tertiary)]">Proposte valutate dalle policy ma non mostrate (modalità in ombra, quiete, budget). Puoi simularle.</p>
            </div>
            {diagnostic.map((proposal) => <SuggestionCard key={proposal.proposal_id} proposal={proposal} diagnostic />)}
          </GlassCard>
        )}
      </div>
    </div>
  )
}
