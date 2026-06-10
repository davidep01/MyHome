import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Database, Save, Server, Wrench } from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import { useEntityStore } from '../store/entities'
import { haRegistry } from '../api/ha-registry'
import { systemApi } from '../api/backend'
import { stateLabel } from '../components/widgets/utils/stateLabel'
import { timeAgo } from '../lib/time'
import { cn } from '../lib/utils'

/**
 * Regia — Sistema: connessione HA, storage, versione e la diagnostica VERA
 * (entity_category dal registry, non keyword-grep sui nomi).
 */
export function SystemPage() {
  const { data: status } = useQuery({ queryKey: ['system-status'], queryFn: systemApi.status, refetchInterval: 15_000 })
  const entities = useEntityStore((s) => s.entities)
  const connected = useEntityStore((s) => s.connectionStatus === 'connected')

  const { data: registry } = useQuery({
    queryKey: ['ha-registry-diagnostics'],
    enabled: connected,
    staleTime: 5 * 60 * 1000,
    queryFn: () => haRegistry.entities(),
  })

  const diagnostics = useMemo(() => {
    if (!registry) return []
    return registry
      .filter((r) => r.entity_category === 'diagnostic')
      .map((r) => entities[r.entity_id])
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
      .slice(0, 30)
  }, [registry, entities])

  const unavailable = useMemo(
    () => Object.values(entities)
      .filter((e) => e.state === 'unavailable')
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
    [entities],
  )

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">Sistema</h1>
        <p className="mt-1 text-sm text-black/45">Connessione, storage, diagnostica e manutenzione</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ConnectionCard />

        <GlassCard className="space-y-2">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-black/45" />
            <p className="text-sm font-semibold text-[#1d1d1f]">Storage & versione</p>
          </div>
          <Row label="Persistenza" value={status ? `${status.storage.mode}${status.storage.writable ? '' : ' — sola lettura'}` : '—'} />
          <Row label="Bridge dati" value={status ? `${status.stream.mode === 'ws' ? 'WebSocket push' : status.stream.mode === 'poll' ? `poll ${status.stream.pollMs}ms` : 'inattivo'} · WS ${status.stream.wsState}` : '—'} />
          <Row label="Client connessi" value={String(status?.stream.subscribers ?? 0)} />
          <Row label="Versione app" value={`v${__APP_VERSION__}`} />
          <Row label="Chiavi presenti" value={status ? [status.integrations.gemini && 'Gemini', status.integrations.openweather && 'OpenWeather', status.integrations.supabase && 'Supabase'].filter(Boolean).join(' · ') || 'nessuna' : '—'} />
        </GlassCard>
      </div>

      <Section title="Entità non disponibili" count={unavailable.length} emptyText="Tutte le entità rispondono.">
        {unavailable.slice(0, 36).map((e) => (
          <DiagRow key={e.entity_id} id={e.entity_id} name={(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} state={stateLabel(e.state)} updated={e.last_updated} warning />
        ))}
      </Section>

      <Section title="Diagnostica (dal registry HA)" count={diagnostics.length} emptyText={connected ? 'Nessun sensore diagnostico esposto.' : 'In attesa della connessione…'}>
        {diagnostics.map((e) => (
          <DiagRow
            key={e.entity_id}
            id={e.entity_id}
            name={(e.attributes?.friendly_name as string | undefined) ?? e.entity_id}
            state={`${e.state}${e.attributes?.unit_of_measurement ? ` ${e.attributes.unit_of_measurement}` : ''}`}
            updated={e.last_updated}
          />
        ))}
      </Section>
    </div>
  )
}

function ConnectionCard() {
  const { data: config } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const [haUrl, setHaUrl] = useState<string | null>(null)
  const [haToken, setHaToken] = useState('')

  if (!config) return <GlassCard><p className="text-sm text-black/40">Caricamento…</p></GlassCard>

  const urlLocked = Boolean(config.haConfigLocked?.haUrl)
  const tokenLocked = Boolean(config.haConfigLocked?.haToken)
  const url = haUrl ?? config.haUrl

  return (
    <GlassCard className="space-y-3">
      <div className="flex items-center gap-2">
        <Server size={16} className="text-black/45" />
        <p className="text-sm font-semibold text-[#1d1d1f]">Connessione Home Assistant</p>
      </div>
      {(urlLocked || tokenLocked) && (
        <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700">
          Credenziali impostate da variabili d'ambiente: non modificabili da qui.
        </p>
      )}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">URL</label>
        <input
          value={url}
          onChange={(e) => setHaUrl(e.target.value)}
          disabled={urlLocked}
          placeholder="http://homeassistant.local:8123"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none transition-colors focus:bg-black/12 disabled:opacity-45 min-h-[44px]"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Token (vuoto = non modificare)</label>
        <input
          type="password"
          value={haToken}
          onChange={(e) => setHaToken(e.target.value)}
          disabled={tokenLocked}
          placeholder="••••••••••••"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none transition-colors focus:bg-black/12 disabled:opacity-45 min-h-[44px]"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-[10px] bg-black/[0.05] px-2 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-black/30">Origine URL</p>
          <p className="mt-0.5 text-xs font-semibold text-black/65">{config.haConfigSource?.url ?? 'db'}</p>
        </div>
        <div className="rounded-[10px] bg-black/[0.05] px-2 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-black/30">Origine token</p>
          <p className="mt-0.5 text-xs font-semibold text-black/65">{config.haConfigSource?.token ?? 'missing'}</p>
        </div>
      </div>
      <button
        onClick={() => update({ haUrl: url, ...(haToken ? { haToken } : {}) })}
        disabled={isPending || (urlLocked && tokenLocked)}
        className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0052a3] disabled:opacity-50"
      >
        <Save size={14} /> {isPending ? 'Salvataggio…' : 'Salva connessione'}
      </button>
    </GlassCard>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2">
      <span className="text-xs text-black/45">{label}</span>
      <span className="truncate text-xs font-semibold text-black/70">{value}</span>
    </div>
  )
}

function Section({ title, count, emptyText, children }: { title: string; count: number; emptyText: string; children: React.ReactNode }) {
  return (
    <GlassCard className="space-y-2">
      <div className="flex items-center gap-2">
        <Wrench size={15} className="text-black/40" />
        <p className="text-sm font-semibold text-[#1d1d1f]">{title}</p>
        <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-xs font-semibold tabular-nums text-black/45">{count}</span>
      </div>
      {count === 0
        ? <p className="py-4 text-center text-sm text-black/35">{emptyText}</p>
        : <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">{children}</div>}
    </GlassCard>
  )
}

function DiagRow({ id, name, state, updated, warning }: { id: string; name: string; state: string; updated?: string; warning?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-[10px] px-3 py-2', warning ? 'bg-orange-500/8' : 'bg-black/[0.035]')}>
      {warning && <AlertTriangle size={14} className="shrink-0 text-orange-600" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[#1d1d1f]">{name}</p>
        <p className="truncate font-mono text-[10px] text-black/30">{id}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold text-black/65">{state}</p>
        <p className="text-[10px] text-black/30">{timeAgo(updated)}</p>
      </div>
    </div>
  )
}
