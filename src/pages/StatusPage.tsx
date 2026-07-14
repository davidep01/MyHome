import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Database, Download,
  ExternalLink, KeyRound, RefreshCw, Upload, WifiOff, Zap,
} from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { configApi, systemApi } from '../api/backend'
import { useDashboardConfig } from '../hooks/useDashboardConfig'
import { useEntityStore } from '../store/entities'
import { useUIStore } from '../store/ui'
import { cn } from '../lib/utils'

/**
 * Regia — Stato (landing desktop): il quadro della casa in 5 secondi.
 * Salute HA/bridge/storage, cosa non va (entità giù, chiavi mancanti),
 * attività recente e le azioni di manutenzione rapide.
 */
export function StatusPage() {
  const { data: status, isPending: statusPending, isError: statusError, error: statusQueryError, isFetching, refetch } = useQuery({
    queryKey: ['system-status'],
    queryFn: systemApi.status,
    refetchInterval: 10_000,
  })
  const { data: config } = useDashboardConfig()
  const entities = useEntityStore((s) => s.entities)
  const connectionStatus = useEntityStore((s) => s.connectionStatus)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const unavailable = useMemo(
    () => Object.values(entities)
      .filter((e) => e.state === 'unavailable')
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
    [entities],
  )

  const problems = useMemo(() => {
    const list: { id: string; severity: 'danger' | 'warn'; text: string; action?: () => void; actionLabel?: string }[] = []
    if (statusError) {
      list.push({
        id: 'backend',
        severity: 'danger',
        text: statusQueryError instanceof Error
          ? `Diagnostica del servizio locale non disponibile — ${statusQueryError.message}`
          : 'Diagnostica del servizio locale non disponibile. Riprova o controlla MyHome nella LAN.',
        action: () => setActiveView('system'),
        actionLabel: 'Sistema',
      })
    }
    if (status && !status.ha.reachable) {
      list.push({ id: 'ha', severity: 'danger', text: `Home Assistant non raggiungibile${status.ha.message ? ` — ${status.ha.message}` : ''}`, action: () => setActiveView('system'), actionLabel: 'Connessione' })
    }
    if (status && !status.integrations.openweather) {
      list.push({ id: 'weather', severity: 'warn', text: 'Chiave OpenWeather assente: meteo spento su kiosk e regia.' })
    }
    if (status && !status.integrations.gemini) {
      list.push({ id: 'ai', severity: 'warn', text: 'Chiave Gemini assente: assistente AI e riconoscimento campanello spenti.' })
    }
    if (status && !status.storage.writable) {
      list.push({ id: 'storage', severity: 'warn', text: 'Storage in sola lettura: le modifiche alla configurazione non vengono salvate.' })
    }
    if (unavailable.length > 0) {
      list.push({ id: 'unavailable', severity: 'warn', text: `${unavailable.length} entità non disponibili.`, action: () => setActiveView('system'), actionLabel: 'Dettagli' })
    }
    return list
  }, [status, statusError, statusQueryError, unavailable.length, setActiveView])

  const home = config?.home
  const online = connectionStatus === 'connected'
  const connecting = connectionStatus === 'idle' || connectionStatus === 'connecting'
  const connectionLabel = online ? 'La casa è connessa' : connecting ? 'Connessione in corso' : 'Connessione assente'
  const connectionDetail = statusPending
    ? 'Verifica di Home Assistant e del bridge dati…'
    : status?.ha.reachable
      ? `Home Assistant risponde in ${status.ha.latencyMs} ms · bridge ${status.stream.mode === 'ws' ? 'WebSocket push' : status.stream.mode === 'poll' ? `poll ${status.stream.pollMs} ms` : 'in attivazione'}`
      : status?.ha.message ?? 'Controlla il servizio MyHome locale e le credenziali Home Assistant.'

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">Stato</h1>
        <p className="mt-1 text-sm text-black/45">Salute e attività dell’installazione MyHome nella rete LAN</p>
      </div>
      <GlassCard className="shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-4" aria-live="polite">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-11 w-11 items-center justify-center rounded-[14px]',
              online ? 'bg-green-500/12 text-green-700' : connecting ? 'bg-orange-500/12 text-orange-700' : 'bg-red-500/12 text-red-600',
            )}>
              {online ? <CheckCircle2 size={21} /> : connecting ? <RefreshCw size={21} className="animate-spin" /> : <WifiOff size={21} />}
            </div>
            <div>
              <p className="text-lg font-semibold text-[#1d1d1f]">{connectionLabel}</p>
              <p className="text-sm text-black/45">{connectionDetail}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex min-h-[44px] items-center gap-2 rounded-full bg-black/[0.07] px-4 text-sm font-semibold text-black/60 transition hover:bg-black/10 active:scale-95"
            >
              <RefreshCw size={15} className={cn(isFetching && 'animate-spin')} /> {isFetching ? 'Verifica…' : 'Prova connessione'}
            </button>
            <a
              href="/kiosk"
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[44px] items-center gap-2 rounded-full bg-[#0066cc] px-4 text-sm font-semibold text-white transition hover:bg-[#0052a3] active:scale-95"
            >
              <ExternalLink size={15} /> Apri dashboard
            </a>
          </div>
        </div>
      </GlassCard>

      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Latenza HA" value={status?.ha.latencyMs != null ? `${status.ha.latencyMs} ms` : statusPending ? '…' : '—'} tone={status?.ha.reachable ? 'ok' : statusPending ? 'neutral' : 'warn'} Icon={Activity} />
        <Metric label="Bridge dati" value={status ? (status.stream.mode === 'ws' ? 'Push WS' : status.stream.mode === 'poll' ? 'Poll' : 'Inattivo') : '—'} tone={status?.stream.mode === 'ws' ? 'ok' : 'neutral'} Icon={Zap} />
        <Metric label="Client LAN" value={String(status?.stream.subscribers ?? 0)} Icon={ArrowUpRight} />
        <Metric label="Storage" value={status ? `${storageModeLabel(status.storage.mode)}${status.storage.writable ? '' : ' (sola lettura)'}` : '—'} tone={status?.storage.writable ? 'neutral' : 'warn'} Icon={Database} />
      </div>

      <div className="grid shrink-0 grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <GlassCard className="space-y-2 overflow-y-auto">
          <h2 className="text-sm font-semibold text-[#1d1d1f]">Cosa non va</h2>
          {statusPending ? (
            <div className="flex min-h-[132px] flex-col items-center justify-center gap-2 text-black/40" role="status">
              <RefreshCw size={24} className="animate-spin text-[#0066cc]" />
              <p className="text-sm">Controllo dei servizi in corso…</p>
            </div>
          ) : problems.length === 0 ? (
            <div className="flex min-h-[132px] flex-col items-center justify-center gap-2 text-black/35">
              <CheckCircle2 size={28} className="text-green-600/70" />
              <p className="text-sm">Tutto regolare.</p>
            </div>
          ) : (
            problems.map((p) => (
              <div key={p.id} className={cn('flex items-center gap-3 rounded-[12px] px-3 py-2.5', p.severity === 'danger' ? 'bg-red-500/10' : 'bg-orange-500/10')}>
                <AlertTriangle size={16} className={p.severity === 'danger' ? 'shrink-0 text-red-600' : 'shrink-0 text-orange-600'} />
                <p className="min-w-0 flex-1 text-sm text-[#1d1d1f]">{p.text}</p>
                {p.action && (
                  <button type="button" onClick={p.action} className="min-h-[44px] shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black/60 active:scale-95">
                    {p.actionLabel}
                  </button>
                )}
              </div>
            ))
          )}
        </GlassCard>

        <div className="flex flex-col gap-4">
          <GlassCard className="space-y-2">
            <h2 className="text-sm font-semibold text-[#1d1d1f]">Attività</h2>
            <InfoRow label="Entità live" value={String(Object.keys(entities).length)} />
            <InfoRow label="Ultimo salvataggio config" value={home?.updatedAt ? `${new Date(home.updatedAt).toLocaleString('it-IT')} · da ${home.updatedBy ?? '—'}` : '—'} />
            <InfoRow label="Eventi stream" value={status ? `${status.stream.lastEventId}${status.stream.lastEventAt ? ` · ultimo ${new Date(status.stream.lastEventAt).toLocaleTimeString('it-IT')}` : ''}` : '—'} />
            <InfoRow
              label="Integrazioni"
              value={status ? ['Gemini', 'OpenWeather'].filter((_, i) => [status.integrations.gemini, status.integrations.openweather][i]).join(' · ') || 'nessuna integrazione opzionale' : '—'}
              Icon={KeyRound}
            />
          </GlassCard>
          <BackupCard readOnly={config?.storage?.writable === false} />
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'neutral', Icon }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn'; Icon: React.ElementType }) {
  return (
    <div className={cn(
      'rounded-[14px] border px-4 py-3',
      tone === 'ok' ? 'border-green-500/15 bg-green-500/10' : tone === 'warn' ? 'border-orange-500/15 bg-orange-500/10' : 'border-black/8 bg-black/[0.035]',
    )}>
      <div className="flex items-center gap-1.5 text-black/35">
        <Icon size={13} />
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">{label}</p>
      </div>
      <p className="mt-1 truncate text-2xl font-semibold text-[#1d1d1f] tabular-nums">{value}</p>
    </div>
  )
}

