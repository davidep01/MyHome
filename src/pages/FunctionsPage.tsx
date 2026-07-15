import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, Cloud, Gauge, Images, LayoutGrid, MonitorSmartphone, Newspaper, Pencil, Plus, RefreshCw, Save, ScanFace, Siren, Sparkles, SunMoon, Trash2, Volume2, VolumeX,
} from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { GlassSheet } from '../components/glass/GlassSheet'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import { useSoundNotifications } from '../hooks/useSoundNotifications'
import { useThemeStore } from '../store/theme'
import { useEntityStore } from '../store/entities'
import { haApi, screensaverApi, systemApi, type DoorbellDevice, type KnownFace } from '../api/backend'
import { fileToFaceDataUrl } from '../lib/faceImage'
import { normalizeDoorbells } from '../lib/doorbell'
import { uid } from '../lib/uid'
import { canAddKnownFace, MAX_KNOWN_FACES } from '../lib/knownFaces'
import type { SoundPreset } from '../lib/sound/SoundManager'
import { ShortcutsEditor } from '../components/controls/ShortcutsEditor'
import { cn } from '../lib/utils'

/**
 * Regia — Funzioni: una card per feature distintiva, ognuna col suo STATO
 * (attiva / manca chiave / spenta), non solo i campi. Assorbe le sezioni
 * vive del vecchio SettingsPage: preferenze, tema/sensori, campanelli, suoni.
 */
export function FunctionsPage() {
  const { data: config, isPending: configPending, isError: configError, error: configQueryError } = useDashboardConfig()
  const { data: status, isPending: statusPending, isError: statusError } = useQuery({ queryKey: ['system-status'], queryFn: systemApi.status, staleTime: 30_000 })

  if (configPending && !config) return <div className="flex h-full items-center justify-center text-sm text-black/45" role="status">Caricamento delle funzioni…</div>
  if (configError && !config) {
    return <PageError error={configQueryError} fallback="Funzioni non disponibili. Controlla il servizio MyHome nella rete LAN." />
  }
  if (!config) return null

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">Funzioni</h1>
        <p className="mt-1 text-sm text-black/45">Funzioni e preferenze condivise dai dispositivi MyHome nella rete LAN</p>
      </div>
      {configError && (
        <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="alert">
          Sincronizzazione della configurazione interrotta: sono visibili gli ultimi dati disponibili.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PreferencesCard />
        <ThemeCard />
        <DoorbellsCard />
        <div className="flex flex-col gap-4">
          <SoundsCard />
          <KioskCard />
          <EmergencyCard />
          <IntegrationsCard gemini={status?.integrations.gemini} openweather={status?.integrations.openweather} pending={statusPending} error={statusError} />
        </div>
      </div>
    </div>
  )
}

function FeatureHeader({ Icon, title, badge, tone = 'neutral' }: { Icon: React.ElementType; title: string; badge?: string; tone?: 'ok' | 'warn' | 'neutral' }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-black/[0.06] text-black/55">
        <Icon size={17} />
      </div>
      <h2 className="flex-1 text-sm font-semibold text-[#1d1d1f]">{title}</h2>
      {badge && (
        <span className={cn(
          'rounded-full px-2.5 py-1 text-[11px] font-semibold',
          tone === 'ok' ? 'bg-green-500/12 text-green-700' : tone === 'warn' ? 'bg-orange-500/12 text-orange-700' : 'bg-black/[0.06] text-black/45',
        )}>
          {badge}
        </span>
      )}
    </div>
  )
}

// ── Preferenze (nome, dashboard, meteo, news) ────────────────────────────────

