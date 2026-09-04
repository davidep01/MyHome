import { useId, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, History, MonitorSmartphone, Save, Server, ShieldCheck } from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { ServiceHealthCard } from '../components/system/ServiceHealthCard'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import { alarmApi, kioskApi, systemApi, type HomeRevisionMeta, type KioskDeviceStatus } from '../api/backend'
import { commandNeedsFully, commandResultLabel, fleetReadiness } from '../lib/kioskCommands'
import { summaryLabel } from '../lib/homeRevisions'
import { timeAgo } from '../lib/time'
import { cn } from '../lib/utils'

/**
 * Regia — Sistema: il servizio, non la casa. Connessione a HA, salute nel
 * tempo (uptime, cadute del ponte, errori, aggiornamenti), tablet a muro e
 * log delle azioni critiche. "Cosa non va in casa" vive in Stato: qui non si
 * duplica nulla di quella vista.
 */
export function SystemPage() {
  const { data: status } = useQuery({ queryKey: ['system-status'], queryFn: systemApi.status, refetchInterval: 15_000 })

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">Sistema</h1>
        <p className="mt-1 text-sm text-black/45">Connessione, salute del servizio e tablet dell’installazione locale</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ConnectionCard />
        <ServiceHealthCard status={status} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <KioskFleetCard />
        <AuditCard />
      </div>

      <HomeVersionsCard />
    </div>
  )
}

/**
 * Cronologia versioni della home (§4.4): ogni salvataggio del layout (tablet o
 * regia) crea una revisione. Il ripristino non sovrascrive la cronologia — crea
 * una nuova revisione che punta a quella scelta, quindi è a sua volta annullabile.
 */
function HomeVersionsCard() {
  const queryClient = useQueryClient()
  const revisions = useQuery({ queryKey: ['system-home-revisions'], queryFn: systemApi.homeRevisions, refetchInterval: 30_000 })
  const [restoring, setRestoring] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const entries = revisions.data?.entries ?? []

  const restore = (version: number) => {
    if (!window.confirm(`Ripristinare la disposizione della home alla versione ${version}? Verrà creata una nuova versione: quella attuale resta nello storico.`)) return
    setRestoring(version)
    setMessage(null)
    systemApi.restoreHomeRevision(version)
      .then(async () => {
        setMessage('Disposizione ripristinata.')
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['system-home-revisions'] }),
          queryClient.invalidateQueries({ queryKey: ['config'] }),
          queryClient.invalidateQueries({ queryKey: ['layout'] }),
        ])
      })
      .catch(() => setMessage('Ripristino non riuscito. Riprova.'))
      .finally(() => setRestoring(null))
  }

  return (
    <GlassCard className="space-y-2">
      <div className="flex items-center gap-2">
        <History size={16} className="text-black/45" />
        <h2 className="flex-1 text-sm font-semibold text-[#1d1d1f]">Versioni della home</h2>
      </div>
      {entries.length === 0
        ? <p className="py-3 text-center text-sm text-black/40">Nessuna modifica registrata dall’avvio del servizio.</p>
        : entries.slice(0, 10).map((entry, index) => (
          <HomeVersionRow
            key={`${entry.version}-${entry.createdAt}`}
            entry={entry}
            current={index === 0}
            restoring={restoring === entry.version}
            disabled={restoring !== null}
            onRestore={() => restore(entry.version)}
          />
        ))}
      {message && <p className="text-xs font-semibold text-black/50" role="status" aria-live="polite">{message}</p>}
    </GlassCard>
  )
}

