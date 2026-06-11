import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, Cloud, LayoutGrid, MonitorSmartphone, Newspaper, Pencil, Plus, Save, ScanFace, Sparkles, SunMoon, Trash2, Volume2, VolumeX,
} from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { GlassSheet } from '../components/glass/GlassSheet'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import { useSoundNotifications } from '../hooks/useSoundNotifications'
import { useThemeStore } from '../store/theme'
import { useEntityStore } from '../store/entities'
import { systemApi, type DoorbellDevice, type KnownFace } from '../api/backend'
import { fileToFaceDataUrl } from '../lib/faceImage'
import { normalizeDoorbells } from '../lib/doorbell'
import { uid } from '../lib/uid'
import type { SoundPreset } from '../lib/sound/SoundManager'
import { cn } from '../lib/utils'

/**
 * Regia — Funzioni: una card per feature distintiva, ognuna col suo STATO
 * (attiva / manca chiave / spenta), non solo i campi. Assorbe le sezioni
 * vive del vecchio SettingsPage: preferenze, tema/sensori, campanelli, suoni.
 */
export function FunctionsPage() {
  const { data: config } = useDashboardConfig()
  const { data: status } = useQuery({ queryKey: ['system-status'], queryFn: systemApi.status, staleTime: 30_000 })

  if (!config) return <p className="p-4 text-sm text-black/40">Caricamento…</p>

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">Funzioni</h1>
        <p className="mt-1 text-sm text-black/45">Le feature della casa, ognuna col proprio stato</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PreferencesCard />
        <ThemeCard />
        <DoorbellsCard />
        <div className="flex flex-col gap-4">
          <SoundsCard />
          <KioskCard />
          <IntegrationsCard gemini={status?.integrations.gemini} openweather={status?.integrations.openweather} />
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
      <p className="flex-1 text-sm font-semibold text-[#1d1d1f]">{title}</p>
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

  if (!config) return null
  const value = form ?? {
    userName: config.userName,
    dashboardName: config.dashboardName,
    weatherCity: config.weatherCity,
    newsFeedUrl: config.newsFeedUrl,
  }

  const field = (key: keyof typeof value, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-black/50">{label}</label>
      <input
        value={value[key]}
        onChange={(e) => setForm({ ...value, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none transition-colors focus:bg-black/12"
      />
    </div>
  )

  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={Pencil} title="Identità & sorgenti" />
      <div className="grid grid-cols-2 gap-3">
        {field('userName', 'Il tuo nome', 'es. Davide')}
        {field('dashboardName', 'Nome dashboard', 'MyHome')}
      </div>
      {field('weatherCity', 'Città meteo', 'es. Milan,IT')}
      {field('newsFeedUrl', 'Feed RSS news', 'https://…/rss.xml')}
      <button
        onClick={() => form && update(form)}
        disabled={isPending || !form}
        className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0052a3] disabled:opacity-40"
      >
        <Save size={14} /> {isPending ? 'Salvataggio…' : 'Salva'}
      </button>
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
    { id: 'auto', label: 'Auto' }, { id: 'light', label: 'Chiaro' }, { id: 'dark', label: 'Scuro' },
  ]

  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={SunMoon} title="Tema & night mode" badge={themeMode === 'auto' ? 'Segue la luce' : themeMode === 'dark' ? 'Scuro' : 'Chiaro'} tone={themeMode === 'auto' ? 'ok' : 'neutral'} />
      <div className="flex gap-2">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setThemeMode(m.id)}
            className={cn('min-h-[44px] flex-1 rounded-[12px] text-sm font-medium transition', themeMode === m.id ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60')}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-black/40">
        In Auto, sul tablet il tema segue la luce ambientale (scuro &lt;20 lux, chiaro &gt;45 lux); su desktop segue il sistema.
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

  const doorbells = useMemo(
    () => config?.doorbells ?? (config ? normalizeDoorbells(config) : []),
    [config],
  )

  const persist = (next: DoorbellDevice[]) => update({ doorbells: next })

  const saveDraft = () => {
    if (!draft || !draft.name.trim() || !draft.entityId) return
    persist(doorbells.some((d) => d.id === draft.id) ? doorbells.map((d) => (d.id === draft.id ? draft : d)) : [...doorbells, draft])
    setDraft(null)
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
        <FeatureHeader Icon={Bell} title="Campanelli" badge={doorbells.length ? `${doorbells.length} attivi` : 'Nessuno'} tone={doorbells.length ? 'ok' : 'neutral'} />
        <button
          onClick={() => setDraft({ id: uid('db'), name: '', entityId: '', sound: 'dingdong', volume: 1, priority: 'high', active: true })}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-[#0066cc] px-3 text-xs font-semibold text-white active:scale-95"
        >
          <Plus size={13} /> Nuovo
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm text-[#1d1d1f]">Riconoscimento AI (Gemini Vision)</p>
          <p className="text-[11px] text-black/40">Alla pressione descrive chi c'è alla porta; se l'AI manca o fallisce resta l'avviso generico.</p>
        </div>
        <div
          className={cn('lg-toggle shrink-0', (config?.ai?.doorbellVision !== false) && 'on')}
          onClick={() => update({ ai: { ...config?.ai, doorbellVision: config?.ai?.doorbellVision === false } })}
          role="switch"
          aria-checked={config?.ai?.doorbellVision !== false}
        >
          <span className="lg-toggle-knob" />
        </div>
      </div>
      <KnownFacesRow />
      {doorbells.length === 0 ? (
        <p className="text-[12px] text-black/40">Alla pressione: video fullscreen, suono e riconoscimento. Collega un trigger (event/binary_sensor) e una camera.</p>
      ) : (
        <div className="space-y-1.5">
          {doorbells.map((d) => (
            <div key={d.id} className="flex min-h-[48px] items-center gap-2 rounded-[10px] bg-black/[0.04] px-3 py-2">
              <Bell size={15} className="shrink-0 text-black/45" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#1d1d1f]">{d.name || 'Senza nome'}</p>
                <p className="truncate text-[11px] text-black/40">{d.location ? `${d.location} · ` : ''}{d.entityId || 'nessuna entità'}</p>
              </div>
              <button onClick={() => setDraft({ ...d })} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black/55" aria-label="Modifica">
                <Pencil size={13} />
              </button>
              <button onClick={() => persist(doorbells.filter((x) => x.id !== d.id))} disabled={isPending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500" aria-label="Elimina">
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
                <label className="text-xs font-medium text-black/50">Nome</label>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="es. Ingresso" className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-black/50">Posizione</label>
                <input value={draft.location ?? ''} onChange={(e) => setDraft({ ...draft, location: e.target.value || undefined })} placeholder="es. Cancello" className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50">Entità campanello</label>
              <select value={draft.entityId} onChange={(e) => setDraft({ ...draft, entityId: e.target.value })} className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12">
                <option value="">— event / binary_sensor —</option>
                {doorbellOptions.map((e) => (
                  <option key={e.entity_id} value={e.entity_id}>{(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} · {e.entity_id}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50">Camera</label>
              <select value={draft.cameraEntityId ?? ''} onChange={(e) => setDraft({ ...draft, cameraEntityId: e.target.value || undefined })} className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12">
                <option value="">— nessuna —</option>
                {cameraOptions.map((e) => (
                  <option key={e.entity_id} value={e.entity_id}>{(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} · {e.entity_id}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-black/50">Suono</label>
                <div className="flex gap-2">
                  <select value={draft.sound ?? 'dingdong'} onChange={(e) => setDraft({ ...draft, sound: e.target.value })} className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12">
                    <option value="dingdong">Ding-dong</option>
                    <option value="chime">Chime</option>
                    <option value="alert">Alert</option>
                    <option value="soft">Soft</option>
                    <option value="none">Nessuno</option>
                  </select>
                  <button onClick={() => play((draft.sound as SoundPreset) ?? 'dingdong', { cooldownMs: 0 })} className="shrink-0 rounded-[12px] bg-black/8 px-3 text-xs font-medium text-black/60">▶</button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-black/50">Priorità</label>
                <select value={draft.priority ?? 'high'} onChange={(e) => setDraft({ ...draft, priority: e.target.value as DoorbellDevice['priority'] })} className="w-full min-h-[44px] rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12">
                  <option value="low">Bassa</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Critica</option>
                </select>
              </div>
            </div>
            {lockOptions.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-black/50">Serrature apribili dal modale ({draft.lockEntityIds?.length ?? 0})</label>
                <div className="flex flex-wrap gap-2">
                  {lockOptions.map((e) => {
                    const checked = draft.lockEntityIds?.includes(e.entity_id) ?? false
                    return (
                      <button
                        key={e.entity_id}
                        type="button"
                        onClick={() => setDraft({
                          ...draft,
                          lockEntityIds: checked
                            ? (draft.lockEntityIds ?? []).filter((id) => id !== e.entity_id)
                            : [...(draft.lockEntityIds ?? []), e.entity_id],
                        })}
                        className={cn(
                          'min-h-[40px] rounded-full px-4 text-sm font-medium transition active:scale-95',
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50">Volume ({Math.round((draft.volume ?? 1) * 100)}%)</label>
              <input type="range" min={0} max={1} step={0.05} value={draft.volume ?? 1} onChange={(e) => setDraft({ ...draft, volume: Number(e.target.value) })} className="w-full accent-[#0066cc]" />
            </div>
            <button
              onClick={saveDraft}
              disabled={!draft.name.trim() || !draft.entityId || isPending}
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
            >
              <Save size={14} /> Salva campanello
            </button>
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
 * Le foto restano nel backend e non vengono mai proiettate al kiosk.
 */
function KnownFacesRow() {
  const { data: config } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const faces = useMemo(() => config?.ai?.faces ?? [], [config])
  const visionOn = config?.ai?.doorbellVision !== false

  const persist = (next: KnownFace[]) => update({ ai: { ...config?.ai, faces: next } })

  const addPhoto = async (face: KnownFace | null, file: File) => {
    setBusy(true)
    try {
      const dataUrl = await fileToFaceDataUrl(file)
      if (face) {
        persist(faces.map((f) => (f.id === face.id ? { ...f, images: [...f.images, dataUrl].slice(-3) } : f)))
      } else if (name.trim()) {
        persist([...faces, { id: uid('face'), name: name.trim(), images: [dataUrl] }])
        setName('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-[10px] bg-black/[0.035] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <ScanFace size={16} className="shrink-0 text-black/45" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[#1d1d1f]">Volti conosciuti</p>
          <p className="text-[11px] text-black/40">
            {visionOn
              ? 'Carica 1–3 foto frontali per persona: alla suonata Gemini confronta il volto e annuncia chi è, per nome.'
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
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-[#1d1d1f]">{f.name}</p>
          {f.images.length < 3 && (
            <FacePhotoButton label="Foto" disabled={busy || isPending} onFile={(file) => addPhoto(f, file)} />
          )}
          <button
            onClick={() => persist(faces.filter((x) => x.id !== f.id))}
            disabled={isPending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500"
            aria-label={`Elimina ${f.name}`}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome (es. Davide)"
          className="min-h-[40px] min-w-0 flex-1 rounded-[10px] bg-black/8 px-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
        />
        <FacePhotoButton label="Aggiungi foto" primary disabled={busy || isPending || !name.trim()} onFile={(file) => addPhoto(null, file)} />
      </div>
    </div>
  )
}

/** Bottone-upload con input file nascosto (una singola immagine). */
function FacePhotoButton({ label, onFile, disabled, primary }: {
  label: string
  onFile: (f: File) => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <label className={cn(
      'flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold transition active:scale-95',
      primary ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60',
      disabled && 'pointer-events-none opacity-40',
    )}>
      <Plus size={13} /> {label}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </label>
  )
}

// ── Suoni ────────────────────────────────────────────────────────────────────

function SoundsCard() {
  const { muted, volume, setMuted, setVolume, play } = useSoundNotifications()
  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={muted ? VolumeX : Volume2} title="Suoni notifiche" badge={muted ? 'Silenziati' : `${Math.round(volume * 100)}%`} tone={muted ? 'warn' : 'ok'} />
      <div className="flex items-center gap-3">
        <button onClick={() => setMuted(!muted)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/60" aria-label={muted ? 'Riattiva audio' : 'Silenzia'}>
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={volume} disabled={muted} onChange={(e) => setVolume(Number(e.target.value))} className="min-w-0 flex-1 accent-[#0066cc]" />
        <button onClick={() => play('dingdong', { cooldownMs: 0 })} className="shrink-0 rounded-full bg-black/8 px-3 py-2 text-xs font-medium text-black/60 active:scale-95">Prova</button>
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

  const sensors = useMemo(
    () => Object.values(entities)
      .filter((e) => e.entity_id.startsWith('binary_sensor.') && PRESENCE_CLASSES.has(String(e.attributes?.device_class ?? '')))
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
    [entities],
  )

  const current = config?.kiosk?.wakeEntityId ?? ''
  const homeMode = config?.kiosk?.homeMode ?? 'composer'

  const modes: { id: 'composer' | 'grid'; label: string }[] = [
    { id: 'composer', label: 'Auto-composta' },
    { id: 'grid', label: 'Griglia drag & drop' },
  ]

  return (
    <GlassCard className="space-y-3">
      <FeatureHeader Icon={MonitorSmartphone} title="Kiosk" badge={current ? 'Risveglio attivo' : 'Solo tocco'} tone={current ? 'ok' : 'neutral'} />
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-black/50"><LayoutGrid size={12} /> Home del tablet</label>
        <div className="flex gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              disabled={isPending}
              onClick={() => update({ kiosk: { ...config?.kiosk, homeMode: m.id } })}
              className={cn('min-h-[44px] flex-1 rounded-[12px] text-sm font-medium transition', homeMode === m.id ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60')}
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
        Dopo 3 minuti di inattività il tablet passa alla modalità ambient (orologio, meteo, drift anti-burn-in).
        Con un sensore di presenza la dashboard si risveglia da sola quando qualcuno passa.
      </p>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Sensore di presenza per il risveglio</label>
        <select
          value={current}
          disabled={isPending}
          onChange={(e) => update({ kiosk: { ...config?.kiosk, wakeEntityId: e.target.value || undefined } })}
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
    </GlassCard>
  )
}

// ── Stato integrazioni ───────────────────────────────────────────────────────

function IntegrationsCard({ gemini, openweather }: { gemini?: boolean; openweather?: boolean }) {
  return (
    <GlassCard className="space-y-2.5">
      <FeatureHeader Icon={Sparkles} title="Integrazioni" />
      <IntegrationRow Icon={Cloud} name="Meteo (OpenWeather)" on={openweather} offText="Chiave assente: imposta OPENWEATHER_API_KEY" />
      <IntegrationRow Icon={Sparkles} name="AI (Gemini)" on={gemini} offText="Chiave assente: imposta GEMINI_API_KEY" />
      <IntegrationRow Icon={Newspaper} name="News (RSS)" on />
    </GlassCard>
  )
}

function IntegrationRow({ Icon, name, on, offText }: { Icon: React.ElementType; name: string; on?: boolean; offText?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-black/[0.035] px-3 py-2.5">
      <Icon size={16} className="shrink-0 text-black/45" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[#1d1d1f]">{name}</p>
        {!on && offText && <p className="text-[11px] text-orange-700">{offText}</p>}
      </div>
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', on ? 'bg-green-500' : 'bg-orange-400')} />
    </div>
  )
}
