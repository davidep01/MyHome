import { useQuery } from '@tanstack/react-query'
import { ArrowUpCircle, CheckCircle2, CircleAlert, Heart, RefreshCw } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { systemApi, type SystemStatus } from '../../api/backend'
import { compareVersions, durationSince, timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'

const SCOPE_LABEL: Record<string, string> = {
  ha: 'Home Assistant',
  stream: 'Ponte dati',
  storage: 'Archivio',
  ai: 'Assistente',
  weather: 'Meteo',
}

/**
 * "Regge?" invece di "risponde adesso?": da quanto è acceso, quante volte il
 * ponte è caduto, cosa è fallito e se c'è una versione più recente.
 */
export function ServiceHealthCard({ status }: { status?: SystemStatus }) {
  const errors = useQuery({ queryKey: ['system-errors'], queryFn: systemApi.errors, refetchInterval: 30_000 })
  const update = useQuery({ queryKey: ['system-update'], queryFn: () => systemApi.update(), staleTime: 60 * 60 * 1000, retry: 1 })

  const entries = errors.data?.entries ?? []
  const health = status?.health
  const uptime = durationSince(health?.startedAt)
  const connectedFor = durationSince(health?.connectedSince)
  const installed = __APP_VERSION__
  const latest = update.data?.latest
  // 'dev' non è una versione confrontabile: in sviluppo non si annuncia nulla.
  const behind = Boolean(latest && installed !== 'dev' && compareVersions(latest, installed) > 0)

  return (
    <GlassCard className="space-y-2">
      <div className="flex items-center gap-2">
        <Heart size={16} className="text-black/45" />
        <h2 className="flex-1 text-sm font-semibold text-[#1d1d1f]">Salute del servizio</h2>
        {behind ? (
          <span className="flex items-center gap-1 rounded-full bg-[#0066cc]/12 px-2.5 py-1 text-[11px] font-semibold text-[#0066cc]">
            <ArrowUpCircle size={12} /> {latest} disponibile
          </span>
        ) : (
          <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[11px] font-semibold text-black/45">
            v{installed}
          </span>
        )}
      </div>

      <Row label="Servizio attivo da" value={uptime || '—'} />
      <Row
        label="Ponte dati"
        value={connectedFor ? `stabile da ${connectedFor}` : 'non connesso'}
        tone={connectedFor ? 'ok' : 'warn'}
      />
      <Row
        label="Cadute dall’avvio"
        value={health ? String(health.disconnections) : '—'}
        tone={health && health.disconnections > 0 ? 'warn' : 'neutral'}
      />
      <Row
        label="Archivio"
        value={status ? (status.storage.writable ? 'scrivibile' : 'sola lettura') : '—'}
        tone={status && !status.storage.writable ? 'warn' : 'neutral'}
      />
      {health?.lastDisconnectAt && (
        <Row label="Ultima caduta" value={`${timeAgo(health.lastDisconnectAt)}${health.lastDisconnectReason ? ` · ${health.lastDisconnectReason}` : ''}`} />
      )}
      {behind && (
        <p className="rounded-[10px] bg-[#0066cc]/10 px-3 py-2 text-xs leading-relaxed text-[#0066cc]">
          È pubblicata la versione {latest}: aggiorna l’add-on da Home Assistant → Impostazioni → Add-on.
        </p>
      )}
      {update.data?.error && (
        <p className="text-[11px] text-black/35">Controllo aggiornamenti non riuscito ({update.data.error}).</p>
      )}

      <div className="pt-1">
        <p className="mb-1.5 text-xs font-semibold text-black/50">Errori recenti</p>
        {errors.isPending ? (
          <p className="py-3 text-center text-sm text-black/40" role="status">
            <RefreshCw size={14} className="mr-1 inline animate-spin" /> Lettura…
          </p>
        ) : errors.isError ? (
          <p className="rounded-[10px] bg-red-500/10 px-3 py-2 text-xs text-red-700" role="alert">Registro errori non disponibile.</p>
        ) : entries.length === 0 ? (
          <div className="flex items-center gap-2 rounded-[10px] bg-black/[0.035] px-3 py-2.5 text-black/45">
            <CheckCircle2 size={15} className="shrink-0 text-green-600/70" />
            <p className="text-sm">Nessun errore dall’avvio del servizio.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {entries.slice(0, 8).map((entry, index) => (
              <div key={`${entry.at}-${index}`} className="flex items-start gap-2.5 rounded-[10px] bg-orange-500/8 px-3 py-2">
                <CircleAlert size={14} className="mt-0.5 shrink-0 text-orange-600" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-xs text-[#1d1d1f]">{entry.message}</p>
                  <p className="text-[10px] text-black/35">
                    {SCOPE_LABEL[entry.scope] ?? entry.scope} · {timeAgo(entry.at)}
                    {entry.count > 1 && ` · ${entry.count} volte`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  )
}

function Row({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2">
      <span className="text-xs text-black/45">{label}</span>
      <span className={cn(
        'truncate text-xs font-semibold',
        tone === 'ok' ? 'text-green-700' : tone === 'warn' ? 'text-orange-700' : 'text-black/70',
      )}>{value}</span>
    </div>
  )
}
