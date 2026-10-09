import { useQuery } from '@tanstack/react-query'
import { homeAiApi } from '../../api/homeAi'
import { formatWhen } from '../../lib/memoryLabels'
import { GlassCard } from '../glass/GlassCard'
import { Badge, Empty, Failure, Loading } from './MemoryUi'

const OUTCOME: Record<string, string> = {
  would_apply: 'Si applicherebbe',
  already_satisfied: 'Già nello stato richiesto',
  redundant_automation: 'Ridondante con un’automazione esistente',
  conflict: 'In conflitto',
  precondition_missing: 'Precondizione mancante',
  not_reached: 'Non raggiunto',
  simulated_failure: 'Guasto simulato',
}

/** "Simulazioni": passi prospettici e risultati, sempre con il badge "Simulazione". */
export function SimulationsPanel() {
  const reports = useQuery({ queryKey: ['home-ai', 'simulations'], queryFn: homeAiApi.simulations, refetchInterval: 30_000 })
  return (
    <GlassCard className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold text-[var(--ink)]">Simulazioni</h2>
        <Badge tone="blue">Simulazione · nessun effetto fisico</Badge>
      </div>
      <p className="text-[12px] text-[var(--ink-tertiary)]">Il simulatore lavora su una copia dello stato: non comanda dispositivi, non invia notifiche e non conta come comportamento osservato.</p>
      {reports.isPending ? <Loading what="delle simulazioni" />
        : reports.isError ? <Failure message={reports.error instanceof Error ? reports.error.message : 'Simulazioni non disponibili.'} onRetry={() => { void reports.refetch() }} />
          : reports.data.reports.length === 0 ? <Empty>Nessuna simulazione eseguita. Dalla sezione “Adesso” scegli “Simula” su una proposta.</Empty>
            : (
              <ul className="space-y-2">
                {reports.data.reports.map((report) => (
                  <li key={report.report_id} className="space-y-2 rounded-[11px] bg-[var(--fill-subtle)] p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="blue">Simulazione</Badge>
                      <Badge tone={report.status === 'simulated' ? 'ok' : report.status === 'failed' ? 'warn' : 'neutral'}>{report.status === 'simulated' ? 'Completata' : report.status === 'failed' ? 'Fallita (simulato)' : 'Bloccata'}</Badge>
                      <span className="text-[12px] text-[var(--ink-tertiary)]">{formatWhen(report.created_at)} · seed {report.seed}</span>
                    </div>
                    <ol className="space-y-1 text-sm">
                      {report.steps.map((step) => (
                        <li key={step.step_id} className="text-[var(--ink-secondary)]">
                          <span className="font-semibold text-[var(--ink)]">{step.step_id}</span> · {OUTCOME[step.outcome] ?? step.outcome}
                          {Object.keys(step.diff).length > 0 && <span> — {Object.entries(step.diff).map(([k, v]) => `${k}: ${String(v)}`).join('; ')}</span>}
                          <span className="block text-[12px] text-[var(--ink-tertiary)]">{step.note}</span>
                        </li>
                      ))}
                    </ol>
                    {report.uncertainty.length > 0 && <p className="text-[12px] text-[var(--ink-tertiary)]">Limiti: {report.uncertainty.join(' ')}</p>}
                  </li>
                ))}
              </ul>
            )}
    </GlassCard>
  )
}