function HomeVersionRow({
  entry, current, restoring, disabled, onRestore,
}: {
  entry: HomeRevisionMeta
  current: boolean
  restoring: boolean
  disabled: boolean
  onRestore: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-black/[0.04] px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[#1d1d1f]">
          v{entry.version} · {summaryLabel(entry.summary)}
          {entry.source === 'rollback' && <span className="text-black/45"> · ripristino da v{entry.restoredFromVersion}</span>}
        </p>
        <p className="text-[11px] text-black/40">
          {entry.createdBy === 'tablet' ? 'Tablet' : entry.createdBy === 'desktop' ? 'Regia' : 'Sistema'} · {timeAgo(entry.createdAt)}
        </p>
      </div>
      {!current && (
        <button
          type="button"
          onClick={onRestore}
          disabled={disabled}
          className="tap-target shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-black/60 transition active:scale-95 disabled:opacity-40"
        >
          {restoring ? 'Ripristino…' : 'Ripristina'}
        </button>
      )}
    </div>
  )
}

/**
 * Flotta kiosk (§4.5/§12): stato dei tablet (heartbeat 60s) e comandi remoti
 * via lo stream SSE. Le azioni dirompenti (spegni schermo, riavvia) chiedono
 * conferma; il TTS chiede il testo.
 */
function KioskFleetCard() {
  const queryClient = useQueryClient()
  const { data, isPending, isError } = useQuery({ queryKey: ['kiosk-devices'], queryFn: kioskApi.devices, refetchInterval: 30_000 })
  const [message, setMessage] = useState<string | null>(null)
  const devices = data?.devices ?? []

  /**
   * Inviare è un broadcast SSE: il server sa di aver trasmesso, non che il
   * tablet abbia eseguito. Si attende quindi il riscontro del tablet e si
   * mostra quello, invece di dichiarare un successo che non è stato verificato.
   */
  const send = (target: string, command: string, value?: number | string) => {
    setMessage('Invio in corso…')
    kioskApi.command(target, command, value)
      .then(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1200))
        const fresh = await queryClient.fetchQuery({ queryKey: ['kiosk-devices'], queryFn: kioskApi.devices })
        const device = fresh.devices.find((item) => item.deviceId === target)
        const result = device?.lastCommand
        if (result && result.command === command) setMessage(commandResultLabel(result))
        else setMessage('Comando trasmesso, ma il tablet non ha ancora risposto.')
      })
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
                <FleetActions device={d} onSend={send} />
              </div>
            ))}
      {message && <p className="text-xs font-semibold text-black/50" role="status" aria-live="polite">{message}</p>}
    </GlassCard>
  )
}

/**
 * Le azioni che richiedono Fully Kiosk restano disabilitate quando il tablet
 * non lo espone: prima erano premibili e la regia dichiarava "Comando inviato"
 * mentre sul tablet non poteva succedere nulla — solo Ricarica e Prova audio,
 * che vivono nel browser, funzionavano davvero.
 */
function FleetActions({
  device, onSend,
}: {
  device: KioskDeviceStatus
  onSend: (target: string, command: string, value?: number | string) => void
}) {
  const readiness = fleetReadiness(device)
  const blocked = !readiness.canRunAll
  const disabledFor = (command: string) => blocked && commandNeedsFully(command)

  return (
    <div className="space-y-2">
      {blocked && (
        <div className="flex items-start gap-2 rounded-[10px] bg-orange-500/10 px-3 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-orange-600" />
          <p className="text-[11px] leading-relaxed text-orange-700">
            {readiness.canRunAll === false && readiness.reason}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <FleetButton label="Ricarica" onClick={() => onSend(device.deviceId, 'reload')} />
        <FleetButton
          label={device.screenOn === false ? 'Accendi schermo' : 'Spegni schermo'}
          disabled={disabledFor('screenOff')}
          onClick={() => {
            if (device.screenOn === false) onSend(device.deviceId, 'screenOn')
            else if (window.confirm('Spegnere lo schermo del tablet?')) onSend(device.deviceId, 'screenOff')
          }}
        />
        <FleetButton
          label="Annuncio"
          disabled={disabledFor('say')}
          onClick={() => {
            const text = window.prompt('Testo da pronunciare sul tablet:')
            if (text?.trim()) onSend(device.deviceId, 'say', text.trim().slice(0, 200))
          }}
        />
        <FleetButton
          label="Screensaver"
          disabled={disabledFor('screensaverStart')}
          onClick={() => onSend(device.deviceId, device.screensaver ? 'screensaverStop' : 'screensaverStart')}
        />
        <FleetButton label="Prova audio" onClick={() => onSend(device.deviceId, 'audioTest')} />
        <FleetButton
          label="Riavvia"
          danger
          disabled={disabledFor('restart')}
          onClick={() => {
            if (window.confirm('Riavviare l’app del tablet? Il kiosk ricomparirà da solo.')) onSend(device.deviceId, 'restart')
          }}
        />
      </div>
    </div>
  )
}

function FleetButton({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Richiede l’interfaccia JavaScript di Fully Kiosk' : undefined}
      className={cn(
        'min-h-[44px] rounded-full px-3.5 text-xs font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
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

function configSourceLabel(source: 'env' | 'db' | 'default' | 'missing' | 'invalid') {
  if (source === 'env') return 'Variabile d’ambiente'
  if (source === 'db') return 'Configurazione locale'
  if (source === 'default') return 'Predefinita'
  if (source === 'invalid') return 'Non valida'
  return 'Non configurato'
}

