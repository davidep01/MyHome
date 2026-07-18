import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Database, MonitorSmartphone, RefreshCw, Save, Server, ShieldCheck, Wrench } from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import { useEntityStore } from '../store/entities'
import { haRegistry } from '../api/ha-registry'
import { alarmApi, kioskApi, systemApi } from '../api/backend'
import { stateLabel } from '../components/widgets/utils/stateLabel'
import { timeAgo } from '../lib/time'
import { cn } from '../lib/utils'

/**
 * Regia — Sistema: connessione HA, storage, versione e la diagnostica VERA
 * (entity_category dal registry, non keyword-grep sui nomi).
 */
export function SystemPage() {
  const { data: status, isPending: statusPending, isError: statusError, refetch, isFetching } = useQuery({ queryKey: ['system-status'], queryFn: systemApi.status, refetchInterval: 15_000 })
  const entities = useEntityStore((s) => s.entities)
  const connected = useEntityStore((s) => s.connectionStatus === 'connected')

  const { data: registry, isPending: registryPending, isError: registryError } = useQuery({
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
        <p className="mt-1 text-sm text-black/45">Connessione e diagnostica dell’installazione locale nella rete LAN</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ConnectionCard />

        <GlassCard className="space-y-2">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-black/45" />
            <h2 className="text-sm font-semibold text-[#1d1d1f]">Storage & versione</h2>
          </div>
          {statusPending && !status ? (
            <p className="py-6 text-center text-sm text-black/40" role="status">Lettura dello stato locale…</p>
          ) : statusError && !status ? (
            <div className="space-y-2 rounded-[10px] bg-red-500/10 px-3 py-3" role="alert">
              <p className="text-sm text-red-700">Stato del servizio MyHome non disponibile.</p>
              <button type="button" onClick={() => refetch()} className="min-h-[44px] rounded-full bg-white px-4 text-xs font-semibold text-red-700">Riprova</button>
            </div>
          ) : (
            <>
              {statusError && (
                <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="alert">Aggiornamento non riuscito: sono mostrati gli ultimi dati disponibili.</p>
              )}
              <Row label="Persistenza" value={status ? `${storageModeLabel(status.storage.mode)}${status.storage.writable ? '' : ' — sola lettura'}` : '—'} />
              <Row label="Bridge dati" value={status ? `${status.stream.mode === 'ws' ? 'WebSocket push' : status.stream.mode === 'poll' ? `poll ${status.stream.pollMs} ms` : 'inattivo'} · WS ${status.stream.wsState}` : '—'} />
              <Row label="Client LAN connessi" value={String(status?.stream.subscribers ?? 0)} />
              <Row label="Versione app" value={`v${__APP_VERSION__}`} />
              <Row label="Integrazioni opzionali" value={status ? [status.integrations.gemini && 'Gemini', status.integrations.openweather && 'OpenWeather'].filter(Boolean).join(' · ') || 'nessuna' : '—'} />
              <button type="button" onClick={() => refetch()} disabled={isFetching} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-black/[0.05] text-xs font-semibold text-black/55">
                <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} /> {isFetching ? 'Aggiornamento…' : 'Aggiorna stato'}
              </button>
            </>
          )}
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <KioskFleetCard />
        <AuditCard />
      </div>

      <Section title="Entità non disponibili" count={unavailable.length} emptyText="Tutte le entità rispondono.">
        {unavailable.slice(0, 36).map((e) => (
          <DiagRow key={e.entity_id} id={e.entity_id} name={(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} state={stateLabel(e.state)} updated={e.last_updated} warning />
        ))}
      </Section>

      <Section
        title="Diagnostica (dal registro HA)"
        count={diagnostics.length}
        emptyText={registryError ? 'Registro Home Assistant non disponibile.' : connected && registryPending ? 'Lettura del registro Home Assistant…' : connected ? 'Nessun sensore diagnostico esposto.' : 'In attesa della connessione…'}
        error={registryError}
        loading={connected && registryPending}
      >
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

/**
 * Flotta kiosk (§4.5/§12): stato dei tablet (heartbeat 60s) e comandi remoti
 * via lo stream SSE. Le azioni dirompenti (spegni schermo, riavvia) chiedono
 * conferma; il TTS chiede il testo.
 */
function KioskFleetCard() {
  const { data, isPending, isError } = useQuery({ queryKey: ['kiosk-devices'], queryFn: kioskApi.devices, refetchInterval: 30_000 })
  const [message, setMessage] = useState<string | null>(null)
  const devices = data?.devices ?? []

  const send = (target: string, command: string, value?: number | string) => {
    setMessage(null)
    kioskApi.command(target, command, value)
      .then(() => setMessage('Comando inviato al tablet.'))
      .catch(() => setMessage('Comando non inviato. Riprova.'))
  }

  return (
    <GlassCard className="space-y-2">
      <div className="flex items-center gap-2">
        <MonitorSmartphone size={16} className="text-black/45" />
        <h2 className="flex-1 text-sm font-semibold text-[#1d1d1f]">Tablet a muro</h2>
        <span className="rounded-full bg-black/[0.06] px-2.5 py-1 text-[11px] font-semibold text-black/45">{devices.filter((d) => d.online).length} online</span>
      </div>
      {isPending ? <p className="py-4 text-center text-sm text-black/40" role="status">Ricerca dei tablet…</p>
        : isError ? <p className="rounded-[10px] bg-red-500/10 px-3 py-2 text-sm text-red-700" role="alert">Elenco tablet non disponibile.</p>
          : devices.length === 0 ? <p className="py-4 text-center text-sm text-black/40">Nessun tablet ancora registrato: il kiosk si presenta da solo entro un minuto dall’apertura.</p>
            : devices.map((d) => (
              <div key={d.deviceId} className="space-y-2 rounded-[12px] bg-black/[0.04] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', d.online ? 'bg-green-500' : 'bg-black/25')} aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1d1d1f]">{d.name ?? d.deviceId}</p>
                  <p className="shrink-0 text-[11px] text-black/40">{d.online ? 'Online' : `Visto ${timeAgo(d.lastSeenAt)}`}</p>
                </div>
                <p className="text-[11px] text-black/45">
                  {[
                    d.battery !== undefined && `Batteria ${d.battery}%${d.charging ? ' ⚡︎' : ''}`,
                    d.screenOn !== undefined && `Schermo ${d.screenOn ? 'acceso' : 'spento'}`,
                    d.brightness !== undefined && `Luminosità ${Math.round((d.brightness / 255) * 100)}%`,
                    d.screensaver && 'Screensaver attivo',
                    d.memoryMb !== undefined && `${d.memoryMb} MB usati`,
                    d.fully === 'available' ? `Fully ${d.nativeAudio ? 'audio nativo' : 'senza player audio'}` : d.fully && `Fully ${d.fully === 'blocked' ? 'bloccato' : 'non disponibile'}`,
                    d.audioChannel && `Canale allarme ${d.audioChannel === 'ready' ? 'pronto' : d.audioChannel === 'needs-interaction' ? 'da attivare sul tablet' : d.audioChannel}`,
                  ].filter(Boolean).join(' · ') || 'Nessun dato dal dispositivo'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <FleetButton label="Ricarica" onClick={() => send(d.deviceId, 'reload')} />
                  <FleetButton label={d.screenOn === false ? 'Accendi schermo' : 'Spegni schermo'} onClick={() => {
                    if (d.screenOn === false) send(d.deviceId, 'screenOn')
                    else if (window.confirm('Spegnere lo schermo del tablet?')) send(d.deviceId, 'screenOff')
                  }} />
                  <FleetButton label="Annuncio" onClick={() => {
                    const text = window.prompt('Testo da pronunciare sul tablet:')
                    if (text?.trim()) send(d.deviceId, 'say', text.trim().slice(0, 200))
                  }} />
                  <FleetButton label="Screensaver" onClick={() => send(d.deviceId, d.screensaver ? 'screensaverStop' : 'screensaverStart')} />
                  <FleetButton label="Prova audio" onClick={() => send(d.deviceId, 'audioTest')} />
                  <FleetButton label="Riavvia" danger onClick={() => {
                    if (window.confirm('Riavviare l’app del tablet? Il kiosk ricomparirà da solo.')) send(d.deviceId, 'restart')
                  }} />
                </div>
              </div>
            ))}
      {message && <p className="text-xs font-semibold text-black/50" role="status" aria-live="polite">{message}</p>}
    </GlassCard>
  )
}

function FleetButton({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[44px] rounded-full px-3.5 text-xs font-semibold transition active:scale-95',
        danger ? 'bg-red-500/10 text-red-600' : 'bg-white/80 text-black/60',
      )}
    >
      {label}
    </button>
  )
}

/** Log azioni critiche (§3) + foto di emergenza (§11), solo per l'admin. */
function AuditCard() {
  const audit = useQuery({ queryKey: ['system-audit'], queryFn: systemApi.audit, refetchInterval: 30_000 })
  const photos = useQuery({ queryKey: ['alarm-photos'], queryFn: alarmApi.listPhotos, staleTime: 60_000 })
  const entries = audit.data?.entries ?? []

  return (
    <GlassCard className="space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} className="text-black/45" />
        <h2 className="flex-1 text-sm font-semibold text-[#1d1d1f]">Azioni critiche & emergenze</h2>
      </div>
      {entries.length === 0
        ? <p className="py-3 text-center text-sm text-black/40">Nessuna apertura o disarmo registrato dall’avvio del servizio.</p>
        : entries.slice(0, 12).map((entry, index) => (
          <div key={`${entry.at}-${index}`} className="flex items-center gap-2 rounded-[10px] bg-black/[0.04] px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-sm text-[#1d1d1f]">
              {auditActionLabel(entry.domain, entry.service)} · <span className="text-black/50">{entry.entityIds.join(', ')}</span>
            </p>
            <p className="shrink-0 text-[11px] text-black/40">{entry.role === 'kiosk' ? 'Tablet' : 'Regia'} · {timeAgo(entry.at)}</p>
          </div>
        ))}
      {(photos.data?.photos.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-black/50">Foto di emergenza ({photos.data!.photos.length})</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.data!.photos.slice(0, 12).map((photo) => (
              <a key={photo.name} href={photo.url} target="_blank" rel="noreferrer" className="shrink-0" aria-label={`Foto di emergenza del ${new Date(photo.takenAt).toLocaleString('it-IT')}`}>
                <img src={photo.url} alt="" className="h-20 w-28 rounded-[10px] object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  )
}

const AUDIT_LABEL: Record<string, string> = {
  'lock.unlock': 'Serratura aperta',
  'lock.open': 'Porta aperta',
  'cover.open_cover': 'Apertura',
  'valve.open_valve': 'Valvola aperta',
  'alarm_control_panel.alarm_disarm': 'Allarme disarmato',
  'siren.turn_on': 'Sirena attivata',
  'siren.turn_off': 'Sirena spenta',
  'homeassistant.turn_off': 'Spegnimento generale',
}

function auditActionLabel(domain: string, service: string): string {
  return AUDIT_LABEL[`${domain}.${service}`] ?? `${domain} · ${service}`
}

function ConnectionCard() {
  const { data: config, isPending: configPending, isError: configError, error: configQueryError } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const [haUrl, setHaUrl] = useState<string | null>(null)
  const [haToken, setHaToken] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const id = useId()

  if (configPending && !config) return <GlassCard><p className="py-6 text-center text-sm text-black/40" role="status">Caricamento della connessione…</p></GlassCard>
  if (configError && !config) {
    return <GlassCard><p className="rounded-[10px] bg-red-500/10 px-3 py-3 text-sm text-red-700" role="alert">{configQueryError instanceof Error ? configQueryError.message : 'Configurazione non disponibile.'}</p></GlassCard>
  }
  if (!config) return null

  const urlLocked = Boolean(config.haConfigLocked?.haUrl)
  const tokenLocked = Boolean(config.haConfigLocked?.haToken)
  const url = haUrl ?? config.haUrl
  const readOnly = config.storage?.writable === false
  const dirty = (!urlLocked && haUrl !== null && haUrl.trim() !== config.haUrl) || (!tokenLocked && Boolean(haToken))

  const save = () => {
    setMessage(null)
    let parsed: URL
    try {
      parsed = new URL(url.trim())
    } catch {
      setMessage({ ok: false, text: 'Inserisci un URL completo, per esempio http://homeassistant.local:8123.' })
      return
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      setMessage({ ok: false, text: 'L’URL deve usare http:// o https://.' })
      return
    }
    update({ haUrl: url.trim(), ...(haToken ? { haToken } : {}) }, {
      onSuccess: () => {
        setHaUrl(null)
        setHaToken('')
        setMessage({ ok: true, text: 'Connessione salvata. La verifica può richiedere qualche secondo.' })
      },
      onError: () => setMessage({ ok: false, text: 'Connessione non salvata. Verifica lo storage e riprova.' }),
    })
  }

  return (
    <GlassCard className="space-y-3">
      <div className="flex items-center gap-2">
        <Server size={16} className="text-black/45" />
        <h2 className="text-sm font-semibold text-[#1d1d1f]">Connessione Home Assistant</h2>
      </div>
      {(urlLocked || tokenLocked) && (
        <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700">
          Credenziali impostate da variabili d'ambiente: non modificabili da qui.
        </p>
      )}
      {configError && (
        <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="alert">Sincronizzazione interrotta: sono mostrati gli ultimi dati disponibili.</p>
      )}
      {readOnly && (
        <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="status">Storage in sola lettura: la connessione non può essere modificata.</p>
      )}
      <div className="space-y-1.5">
        <label htmlFor={`${id}-ha-url`} className="text-xs font-semibold text-black/50">URL nella rete LAN</label>
        <input
          id={`${id}-ha-url`}
          type="url"
          value={url}
          onChange={(e) => { setMessage(null); setHaUrl(e.target.value) }}
          disabled={readOnly || urlLocked}
          placeholder="http://homeassistant.local:8123"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none transition-colors focus:bg-black/12 disabled:opacity-45 min-h-[44px]"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-ha-token`} className="text-xs font-semibold text-black/50">Token di lunga durata (vuoto = non modificare)</label>
        <input
          id={`${id}-ha-token`}
          type="password"
          value={haToken}
          onChange={(e) => { setMessage(null); setHaToken(e.target.value) }}
          disabled={readOnly || tokenLocked}
          autoComplete="new-password"
          spellCheck={false}
          placeholder="••••••••••••"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none transition-colors focus:bg-black/12 disabled:opacity-45 min-h-[44px]"
        />
      </div>
      <p className="text-[11px] leading-relaxed text-black/40">Il token resta nel servizio locale MyHome e non viene incluso nei backup esportati.</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-[10px] bg-black/[0.05] px-2 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-black/30">Origine URL</p>
          <p className="mt-0.5 text-xs font-semibold text-black/65">{configSourceLabel(config.haConfigSource?.url ?? 'db')}</p>
        </div>
        <div className="rounded-[10px] bg-black/[0.05] px-2 py-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-black/30">Origine token</p>
          <p className="mt-0.5 text-xs font-semibold text-black/65">{configSourceLabel(config.haConfigSource?.token ?? 'missing')}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={readOnly || isPending || (urlLocked && tokenLocked) || !dirty}
        className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0052a3] disabled:opacity-50"
      >
        <Save size={14} /> {isPending ? 'Salvataggio…' : 'Salva connessione'}
      </button>
      {message && (
        <p className={cn('text-xs font-semibold', message.ok ? 'text-green-700' : 'text-red-600')} role={message.ok ? 'status' : 'alert'} aria-live="polite">{message.text}</p>
      )}
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

function Section({ title, count, emptyText, children, loading = false, error = false }: { title: string; count: number; emptyText: string; children: React.ReactNode; loading?: boolean; error?: boolean }) {
  return (
    <GlassCard className="space-y-2">
      <div className="flex items-center gap-2">
        <Wrench size={15} className="text-black/40" />
        <h2 className="text-sm font-semibold text-[#1d1d1f]">{title}</h2>
        <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-xs font-semibold tabular-nums text-black/45">{count}</span>
      </div>
      {count === 0
        ? <p className={cn('py-4 text-center text-sm', error ? 'text-red-600' : 'text-black/35')} role={error ? 'alert' : loading ? 'status' : undefined}>{emptyText}</p>
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

function configSourceLabel(source: 'env' | 'db' | 'default' | 'missing' | 'invalid') {
  if (source === 'env') return 'Variabile d’ambiente'
  if (source === 'db') return 'Configurazione locale'
  if (source === 'default') return 'Predefinita'
  if (source === 'invalid') return 'Non valida'
  return 'Non configurato'
}

function storageModeLabel(mode: 'file' | 'read-only') {
  if (mode === 'file') return 'File locale'
  return 'Locale in sola lettura'
}