function PreferencesCard() {
  const { data: config } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const [form, setForm] = useState<{ userName: string; dashboardName: string; weatherCity: string; newsFeedUrl: string } | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const id = useId()

  if (!config) return null
  const value = form ?? {
    userName: config.userName,
    dashboardName: config.dashboardName,
    weatherCity: config.weatherCity,
    newsFeedUrl: config.newsFeedUrl,
  }

  const readOnly = config.storage?.writable === false
  const field = (key: keyof typeof value, label: string, placeholder?: string, type: 'text' | 'url' = 'text') => (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-${key}`} className="text-xs font-semibold text-black/50">{label}</label>
      <input
        id={`${id}-${key}`}
        type={type}
        value={value[key]}
        disabled={readOnly}
        onChange={(e) => { setMessage(null); setForm({ ...value, [key]: e.target.value }) }}
        placeholder={placeholder}
        className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none transition-colors focus:bg-black/12"
      />
    </div>
  )

  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={Pencil} title="Identità & sorgenti" />
      {readOnly && <ReadOnlyNotice />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field('userName', 'Il tuo nome', 'es. Davide')}
        {field('dashboardName', 'Nome dashboard', 'MyHome')}
      </div>
      {field('weatherCity', 'Città meteo', 'es. Milan,IT')}
      {field('newsFeedUrl', 'Feed RSS news', 'https://…/rss.xml', 'url')}
      <button
        type="button"
        onClick={() => {
          if (!form) return
          setMessage(null)
          update(form, {
            onSuccess: () => { setForm(null); setMessage({ ok: true, text: 'Preferenze salvate.' }) },
            onError: () => setMessage({ ok: false, text: 'Salvataggio non riuscito. Riprova.' }),
          })
        }}
        disabled={readOnly || isPending || !form}
        className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0052a3] disabled:opacity-40"
      >
        <Save size={14} /> {isPending ? 'Salvataggio…' : 'Salva'}
      </button>
      <SaveMessage message={message} />
    </GlassCard>
  )
}

// ── Tema & sensori tablet ────────────────────────────────────────────────────

const SENSOR_LABEL: Record<string, string> = {
  active: 'Attivo',
  unsupported: 'Non supportato',
  permission_denied: 'Permesso negato',
  error: 'Errore',
  disabled: 'Disattivato',
}

function ThemeCard() {
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)
  const sensorState = useThemeStore((s) => s.sensorState)
  const lastLux = useThemeStore((s) => s.lastLux)
  const source = useThemeStore((s) => s.source)

  const modes: { id: 'auto' | 'light' | 'dark'; label: string }[] = [
    { id: 'auto', label: 'Auto' }, { id: 'light', label: 'Giorno' }, { id: 'dark', label: 'Notte' },
  ]

  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={SunMoon} title="Luminosità kiosk" badge={themeMode === 'auto' ? 'Segue la luce' : themeMode === 'dark' ? 'Notte' : 'Giorno'} tone={themeMode === 'auto' ? 'ok' : 'neutral'} />
      <div className="flex gap-2" role="group" aria-label="Tema dell’interfaccia">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setThemeMode(m.id)}
            aria-pressed={themeMode === m.id}
            className={cn('min-h-[44px] flex-1 rounded-[12px] text-sm font-semibold transition', themeMode === m.id ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60')}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-black/40">
        In Auto il tablet attenua l’intera interfaccia sotto 20 lux e torna alla luminosità diurna sopra 45 lux; su desktop segue il sistema.
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Sensore', SENSOR_LABEL[sensorState] ?? sensorState], ['Lux', String(lastLux ?? '—')], ['Origine', source]].map(([label, value]) => (
          <div key={label} className="rounded-[10px] bg-black/[0.05] px-2 py-2">
            <p className="text-[10px] uppercase tracking-wide text-black/35">{label}</p>
            <p className="mt-0.5 text-xs font-semibold text-black/70 tabular-nums">{value}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

// ── Campanelli ───────────────────────────────────────────────────────────────

function DoorbellsCard() {
  const { data: config } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const entities = useEntityStore((s) => s.entities)
  const { play } = useSoundNotifications()
  const [draft, setDraft] = useState<DoorbellDevice | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const id = useId()

  const doorbells = useMemo(
    () => config?.doorbells ?? (config ? normalizeDoorbells(config) : []),
    [config],
  )
  const activeDoorbells = doorbells.filter((doorbell) => doorbell.active !== false).length

  const readOnly = config?.storage?.writable === false

  const persist = (next: DoorbellDevice[], successText: string, onSuccess?: () => void) => {
    setMessage(null)
    update({ doorbells: next }, {
      onSuccess: () => { setMessage({ ok: true, text: successText }); onSuccess?.() },
      onError: () => setMessage({ ok: false, text: 'Operazione non riuscita. Riprova.' }),
    })
  }

  const saveDraft = () => {
    if (!draft || !draft.name.trim() || !draft.entityId) return
    const next = doorbells.some((d) => d.id === draft.id) ? doorbells.map((d) => (d.id === draft.id ? draft : d)) : [...doorbells, draft]
    persist(next, 'Campanello salvato.', () => setDraft(null))
  }

  const doorbellOptions = useMemo(
    () => Object.values(entities).filter((e) => e.entity_id.startsWith('event.') || e.entity_id.startsWith('binary_sensor.')),
    [entities],
  )
  const cameraOptions = useMemo(
    () => Object.values(entities).filter((e) => e.entity_id.startsWith('camera.')),
    [entities],
  )
  const lockOptions = useMemo(
    () => Object.values(entities).filter((e) => e.entity_id.startsWith('lock.')),
    [entities],
  )

  return (
    <GlassCard className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <FeatureHeader Icon={Bell} title="Campanelli" badge={doorbells.length ? `${activeDoorbells} attivi` : 'Nessuno'} tone={activeDoorbells ? 'ok' : 'neutral'} />
        <button
          type="button"
          onClick={() => setDraft({ id: uid('db'), name: '', entityId: '', sound: 'dingdong', volume: 1, priority: 'high', active: true })}
          disabled={readOnly}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-[#0066cc] px-3 text-xs font-semibold text-white active:scale-95"
        >
          <Plus size={13} /> Nuovo
        </button>
      </div>
      {readOnly && <ReadOnlyNotice />}
      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm text-[#1d1d1f]">Riconoscimento AI (Gemini Vision)</p>
          <p className="text-[11px] text-black/40">Opt-in: a una suonata reale invia snapshot e foto di riferimento a Google Gemini. Le prove non inviano immagini.</p>
        </div>
        <button
          type="button"
          className={cn('lg-toggle shrink-0', (config?.ai?.doorbellVision === true) && 'on')}
          disabled={readOnly || isPending}
          onClick={() => {
            setMessage(null)
            const enabling = config?.ai?.doorbellVision !== true
            if (enabling && !window.confirm('Attivando Gemini Vision, a ogni suonata reale lo snapshot della porta e le foto dei volti conosciuti saranno inviati a Google Gemini per il confronto. Vuoi continuare?')) return
            update({ ai: { ...config?.ai, doorbellVision: enabling } }, {
              onSuccess: () => setMessage({ ok: true, text: 'Riconoscimento AI aggiornato.' }),
              onError: () => setMessage({ ok: false, text: 'Aggiornamento del riconoscimento AI non riuscito.' }),
            })
          }}
          role="switch"
          aria-checked={config?.ai?.doorbellVision === true}
          aria-label="Riconoscimento AI del campanello"
        >
          <span className="lg-toggle-knob" aria-hidden="true" />
        </button>
      </div>
      <KnownFacesRow />
      {!draft && <SaveMessage message={message} />}
      {doorbells.length === 0 ? (
        <p className="text-[12px] text-black/40">Alla pressione: video fullscreen, suono e riconoscimento. Collega un trigger (event/binary_sensor) e una camera.</p>
      ) : (
        <div className="space-y-1.5">
          {doorbells.map((d) => (
            <div key={d.id} className={cn('flex min-h-[48px] items-center gap-2 rounded-[10px] bg-black/[0.04] px-3 py-2', d.active === false && 'opacity-60')}>
              <Bell size={15} className="shrink-0 text-black/45" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#1d1d1f]">{d.name || 'Senza nome'}</p>
                <p className="truncate text-[11px] text-black/40">{d.active === false ? 'Disattivato · ' : ''}{d.location ? `${d.location} · ` : ''}{d.entityId || 'nessuna entità'}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setTestingId(d.id)
                  setMessage(null)
                  try {
                    await haApi.doorbellTest(d.id)
                    setMessage({ ok: true, text: `Test di “${d.name}” inviato ai client LAN.` })
                  } catch {
                    setMessage({ ok: false, text: `Test di “${d.name}” non riuscito.` })
                  } finally {
                    setTestingId(null)
                  }
                }}
                disabled={testingId !== null}
                className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-[#0066cc]/10 px-3 text-xs font-semibold text-[#0066cc] active:scale-95"
                title="Suona su tutti i dispositivi connessi, tablet incluso"
              >
                <Bell size={12} /> {testingId === d.id ? 'Invio…' : 'Prova'}
              </button>
              <button type="button" onClick={() => setDraft({ ...d })} disabled={readOnly} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black/55" aria-label={`Modifica ${d.name}`}>
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Eliminare il campanello “${d.name}”?`)) persist(doorbells.filter((x) => x.id !== d.id), 'Campanello eliminato.')
                }}
                disabled={readOnly || isPending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500"
                aria-label={`Elimina ${d.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <GlassSheet open={Boolean(draft)} onClose={() => setDraft(null)} title="Campanello" side="right">
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-doorbell-name`} className="text-xs font-semibold text-black/50">Nome</label>
                <input id={`${id}-doorbell-name`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="es. Ingresso" className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${id}-doorbell-location`} className="text-xs font-semibold text-black/50">Posizione</label>
                <input id={`${id}-doorbell-location`} value={draft.location ?? ''} onChange={(e) => setDraft({ ...draft, location: e.target.value || undefined })} placeholder="es. Cancello" className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-doorbell-entity`} className="text-xs font-semibold text-black/50">Entità campanello</label>
              <select id={`${id}-doorbell-entity`} value={draft.entityId} onChange={(e) => setDraft({ ...draft, entityId: e.target.value })} className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12">
                <option value="">— event / binary_sensor —</option>
                {doorbellOptions.map((e) => (
                  <option key={e.entity_id} value={e.entity_id}>{(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} · {e.entity_id}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-doorbell-camera`} className="text-xs font-semibold text-black/50">Videocamera</label>
              <select id={`${id}-doorbell-camera`} value={draft.cameraEntityId ?? ''} onChange={(e) => setDraft({ ...draft, cameraEntityId: e.target.value || undefined })} className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12">
                <option value="">— nessuna —</option>
                {cameraOptions.map((e) => (
                  <option key={e.entity_id} value={e.entity_id}>{(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} · {e.entity_id}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-doorbell-sound`} className="text-xs font-semibold text-black/50">Suono</label>
                <div className="flex gap-2">
                  <select id={`${id}-doorbell-sound`} value={draft.sound ?? 'dingdong'} onChange={(e) => setDraft({ ...draft, sound: e.target.value })} className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12">
                    <option value="dingdong">Ding-dong</option>
                    <option value="chime">Chime</option>
                    <option value="alert">Alert</option>
                    <option value="soft">Soft</option>
                    <option value="none">Nessuno</option>
                  </select>
                  <button type="button" onClick={() => play((draft.sound as SoundPreset) ?? 'dingdong', { cooldownMs: 0 })} className="min-h-[44px] shrink-0 rounded-[12px] bg-black/8 px-3 text-xs font-semibold text-black/60" aria-label="Ascolta il suono selezionato">▶</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${id}-doorbell-priority`} className="text-xs font-semibold text-black/50">Priorità</label>
                <select id={`${id}-doorbell-priority`} value={draft.priority ?? 'high'} onChange={(e) => setDraft({ ...draft, priority: e.target.value as DoorbellDevice['priority'] })} className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12">
                  <option value="low">Bassa</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Critica</option>
                </select>
              </div>
            </div>
            {lockOptions.length === 0 && (
              <p className="rounded-[10px] bg-black/[0.035] px-3 py-2.5 text-[11px] leading-relaxed text-black/45">
                <span className="font-semibold text-black/60">Serrature:</span> nessuna entità <code>lock.*</code> in Home Assistant.
                Il bottone "apri porta" nel modale del campanello appare solo quando una serratura smart è integrata in HA.
              </p>
            )}
            {lockOptions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-black/50" id={`${id}-doorbell-locks`}>Serrature apribili dal modale ({draft.lockEntityIds?.length ?? 0})</p>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-doorbell-locks`}>
                  {lockOptions.map((e) => {
                    const checked = draft.lockEntityIds?.includes(e.entity_id) ?? false
                    return (
                      <button
                        key={e.entity_id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => setDraft({
                          ...draft,
                          lockEntityIds: checked
                            ? (draft.lockEntityIds ?? []).filter((id) => id !== e.entity_id)
                            : [...(draft.lockEntityIds ?? []), e.entity_id],
                        })}
                        className={cn(
                          'min-h-[44px] rounded-full px-4 text-sm font-semibold transition active:scale-95',
                          checked ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60',
                        )}
                      >
                        {(e.attributes?.friendly_name as string | undefined) ?? e.entity_id}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-black/35">Compaiono nel modale del campanello con apertura a pressione prolungata.</p>
              </div>
            )}
            <ShortcutsEditor
              value={draft.shortcuts ?? []}
              onChange={(shortcuts) => setDraft({ ...draft, shortcuts: shortcuts.length ? shortcuts : undefined })}
              disabled={readOnly}
              title="Azioni rapide del modale"
              hint="Compaiono come bottoni quando suona: luce ingresso, cancello, scena…"
            />
            <div className="space-y-1.5">
              <label htmlFor={`${id}-doorbell-volume`} className="text-xs font-semibold text-black/50">Volume ({Math.round((draft.volume ?? 1) * 100)}%)</label>
              <input id={`${id}-doorbell-volume`} type="range" min={0} max={1} step={0.05} value={draft.volume ?? 1} onChange={(e) => setDraft({ ...draft, volume: Number(e.target.value) })} className="min-h-[44px] w-full accent-[#0066cc]" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2.5">
              <div>
                <p className="text-sm text-[#1d1d1f]">Campanello attivo</p>
                <p className="text-[11px] text-black/40">Se disattivato, il trigger viene ignorato dal kiosk.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.active !== false}
                aria-label="Campanello attivo"
                onClick={() => setDraft({ ...draft, active: draft.active === false })}
                className={cn('lg-toggle shrink-0', draft.active !== false && 'on')}
              >
                <span className="lg-toggle-knob" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={saveDraft}
              disabled={!draft.name.trim() || !draft.entityId || isPending}
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
            >
              <Save size={14} /> {isPending ? 'Salvataggio…' : 'Salva campanello'}
            </button>
            <SaveMessage message={message} />
          </div>
        )}
      </GlassSheet>
    </GlassCard>
  )
}

