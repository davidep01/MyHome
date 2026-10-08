import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { homeAiApi } from '../../api/homeAi'
import { formatWhen } from '../../lib/memoryLabels'
import { GlassCard } from '../glass/GlassCard'
import { ActionButton, Badge, Empty, Failure, Loading } from './MemoryUi'

const HEALTH_ROWS: { key: string; label: string; value: (h: Record<string, unknown>) => string; warn?: (h: Record<string, unknown>) => boolean }[] = [
  { key: 'service', label: 'Servizio', value: (h) => (h.service === 'running' ? 'avviato' : h.service === 'degraded' ? 'degradato' : String(h.service)), warn: (h) => h.service !== 'running' },
  { key: 'ha', label: 'Sorgente Home Assistant', value: (h) => ({ reachable: 'raggiungibile', unreachable: 'non raggiungibile', not_configured: 'non configurata', disabled: 'non usata (demo)' } as Record<string, string>)[String(h.ha_source)] ?? String(h.ha_source), warn: (h) => h.ha_source === 'unreachable' },
  { key: 'coverage', label: 'Copertura eventi', value: (h) => ({ complete: 'completa', partial: 'parziale', unknown: 'non nota' } as Record<string, string>)[String(h.coverage)], warn: (h) => h.coverage !== 'complete' },
  { key: 'learner', label: 'Apprendimento', value: (h) => ({ active: 'attivo', stopped_no_consent: 'fermo: manca il consenso', demo_only: 'solo dati dimostrativi' } as Record<string, string>)[String(h.learner)] },
  { key: 'waste', label: 'Calendario raccolta', value: (h) => ({ approved: 'confermato e valido', draft: 'bozza da approvare', expired: 'scaduto', conflict: 'in conflitto', not_configured: 'non configurato' } as Record<string, string>)[String(h.waste_calendar)], warn: (h) => h.waste_calendar === 'expired' || h.waste_calendar === 'conflict' },
  { key: 'forecast', label: 'Previsioni', value: (h) => ({ available: 'disponibili e valide', current_only: 'solo meteo corrente', unavailable: 'non disponibili' } as Record<string, string>)[String(h.forecast)] },
  { key: 'reasoner', label: 'Motore di ragionamento', value: () => 'non configurato (previsto in questa release)' },
  { key: 'exec', label: 'Esecuzione fisica', value: () => 'disattivata' },
]

/** "Stato del sistema": problemi azionabili, copertura, archivio, backup, audit. */
export function StatusPanel() {
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: ['home-ai', 'status'], queryFn: homeAiApi.status, refetchInterval: 20_000 })
  const backups = useQuery({ queryKey: ['home-ai', 'backups'], queryFn: homeAiApi.backups })
  const audit = useQuery({ queryKey: ['home-ai', 'audit'], queryFn: homeAiApi.audit, refetchInterval: 30_000 })
  const [message, setMessage] = useState<string | null>(null)
  const create = useMutation({ mutationFn: homeAiApi.createBackup, onSuccess: async () => { setMessage('Backup cifrato creato e verificato.'); await queryClient.invalidateQueries({ queryKey: ['home-ai'] }) }, onError: () => setMessage('Backup non riuscito.') })
  const restore = useMutation({
    mutationFn: homeAiApi.restoreBackup,
    onSuccess: async (out) => { setMessage(`Ripristinato. Cancellazioni riapplicate: ${out.tombstones_reapplied}.`); await queryClient.invalidateQueries({ queryKey: ['home-ai'] }) },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Ripristino non riuscito.'),
  })
  const health = status.data?.health as unknown as Record<string, unknown> | undefined

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <GlassCard className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Stato del core</h2>
        {status.isPending ? <Loading what="dello stato" />
          : status.isError ? <Failure message={status.error instanceof Error ? status.error.message : 'Core non disponibile.'} onRetry={() => { void status.refetch() }} />
            : health && (
              <>
                {status.data.health.issues.length > 0 && (
                  <ul className="space-y-1">{status.data.health.issues.map((issue) => <li key={issue.code} className="rounded-[11px] bg-[var(--alert-orange)]/10 px-3 py-2 text-sm text-[var(--alert-orange)]">{issue.message}</li>)}</ul>
                )}
                <dl className="divide-y divide-[var(--hairline)] text-sm">
                  {HEALTH_ROWS.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-[var(--ink-secondary)]">{row.label}</dt>
                      <dd className={row.warn?.(health) ? 'font-semibold text-[var(--alert-orange)]' : 'font-semibold text-[var(--ink)]'}>{row.value(health)}</dd>
                    </div>
                  ))}
                </dl>
                <h3 className="pt-2 text-sm font-semibold text-[var(--ink)]">Copertura dichiarata</h3>
                <ul className="space-y-1 text-[13px]">{status.data.coverage.map((c) => <li key={c.channel}><span className="font-semibold text-[var(--ink)]">{c.channel}:</span> <span className="text-[var(--ink-secondary)]">{c.status}</span></li>)}</ul>
              </>
            )}
      </GlassCard>

      <div className="space-y-5">
        <GlassCard className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-sm font-semibold text-[var(--ink)]">Backup del core</h2>
            <ActionButton tone="primary" disabled={create.isPending} onClick={() => create.mutate()}>Crea backup</ActionButton>
          </div>
          <p className="text-[12px] text-[var(--ink-tertiary)]">Copia coerente, cifrata, verificata; ultime 7 copie. La chiave è conservata a parte. Ultimo ripristino verificato: {backups.data?.last_restore_verified_at ? formatWhen(backups.data.last_restore_verified_at) : 'mai'}.</p>
          {backups.isPending ? <Loading what="dei backup" /> : (backups.data?.backups.length ?? 0) === 0 ? <Empty>Nessun backup ancora.</Empty> : (
            <ul className="space-y-1.5">
              {backups.data!.backups.map((b) => (
                <li key={b.id} className="flex items-center gap-2 rounded-[11px] bg-[var(--fill-subtle)] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">{formatWhen(b.created_at)} · {Math.round(b.bytes / 1024)} KB</span>
                  <ActionButton disabled={restore.isPending} onClick={() => { if (window.confirm('Ripristinare questo backup? Il database attuale viene prima salvato a parte e le cancellazioni già richieste vengono riapplicate.')) restore.mutate(b.id) }}>Ripristina</ActionButton>
                </li>
              ))}
            </ul>
          )}
          {message && <p role="status" aria-live="polite" className="text-sm font-semibold text-[var(--ink-secondary)]">{message}</p>}
        </GlassCard>

        <GlassCard className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Registro delle decisioni</h2>
          {audit.isPending ? <Loading what="del registro" /> : audit.isError ? <Failure message="Registro non disponibile." /> : audit.data.entries.length === 0 ? <Empty>Nessuna voce.</Empty> : (
            <ul className="max-h-80 space-y-1 overflow-y-auto pr-1 text-[12px]">
              {audit.data.entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-1.5 rounded-[9px] bg-[var(--fill-subtle)] px-2.5 py-1.5">
                  <span className="tabular-nums text-[var(--ink-tertiary)]">{formatWhen(entry.at)}</span>
                  <span className="font-semibold text-[var(--ink)]">{entry.action}</span>
                  <Badge tone={entry.outcome === 'blocked' ? 'danger' : 'neutral'}>{entry.outcome}</Badge>
                  {entry.detail && <span className="text-[var(--ink-secondary)]">{entry.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