function InfoRow({ label, value, Icon }: { label: string; value: string; Icon?: React.ElementType }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-black/45">{Icon && <Icon size={13} />}{label}</span>
      <span className="truncate text-xs font-semibold text-black/70">{value}</span>
    </div>
  )
}

function storageModeLabel(mode: 'file' | 'read-only') {
  if (mode === 'file') return 'Locale'
  return 'Locale in sola lettura'
}

function BackupCard({ readOnly }: { readOnly: boolean }) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const exportBackup = async () => {
    setBusy('export')
    setMessage(null)
    try {
      const data = await configApi.exportBackup()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `myhome-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage({ ok: true, text: 'Backup scaricato.' })
    } catch {
      setMessage({ ok: false, text: 'Export non riuscito.' })
    } finally {
      setBusy(null)
    }
  }

  const importBackup = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ ok: false, text: 'Il file supera il limite di 10 MB.' })
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    const confirmed = window.confirm('Ripristinare questo backup? La configurazione corrente verrà sostituita; le credenziali locali resteranno invariate. L’operazione non può essere annullata.')
    if (!confirmed) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBusy('import')
    setMessage(null)
    try {
      const parsed = JSON.parse(await file.text())
      await configApi.importBackup(parsed)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['config'] }),
        queryClient.invalidateQueries({ queryKey: ['system-status'] }),
      ])
      setMessage({ ok: true, text: 'Configurazione ripristinata; credenziali locali invariate.' })
    } catch {
      setMessage({ ok: false, text: 'Ripristino non riuscito: file non valido o storage in sola lettura.' })
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <GlassCard className="space-y-2.5">
      <div>
        <h2 className="text-sm font-semibold text-[#1d1d1f]">Backup & ripristino</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-black/40">Esporta configurazione, stanze e funzioni in JSON. Token Home Assistant e credenziali di accesso sono sempre esclusi.</p>
      </div>
      {readOnly && <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="status">Storage in sola lettura: puoi esportare, ma non ripristinare un backup.</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportBackup}
          disabled={busy !== null}
          className="flex min-h-[44px] items-center gap-2 rounded-full bg-black/[0.07] px-4 text-sm font-semibold text-black/60 transition hover:bg-black/10 active:scale-95 disabled:opacity-45"
        >
          <Download size={15} /> {busy === 'export' ? 'Esportazione…' : 'Esporta'}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={readOnly || busy !== null}
          className="flex min-h-[44px] items-center gap-2 rounded-full bg-black/[0.07] px-4 text-sm font-semibold text-black/60 transition hover:bg-black/10 active:scale-95 disabled:opacity-45"
        >
          <Upload size={15} /> {busy === 'import' ? 'Ripristino…' : 'Importa'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="Seleziona un backup MyHome da ripristinare"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f) }}
        />
      </div>
      {message && (
        <p className={cn('text-xs font-medium', message.ok ? 'text-green-700' : 'text-red-600')} role={message.ok ? 'status' : 'alert'} aria-live="polite">{message.text}</p>
      )}
    </GlassCard>
  )
}