/**
 * Volti conosciuti per Gemini Vision: foto dei familiari (ridotte lato client)
 * salvate in `config.ai.faces`. Al ring il backend le allega allo snapshot
 * come riferimento e Gemini risponde col NOME, non solo con una descrizione.
 * Le foto restano nel backend a riposo e non vengono proiettate al kiosk; con
 * il consenso Vision attivo vengono inviate a Gemini soltanto al ring reale.
 */
function KnownFacesRow() {
  const { data: config } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const id = useId()
  const faces = useMemo(() => config?.ai?.faces ?? [], [config])
  const canAddPerson = canAddKnownFace(faces.length)
  const visionOn = config?.ai?.doorbellVision === true
  const readOnly = config?.storage?.writable === false

  const persist = (next: KnownFace[], successText: string, onSuccess?: () => void) => {
    setMessage(null)
    update({ ai: { ...config?.ai, faces: next } }, {
      onSuccess: () => { setMessage({ ok: true, text: successText }); onSuccess?.() },
      onError: () => setMessage({ ok: false, text: 'Salvataggio dei volti non riuscito.' }),
    })
  }

  const addPhoto = async (face: KnownFace | null, file: File) => {
    if (!face && !canAddPerson) {
      setMessage({ ok: false, text: `Puoi configurare al massimo ${MAX_KNOWN_FACES} persone. Eliminane una prima di aggiungerne un’altra.` })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const dataUrl = await fileToFaceDataUrl(file)
      if (face) {
        persist(faces.map((f) => (f.id === face.id ? { ...f, images: [...f.images, dataUrl].slice(-3) } : f)), `Foto aggiunta a ${face.name}.`)
      } else if (name.trim()) {
        persist([...faces, { id: uid('face'), name: name.trim(), images: [dataUrl] }], 'Persona aggiunta.', () => setName(''))
      }
    } catch {
      setMessage({ ok: false, text: 'Immagine non valida o non elaborabile.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-[10px] bg-black/[0.035] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <ScanFace size={16} className="shrink-0 text-black/45" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[#1d1d1f]">Volti conosciuti · {faces.length}/{MAX_KNOWN_FACES}</p>
          <p className="text-[11px] text-black/40">
            {visionOn
              ? `Carica 1–3 foto frontali per persona, fino a ${MAX_KNOWN_FACES}: a una suonata reale queste foto e lo snapshot vengono inviati a Google Gemini per il confronto.`
              : 'Attiva il riconoscimento AI qui sopra per usare i volti.'}
          </p>
        </div>
      </div>
      {faces.map((f) => (
        <div key={f.id} className="flex min-h-[48px] items-center gap-2 rounded-[10px] bg-white/70 px-2.5 py-2">
          <div className="flex shrink-0 -space-x-2.5">
            {f.images.map((img, i) => (
              <img key={i} src={img} alt={f.name} className="h-9 w-9 rounded-full border-2 border-white object-cover" />
            ))}
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1d1d1f]">{f.name}</p>
          {f.images.length < 3 && (
            <FacePhotoButton label="Foto" ariaLabel={`Aggiungi una foto per ${f.name}`} disabled={readOnly || busy || isPending} onFile={(file) => addPhoto(f, file)} />
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Eliminare ${f.name} e tutte le foto associate?`)) persist(faces.filter((x) => x.id !== f.id), `${f.name} eliminato.`)
            }}
            disabled={readOnly || isPending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500"
            aria-label={`Elimina ${f.name}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {!canAddPerson && (
        <p id={`${id}-face-limit`} className="rounded-[10px] bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-800" role="status">
          Limite di {MAX_KNOWN_FACES} persone raggiunto. Elimina una persona per poterne aggiungere un’altra.
        </p>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-face-name`} className="sr-only">Nome della persona</label>
        <input
          id={`${id}-face-name`}
          value={name}
          disabled={readOnly || !canAddPerson}
          aria-describedby={!canAddPerson ? `${id}-face-limit` : undefined}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (es. Davide)"
          className="min-h-[44px] min-w-0 flex-1 rounded-[10px] bg-black/8 px-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
        />
        <FacePhotoButton
          label={canAddPerson ? 'Aggiungi persona' : `Limite ${MAX_KNOWN_FACES}`}
          ariaLabel={canAddPerson ? 'Aggiungi la prima foto della nuova persona' : `Limite di ${MAX_KNOWN_FACES} persone raggiunto`}
          primary
          disabled={readOnly || busy || isPending || !name.trim() || !canAddPerson}
          onFile={(file) => addPhoto(null, file)}
        />
      </div>
      <SaveMessage message={message} />
    </div>
  )
}

/** Bottone-upload con input file nascosto (una singola immagine). */
function FacePhotoButton({ label, ariaLabel, onFile, disabled, primary }: {
  label: string
  ariaLabel?: string
  onFile: (f: File) => void
  disabled?: boolean
  primary?: boolean
}) {
  const id = useId()
  return (
    <span className="relative shrink-0">
      <input
        id={id}
        type="file"
        accept="image/*"
        className="peer sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
      <label htmlFor={id} aria-label={ariaLabel} className={cn(
        'flex min-h-[44px] cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold transition active:scale-95 peer-focus-visible:ring-2 peer-focus-visible:ring-[#0066cc] peer-focus-visible:ring-offset-2',
        primary ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60',
        disabled && 'pointer-events-none opacity-40',
      )}>
        <Plus size={13} /> {label}
      </label>
    </span>
  )
}

// ── Suoni ────────────────────────────────────────────────────────────────────

function SoundsCard() {
  const { muted, volume, setMuted, setVolume, play } = useSoundNotifications()
  const id = useId()
  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={muted ? VolumeX : Volume2} title="Suoni notifiche" badge={muted ? 'Silenziati' : `${Math.round(volume * 100)}%`} tone={muted ? 'warn' : 'ok'} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setMuted(!muted)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/60" aria-label={muted ? 'Riattiva audio' : 'Silenzia'}>
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <label htmlFor={`${id}-volume`} className="sr-only">Volume notifiche</label>
        <input id={`${id}-volume`} type="range" min={0} max={1} step={0.05} value={volume} disabled={muted} onChange={(e) => setVolume(Number(e.target.value))} className="min-h-[44px] min-w-0 flex-1 accent-[#0066cc]" />
        <button type="button" onClick={() => play('dingdong', { cooldownMs: 0 })} disabled={muted} className="min-h-[44px] shrink-0 rounded-full bg-black/8 px-3 py-2 text-xs font-semibold text-black/60 active:scale-95">Prova</button>
      </div>
    </GlassCard>
  )
}

// ── Kiosk: ambient & presence wake ───────────────────────────────────────────

const PRESENCE_CLASSES = new Set(['motion', 'occupancy', 'presence'])

function KioskCard() {
  const { data: config } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const entities = useEntityStore((s) => s.entities)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const id = useId()
  const photos = useQuery({
    queryKey: ['screensaver-photos'],
    queryFn: screensaverApi.list,
    staleTime: 60_000,
  })

  const sensors = useMemo(
    () => Object.values(entities)
      .filter((e) => e.entity_id.startsWith('binary_sensor.') && PRESENCE_CLASSES.has(String(e.attributes?.device_class ?? '')))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
    [entities],
  )

  const current = config?.kiosk?.wakeEntityId ?? ''
  const homeMode = config?.kiosk?.homeMode ?? 'composer'
  const perfProfile = config?.kiosk?.perfProfile ?? 'balanced'
  const readOnly = config?.storage?.writable === false
  const screensaver = config?.kiosk?.screensaver
  const screensaverEnabled = screensaver?.enabled !== false
  const photoSource = screensaver?.source ?? 'local'
  const [sourceUrlDraft, setSourceUrlDraft] = useState<string | null>(null)

  const saveKiosk = (kiosk: NonNullable<typeof config>['kiosk'], successText: string) => {
    setMessage(null)
    update({ kiosk }, {
      onSuccess: () => setMessage({ ok: true, text: successText }),
      onError: () => setMessage({ ok: false, text: 'Impostazione kiosk non salvata. Riprova.' }),
    })
  }

  const saveScreensaver = (patch: NonNullable<NonNullable<typeof config>['kiosk']>['screensaver'], successText: string) => {
    saveKiosk({
      ...config?.kiosk,
      screensaver: { ...screensaver, ...patch },
    }, successText)
  }

  const modes: { id: 'composer' | 'grid'; label: string }[] = [
    { id: 'composer', label: 'Auto-composta' },
    { id: 'grid', label: 'Griglia drag & drop' },
  ]

  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={MonitorSmartphone} title="Kiosk" badge={current ? 'Risveglio attivo' : 'Solo tocco'} tone={current ? 'ok' : 'neutral'} />
      {readOnly && <ReadOnlyNotice />}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-black/50" id={`${id}-home-mode`}><LayoutGrid size={12} /> Home del tablet</p>
        <div className="flex gap-2" role="group" aria-labelledby={`${id}-home-mode`}>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={readOnly || isPending}
              onClick={() => saveKiosk({ ...config?.kiosk, homeMode: m.id }, 'Modalità home del kiosk aggiornata.')}
              aria-pressed={homeMode === m.id}
              className={cn('min-h-[44px] flex-1 rounded-[12px] text-sm font-semibold transition', homeMode === m.id ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60')}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-black/40">
          {homeMode === 'grid'
            ? 'Sul tablet appare "Modifica disposizione": trascina le card dove vuoi e salva. La modifica arriva live.'
            : 'Le card si scelgono da sole per rilevanza (composer): niente da disporre.'}
        </p>
      </div>
      <p className="text-[12px] text-black/40">
        Dopo il tempo scelto il tablet passa alla modalità ambient (foto locali, orologio, meteo e drift anti-burn-in).
        Con un sensore di presenza la dashboard si risveglia da sola quando qualcuno passa, sempre all’interno della LAN.
      </p>
      <div className="space-y-2.5 rounded-[14px] bg-black/[0.035] p-3">
        <div className="flex items-center gap-2">
          <Images size={15} className="text-black/45" aria-hidden="true" />
          <p className="flex-1 text-xs font-semibold text-black/65">Cornice digitale locale</p>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-black/55">
            <input
              type="checkbox"
              checked={screensaverEnabled}
              disabled={readOnly || isPending}
              onChange={(event) => saveScreensaver({ enabled: event.target.checked }, event.target.checked ? 'Screensaver attivato.' : 'Screensaver disattivato.')}
              className="h-5 w-5 accent-[#0066cc]"
            />
            Attiva
          </label>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="space-y-1 text-[11px] font-semibold text-black/45">
            Inattività
            <select
              value={screensaver?.idleSeconds ?? 180}
              disabled={readOnly || isPending || !screensaverEnabled}
              onChange={(event) => saveScreensaver({ idleSeconds: Number(event.target.value) }, 'Tempo di inattività aggiornato.')}
              className="min-h-11 w-full rounded-[11px] bg-white/70 px-2 text-sm text-black/70"
            >
              <option value={60}>1 minuto</option>
              <option value={180}>3 minuti</option>
              <option value={300}>5 minuti</option>
              <option value={600}>10 minuti</option>
              <option value={900}>15 minuti</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-black/45">
            Cambio foto
            <select
              value={screensaver?.slideSeconds ?? 20}
              disabled={readOnly || isPending || !screensaverEnabled}
              onChange={(event) => saveScreensaver({ slideSeconds: Number(event.target.value) }, 'Intervallo foto aggiornato.')}
              className="min-h-11 w-full rounded-[11px] bg-white/70 px-2 text-sm text-black/70"
            >
              <option value={10}>10 secondi</option>
              <option value={20}>20 secondi</option>
              <option value={30}>30 secondi</option>
              <option value={60}>1 minuto</option>
            </select>
          </label>
          <label className="space-y-1 text-[11px] font-semibold text-black/45">
            Luminosità ambient
            <select
              value={screensaver?.brightness ?? 28}
              disabled={readOnly || isPending || !screensaverEnabled}
              onChange={(event) => saveScreensaver({ brightness: Number(event.target.value) }, 'Luminosità screensaver aggiornata.')}
              className="min-h-11 w-full rounded-[11px] bg-white/70 px-2 text-sm text-black/70"
            >
              <option value={13}>5%</option>
              <option value={28}>11%</option>
              <option value={51}>20%</option>
              <option value={77}>30%</option>
            </select>
          </label>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-black/45" id={`${id}-photo-source`}>Sorgente foto</p>
          <div className="flex gap-2" role="group" aria-labelledby={`${id}-photo-source`}>
            {([['local', 'Cartella locale'], ['google', 'Album Google Foto']] as const).map(([sourceId, label]) => (
              <button
                key={sourceId}
                type="button"
                disabled={readOnly || isPending || !screensaverEnabled}
                onClick={() => saveScreensaver({ source: sourceId }, 'Sorgente foto aggiornata.')}
                aria-pressed={photoSource === sourceId}
                className={cn('min-h-[44px] flex-1 rounded-[12px] text-sm font-semibold transition', photoSource === sourceId ? 'bg-[#0066cc] text-white' : 'bg-white/70 text-black/60')}
              >
                {label}
              </button>
            ))}
          </div>
          {photoSource === 'google' && (
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-source-url`} className="sr-only">Link pubblico dell’album Google Foto</label>
              <input
                id={`${id}-source-url`}
                type="url"
                value={sourceUrlDraft ?? screensaver?.sourceUrl ?? ''}
                disabled={readOnly || isPending || !screensaverEnabled}
                onChange={(e) => setSourceUrlDraft(e.target.value)}
                placeholder="https://photos.app.goo.gl/…"
                className="min-h-[44px] min-w-0 flex-1 rounded-[11px] bg-white/70 px-3 text-sm text-black/70 outline-none focus:bg-white"
              />
              <button
                type="button"
                disabled={readOnly || isPending || sourceUrlDraft === null}
                onClick={() => {
                  const url = (sourceUrlDraft ?? '').trim()
                  if (url && !/^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//.test(url)) {
                    setMessage({ ok: false, text: 'Il link deve essere un album condiviso Google Foto (photos.app.goo.gl o photos.google.com).' })
                    return
                  }
                  saveScreensaver({ sourceUrl: url }, 'Album collegato.')
                  setSourceUrlDraft(null)
                  setTimeout(() => { void photos.refetch() }, 400)
                }}
                className="flex min-h-[44px] shrink-0 items-center rounded-full bg-[#0066cc] px-4 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
              >
                Collega
              </button>
            </div>
          )}
        </div>
        <div className="flex min-h-11 items-center gap-2 rounded-[11px] bg-white/55 px-3 text-[11px] text-black/50">
          <span className="min-w-0 flex-1">
            {photos.isPending ? 'Verifica della sorgente foto…'
              : photos.isError ? 'Sorgente foto non raggiungibile'
                : photos.data?.error ? `${photos.data.error} — in uso ${photos.data.photos.length} foto locali`
                  : photos.data?.source === 'google-photos' ? `${photos.data.photos.length} foto dall’album Google`
                    : `${photos.data?.photos.length ?? 0} foto in /data/screensaver`}
          </span>
          <button
            type="button"
            onClick={() => { void photos.refetch() }}
            disabled={photos.isFetching}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-black/50 disabled:opacity-40"
            aria-label="Aggiorna elenco foto screensaver"
          >
            <RefreshCw size={14} className={cn(photos.isFetching && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-black/50" id={`${id}-perf`}><Gauge size={12} /> Prestazioni del tablet</p>
        <div className="flex gap-2" role="group" aria-labelledby={`${id}-perf`}>
          {([['quality', 'Qualità'], ['balanced', 'Bilanciato'], ['saver', 'Risparmio']] as const).map(([profileId, label]) => (
            <button
              key={profileId}
              type="button"
              disabled={readOnly || isPending}
              onClick={() => saveKiosk({ ...config?.kiosk, perfProfile: profileId }, 'Profilo prestazioni aggiornato.')}
              aria-pressed={perfProfile === profileId}
              className={cn('min-h-[44px] flex-1 rounded-[12px] text-sm font-semibold transition', perfProfile === profileId ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60')}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-black/40">
          {perfProfile === 'quality' ? 'Vetro e animazioni sempre attivi: per tablet recenti.'
            : perfProfile === 'saver' ? 'Superfici solide e niente animazioni ambientali: massima fluidità su hardware datato.'
              : 'Il tablet misura i propri frame e riduce gli effetti solo se serve.'}
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-wake-sensor`} className="text-xs font-semibold text-black/50">Sensore di presenza per il risveglio</label>
        <select
          id={`${id}-wake-sensor`}
          value={current}
          disabled={readOnly || isPending}
          onChange={(e) => saveKiosk({ ...config?.kiosk, wakeEntityId: e.target.value || undefined }, 'Sensore di risveglio aggiornato.')}
          className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
        >
          <option value="">— nessuno (solo tocco) —</option>
          {sensors.map((e) => (
            <option key={e.entity_id} value={e.entity_id}>
              {(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} · {e.entity_id}
            </option>
          ))}
        </select>
      </div>
      <SaveMessage message={message} />
    </GlassCard>
  )
}

// ── Emergenza (§11): foto dal tablet + pulsanti configurabili ────────────────

function EmergencyCard() {
  const { data: config } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const readOnly = config?.storage?.writable === false
  const photoOn = config?.alarm?.photo === true

  if (!config) return null

  const saveAlarm = (patch: Partial<NonNullable<typeof config.alarm>>, successText: string) => {
    setMessage(null)
    update({ alarm: { ...config.alarm, ...patch } }, {
      onSuccess: () => setMessage({ ok: true, text: successText }),
      onError: () => setMessage({ ok: false, text: 'Impostazione non salvata. Riprova.' }),
    })
  }

  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={Siren} title="Emergenza" badge={photoOn ? 'Foto attiva' : 'Solo avviso'} tone={photoOn ? 'ok' : 'neutral'} />
      {readOnly && <ReadOnlyNotice />}
      <p className="text-[12px] text-black/40">
        Con un allarme attivo il tablet accende lo schermo alla massima luminosità e mostra l’avviso a tutto schermo.
      </p>
      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm text-[#1d1d1f]">Foto dal tablet all’allarme</p>
          <p className="text-[11px] text-black/40">Opt-in: UNA fotografia dalla fotocamera frontale per evento, salvata nello storage locale MyHome. Niente video né scatti continui.</p>
        </div>
        <button
          type="button"
          className={cn('lg-toggle shrink-0', photoOn && 'on')}
          disabled={readOnly || isPending}
          onClick={() => {
            const enabling = !photoOn
            if (enabling && !window.confirm('Attivando la foto di emergenza, a ogni allarme il tablet scatterà una singola fotografia e la salverà nello storage locale di MyHome. Vuoi continuare?')) return
            saveAlarm({ photo: enabling }, enabling ? 'Foto di emergenza attivata.' : 'Foto di emergenza disattivata.')
          }}
          role="switch"
          aria-checked={photoOn}
          aria-label="Foto dal tablet all’allarme"
        >
          <span className="lg-toggle-knob" aria-hidden="true" />
        </button>
      </div>
      <ShortcutsEditor
        value={config.alarm?.shortcuts ?? []}
        onChange={(shortcuts) => saveAlarm({ shortcuts: shortcuts.length ? shortcuts : undefined }, 'Pulsanti di emergenza aggiornati.')}
        disabled={readOnly || isPending}
        title="Pulsanti di emergenza"
        hint="Compaiono nell’avviso a tutto schermo. In emergenza ogni azione richiede la pressione prolungata."
      />
      <SaveMessage message={message} />
    </GlassCard>
  )
}

// ── Stato integrazioni ───────────────────────────────────────────────────────

function IntegrationsCard({ gemini, openweather, pending, error }: { gemini?: boolean; openweather?: boolean; pending: boolean; error: boolean }) {
  const state = (value?: boolean): 'on' | 'off' | 'unknown' => pending || error ? 'unknown' : value ? 'on' : 'off'
  return (
    <GlassCard className="space-y-2.5">
      <FeatureHeader Icon={Sparkles} title="Integrazioni" />
      <IntegrationRow Icon={Cloud} name="Meteo (OpenWeather)" state={state(openweather)} offText="Chiave assente: imposta OPENWEATHER_API_KEY sul servizio LAN" />
      <IntegrationRow Icon={Sparkles} name="AI (Gemini)" state={state(gemini)} offText="Chiave assente: imposta GEMINI_API_KEY sul servizio LAN" />
      <IntegrationRow Icon={Newspaper} name="News (RSS)" state="on" />
    </GlassCard>
  )
}

function IntegrationRow({ Icon, name, state, offText }: { Icon: React.ElementType; name: string; state: 'on' | 'off' | 'unknown'; offText?: string }) {
  const statusLabel = state === 'on' ? 'Attiva' : state === 'off' ? 'Non configurata' : 'Stato non disponibile'
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2.5">
      <Icon size={16} className="shrink-0 text-black/45" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#1d1d1f]">{name}</p>
        {state === 'off' && offText && <p className="text-[11px] text-orange-700">{offText}</p>}
        {state === 'unknown' && <p className="text-[11px] text-black/40">Stato non disponibile; controlla il servizio MyHome.</p>}
      </div>
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', state === 'on' ? 'bg-green-500' : state === 'off' ? 'bg-orange-400' : 'bg-black/25')} aria-hidden="true" />
      <span className="sr-only">{statusLabel}</span>
    </div>
  )
}

function SaveMessage({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null
  return (
    <p className={cn('text-xs font-semibold', message.ok ? 'text-green-700' : 'text-red-600')} role={message.ok ? 'status' : 'alert'} aria-live="polite">
      {message.text}
    </p>
  )
}

function ReadOnlyNotice() {
  return (
    <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="status">
      Configurazione in sola lettura: le modifiche sono disabilitate.
    </p>
  )
}

function PageError({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center" role="alert">
      <p className="max-w-md rounded-[12px] bg-red-500/10 px-4 py-3 text-sm text-red-700">
        {error instanceof Error && error.message ? `${fallback} (${error.message})` : fallback}
      </p>
    </div>
  )
}
