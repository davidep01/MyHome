import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, User, Wifi, Plus, Trash2,
  ChevronRight, Save, X, Home, ShieldCheck, Eye, EyeOff, Search, Lock, Pencil, Bell, Layers, Check,
} from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { GlassSheet } from '../components/glass/GlassSheet'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import {
  useRooms, useCreateRoom, useDeleteRoom, useAddEntity, useRemoveEntity,
} from '../hooks/useRooms'
import { useEntityStore } from '../store/entities'
import type { AppConfig, DeviceOverride, DoorbellSettings, EntityGroup, EntityType, Room, RoomEntity } from '../api/backend'
import { iconExists } from '../lib/lucide'
import { uid } from '../lib/uid'
import { DynamicIcon } from '../components/DynamicIcon'
import { framerSpring, tokens } from '../design/tokens'
import { cn } from '../lib/utils'

const ADMIN_PIN = '8999'

type Section = 'preferences' | 'rooms' | 'connection' | 'admin'

const ENTITY_TYPES: RoomEntity['type'][] = [
  'light', 'climate', 'cover', 'scene', 'security', 'media', 'switch', 'camera', 'sensor',
]
const ROOM_ICONS = ['home', 'sofa', 'utensils', 'bed', 'bath', 'tree-pine', 'car', 'dumbbell']

// ── Section nav ──────────────────────────────────────────────────────────────

function SectionTab({
  label, icon: Icon, active, onClick,
}: { label: string; icon: React.ElementType; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 min-h-[44px] rounded-[14px] text-sm font-medium transition-all w-full',
        active ? 'bg-black/12 text-[#1d1d1f]' : 'text-black/50 hover:text-black/75 hover:bg-black/6',
      )}
    >
      <Icon size={16} />
      {label}
    </button>
  )
}

// ── Preferences ──────────────────────────────────────────────────────────────

function PreferencesSection() {
  const { data: config } = useDashboardConfig()
  if (!config) return <p className="text-sm text-black/40">Caricamento...</p>

  return <PreferencesForm key={`${config.userName}:${config.dashboardName}:${config.weatherCity}:${config.newsFeedUrl}`} config={config} />
}

function PreferencesForm({ config }: { config: NonNullable<ReturnType<typeof useDashboardConfig>['data']> }) {
  const { mutate: update } = useUpdateConfig()
  const [form, setForm] = useState({
    userName: config.userName,
    dashboardName: config.dashboardName,
    weatherCity: config.weatherCity,
    newsFeedUrl: config.newsFeedUrl,
  })

  const field = (key: keyof typeof form, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-black/50">{label}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] placeholder-white/25 outline-none focus:bg-black/12 transition-colors min-h-[44px]"
      />
    </div>
  )

  return (
    <div className="space-y-4">
      {field('userName', 'Il tuo nome', 'es. Davide')}
      {field('dashboardName', 'Nome dashboard', 'MyHome')}
      {field('weatherCity', 'Città meteo', 'es. Milan,IT')}
      {field('newsFeedUrl', 'Feed RSS news', 'https://www.ansa.it/sito/ansait_rss.xml')}
      <button
        onClick={() => update(form)}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] min-h-[44px] px-4 text-sm font-semibold text-white hover:bg-[#0052a3] transition-colors"
      >
        <Save size={14} />
        Salva preferenze
      </button>
    </div>
  )
}

// ── Connection ───────────────────────────────────────────────────────────────

function ConnectionSection() {
  const { data: config } = useDashboardConfig()
  if (!config) return <p className="text-sm text-black/40">Caricamento...</p>

  return <ConnectionForm key={config.haUrl} config={config} />
}

function ConnectionForm({ config }: { config: NonNullable<ReturnType<typeof useDashboardConfig>['data']> }) {
  const { mutate: update, isPending } = useUpdateConfig()
  const [haUrl, setHaUrl] = useState(config.haUrl)
  const [haToken, setHaToken] = useState('')
  const urlLocked = Boolean(config.haConfigLocked?.haUrl)
  const tokenLocked = Boolean(config.haConfigLocked?.haToken)

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] bg-orange-500/10 border border-orange-500/20 p-3">
        <p className="text-xs text-orange-300 leading-relaxed">
          In produzione usa <code className="font-mono text-orange-200">HA_URL</code> e <code className="font-mono text-orange-200">HA_TOKEN</code> su Vercel. I valori da env non sono modificabili dalla dashboard.
        </p>
      </div>
      {config.storage && !config.storage.writable && (
        <div className="rounded-[14px] border border-black/10 bg-black/6 p-3">
          <p className="text-xs leading-relaxed text-black/45">
            Questo deploy è in sola lettura: le modifiche a stanze, entità e preferenze non vengono salvate qui.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[12px] bg-black/6 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-black/25">URL</p>
          <p className="mt-1 text-xs font-semibold text-black/65">{config.haConfigSource?.url ?? 'db'}</p>
        </div>
        <div className="rounded-[12px] bg-black/6 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-black/25">Token</p>
          <p className="mt-1 text-xs font-semibold text-black/65">{config.haConfigSource?.token ?? 'missing'}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Home Assistant URL</label>
        <input
          value={haUrl}
          onChange={(e) => setHaUrl(e.target.value)}
          disabled={urlLocked}
          placeholder="http://homeassistant.local:8123"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] placeholder-white/25 outline-none focus:bg-black/12 disabled:opacity-45 transition-colors min-h-[44px] font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Token (lascia vuoto per non modificarlo)</label>
        <input
          type="password"
          value={haToken}
          onChange={(e) => setHaToken(e.target.value)}
          disabled={tokenLocked}
          placeholder="••••••••••••"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] placeholder-white/25 outline-none focus:bg-black/12 disabled:opacity-45 transition-colors min-h-[44px] font-mono"
        />
      </div>
      <button
        onClick={() => update({ haUrl, ...(haToken ? { haToken } : {}) })}
        disabled={isPending || (urlLocked && tokenLocked)}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] min-h-[44px] px-4 text-sm font-semibold text-white hover:bg-[#0052a3] disabled:opacity-50 transition-colors"
      >
        <Save size={14} />
        {isPending ? 'Salvataggio...' : 'Salva connessione'}
      </button>
    </div>
  )
}

// ── Rooms ────────────────────────────────────────────────────────────────────

function AddEntitySheet({
  room, onClose,
}: { room: Room; onClose: () => void }) {
  const { mutate: addEntity, isPending } = useAddEntity()
  const [entityId, setEntityId] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<RoomEntity['type']>('light')

  const submit = () => {
    if (!entityId || !label) return
    addEntity({ roomId: room.id, entityId, label, type }, { onSuccess: onClose })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Entity ID (da Home Assistant)</label>
        <input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="es. light.soggiorno"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] placeholder-white/25 outline-none focus:bg-black/12 transition-colors min-h-[44px] font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Nome visualizzato</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="es. Luce soggiorno"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] placeholder-white/25 outline-none focus:bg-black/12 transition-colors min-h-[44px]"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Tipo widget</label>
        <div className="grid grid-cols-3 gap-2">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'rounded-[10px] py-2.5 text-xs font-medium transition-all min-h-[44px]',
                type === t ? 'bg-[#0066cc] text-white' : 'bg-black/8 text-black/60 hover:bg-black/12',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={submit}
        disabled={isPending || !entityId || !label}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] min-h-[44px] text-sm font-semibold text-white hover:bg-[#0052a3] disabled:opacity-40 transition-colors"
      >
        <Plus size={14} />
        Aggiungi entità
      </button>
    </div>
  )
}

function RoomCard({ room }: { room: Room }) {
  const { mutate: deleteRoom } = useDeleteRoom()
  const { mutate: removeEntity } = useRemoveEntity()
  const [expanded, setExpanded] = useState(false)
  const [addSheet, setAddSheet] = useState(false)

  return (
    <>
      <GlassCard className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-black/8 text-black/50">
            <Home size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-black/90">{room.label}</p>
            <p className="text-xs" style={{ color: tokens.text.tertiary }}>{room.entities.length} entità</p>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/8 text-black/50 hover:text-[#1d1d1f] transition-colors"
          >
            <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={framerSpring}>
              <ChevronRight size={16} />
            </motion.div>
          </button>
          <button
            onClick={() => deleteRoom(room.id)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={framerSpring}
              className="overflow-hidden"
            >
              <div className="space-y-1.5 pt-2 border-t border-black/8">
                {room.entities.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 rounded-[10px] bg-black/5 px-3 py-2">
                    <span className="text-xs font-mono text-black/60 flex-1 truncate">{e.entityId}</span>
                    <span className="text-[10px] text-black/30 px-1.5 py-0.5 rounded-full bg-black/8">{e.type}</span>
                    <button
                      onClick={() => removeEntity({ roomId: room.id, entityId: e.id })}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setAddSheet(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-black/8 min-h-[44px] text-xs font-medium text-black/60 hover:bg-black/12 hover:text-[#1d1d1f] transition-colors"
                >
                  <Plus size={12} />
                  Aggiungi entità
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      <GlassSheet open={addSheet} onClose={() => setAddSheet(false)} title={`Aggiungi a ${room.label}`}>
        <AddEntitySheet room={room} onClose={() => setAddSheet(false)} />
      </GlassSheet>
    </>
  )
}

function RoomsSection() {
  const { data: rooms, isLoading } = useRooms()
  const { mutate: createRoom, isPending } = useCreateRoom()
  const [newLabel, setNewLabel] = useState('')
  const [newIcon, setNewIcon] = useState('home')

  const submit = () => {
    if (!newLabel.trim()) return
    createRoom({ label: newLabel.trim(), icon: newIcon }, {
      onSuccess: () => { setNewLabel(''); setNewIcon('home') },
    })
  }

  if (isLoading) return <p className="text-sm text-black/40">Caricamento...</p>

  return (
    <div className="space-y-4">
      {/* Add room form */}
      <GlassCard className="space-y-3">
        <p className="text-xs font-semibold text-black/50 uppercase tracking-wider">Nuova stanza</p>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="es. Studio"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] placeholder-white/25 outline-none focus:bg-black/12 min-h-[44px]"
        />
        <div className="flex gap-2 flex-wrap">
          {ROOM_ICONS.map((icon) => (
            <button
              key={icon}
              onClick={() => setNewIcon(icon)}
              className={cn(
                'px-3 min-h-[36px] rounded-[10px] text-xs font-mono transition-all',
                newIcon === icon ? 'bg-[#0066cc] text-white' : 'bg-black/8 text-black/50 hover:bg-black/12',
              )}
            >
              {icon}
            </button>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={isPending || !newLabel.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] min-h-[44px] text-sm font-semibold text-white hover:bg-[#0052a3] disabled:opacity-40 transition-colors"
        >
          <Plus size={14} />
          Crea stanza
        </button>
      </GlassCard>

      {/* Existing rooms */}
      <div className="space-y-2">
        {rooms?.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </div>
  )
}

// ── Admin: exclude HA entities (PIN-gated) ───────────────────────────────────

function AdminSection() {
  const { data: config } = useDashboardConfig()
  if (!config) return <p className="text-sm text-black/40">Caricamento...</p>
  return <AdminPanel config={config} />
}

const OVERRIDE_TYPES: { value: EntityType; label: string }[] = [
  { value: 'light', label: 'Luce' }, { value: 'switch', label: 'Interruttore' },
  { value: 'climate', label: 'Clima' }, { value: 'cover', label: 'Tapparella' },
  { value: 'lock', label: 'Serratura' }, { value: 'fan', label: 'Ventilatore' },
  { value: 'media', label: 'Media' }, { value: 'camera', label: 'Videocamera' },
  { value: 'vacuum', label: 'Robot' }, { value: 'scene', label: 'Scena' },
  { value: 'alarm', label: 'Allarme' }, { value: 'siren', label: 'Sirena' },
  { value: 'number', label: 'Slider' }, { value: 'select', label: 'Selettore' },
  { value: 'button', label: 'Pulsante' }, { value: 'binary_sensor', label: 'Sensore stato' },
  { value: 'sensor', label: 'Sensore valore' },
]

function AdminPanel({ config }: { config: AppConfig }) {
  const entities = useEntityStore((s) => s.entities)
  const { mutate: update, isPending } = useUpdateConfig()
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [query, setQuery] = useState('')
  const [hidden, setHidden] = useState<string[]>(config.hiddenEntities ?? [])
  const [overrides, setOverrides] = useState<Record<string, DeviceOverride>>(config.deviceOverrides ?? {})
  const [forceCelsius, setForceCelsius] = useState<boolean>(config.forceCelsius ?? false)
  const [doorbell, setDoorbell] = useState<DoorbellSettings>(config.doorbell ?? {})
  const [groups, setGroups] = useState<EntityGroup[]>(config.groups ?? [])
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EntityGroup | null>(null)
  const [groupQuery, setGroupQuery] = useState('')

  const saveDraft = () => {
    if (!draft || !draft.label.trim() || draft.entityIds.length === 0) return
    setGroups((gs) => (gs.some((g) => g.id === draft.id) ? gs.map((g) => (g.id === draft.id ? draft : g)) : [...gs, draft]))
    setDraft(null)
  }
  const deleteGroup = (id: string) => setGroups((gs) => gs.filter((g) => g.id !== id))
  const toggleMember = (id: string) =>
    setDraft((d) => (d ? { ...d, entityIds: d.entityIds.includes(id) ? d.entityIds.filter((x) => x !== id) : [...d.entityIds, id] } : d))

  const doorbellOptions = useMemo(
    () => Object.values(entities).filter((e) => e.entity_id.startsWith('event.') || e.entity_id.startsWith('binary_sensor.')),
    [entities],
  )
  const cameraOptions = useMemo(
    () => Object.values(entities).filter((e) => e.entity_id.startsWith('camera.')),
    [entities],
  )

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(entities)
      .map((e) => ({
        id: e.entity_id,
        name: (e.attributes?.friendly_name as string | undefined) ?? e.entity_id,
        state: e.state,
      }))
      .filter((e) => !q || e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [entities, query])

  const toggleHide = (id: string) =>
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))

  const patchOverride = (id: string, patch: Partial<DeviceOverride>) =>
    setOverrides((o) => {
      const next: DeviceOverride = { ...(o[id] ?? {}), ...patch }
      ;(Object.keys(next) as (keyof DeviceOverride)[]).forEach((k) => {
        if (next[k] === '' || next[k] === undefined) delete next[k]
      })
      return { ...o, [id]: next }
    })

  const save = () => update({ hiddenEntities: hidden, deviceOverrides: overrides, forceCelsius, doorbell, groups })

  // Auto-save: persist every change ~700ms after the last edit, so nothing is
  // lost by forgetting the Save button. Skips the initial mount.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    const t = setTimeout(() => {
      update({ hiddenEntities: hidden, deviceOverrides: overrides, forceCelsius, doorbell, groups })
    }, 700)
    return () => clearTimeout(t)
  }, [hidden, overrides, forceCelsius, doorbell, groups]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!unlocked) {
    return (
      <GlassCard className="mx-auto max-w-sm space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-black/8">
          <Lock size={22} className="text-black/55" />
        </div>
        <div>
          <p className="text-base font-semibold text-black/90">Area amministratore</p>
          <p className="mt-1 text-xs text-black/45">Inserisci il codice per gestire le entità importate da HA.</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setPinError(false) }}
          onKeyDown={(e) => e.key === 'Enter' && (pin === ADMIN_PIN ? setUnlocked(true) : setPinError(true))}
          placeholder="Codice"
          className={cn(
            'w-full rounded-[12px] bg-black/8 px-3 py-3 text-center text-lg tracking-[0.4em] text-[#1d1d1f] outline-none focus:bg-black/12',
            pinError && 'ring-2 ring-red-500/60',
          )}
        />
        {pinError && <p className="text-xs text-red-500">Codice errato</p>}
        <button
          onClick={() => (pin === ADMIN_PIN ? setUnlocked(true) : setPinError(true))}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] py-3 text-sm font-semibold text-white transition active:scale-95"
        >
          Sblocca
        </button>
      </GlassCard>
    )
  }

  const total = Object.keys(entities).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs text-black/50">{hidden.length} nascoste · {total} totali</p>
        {config.storage && !config.storage.writable ? (
          <span className="rounded-full bg-red-500/12 px-3 py-1.5 text-xs font-medium text-red-600">
            Sola lettura — modifiche non salvabili
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-black/45">
            <Save size={13} /> {isPending ? 'Salvataggio…' : 'Salvataggio automatico'}
          </span>
        )}
      </div>

      {/* Force Celsius */}
      <div className="flex items-center justify-between rounded-[12px] bg-black/[0.04] px-3 py-2.5">
        <span className="text-sm text-[#1d1d1f]">Forza temperature in °C</span>
        <div className={cn('lg-toggle', forceCelsius && 'on')} onClick={() => setForceCelsius((v) => !v)}>
          <span className="lg-toggle-knob" />
        </div>
      </div>

      {/* Doorbell — fullscreen alert source + camera */}
      <div className="space-y-2 rounded-[12px] bg-black/[0.04] p-3">
        <div className="flex items-center gap-2">
          <Bell size={15} className="text-black/55" />
          <span className="text-sm font-medium text-[#1d1d1f]">Campanello</span>
        </div>
        <p className="text-[11px] text-black/40">Alla pressione: video a tutto schermo 30s + riconoscimento Gemini.</p>
        <select
          value={doorbell.entityId ?? ''}
          onChange={(e) => setDoorbell((d) => ({ ...d, entityId: e.target.value || undefined }))}
          className="w-full rounded-[10px] border border-black/10 bg-white px-3 py-2.5 text-sm text-[#1d1d1f] outline-none focus:border-[#0066cc]"
        >
          <option value="">— Entità campanello (event/binary_sensor) —</option>
          {doorbellOptions.map((e) => (
            <option key={e.entity_id} value={e.entity_id}>
              {(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} · {e.entity_id}
            </option>
          ))}
        </select>
        <select
          value={doorbell.cameraEntityId ?? ''}
          onChange={(e) => setDoorbell((d) => ({ ...d, cameraEntityId: e.target.value || undefined }))}
          className="w-full rounded-[10px] border border-black/10 bg-white px-3 py-2.5 text-sm text-[#1d1d1f] outline-none focus:border-[#0066cc]"
        >
          <option value="">— Camera della porta —</option>
          {cameraOptions.map((e) => (
            <option key={e.entity_id} value={e.entity_id}>
              {(e.attributes?.friendly_name as string | undefined) ?? e.entity_id} · {e.entity_id}
            </option>
          ))}
        </select>
      </div>

      {/* Groups — merge several entities into one card */}
      <div className="space-y-2 rounded-[12px] bg-black/[0.04] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-black/55" />
            <span className="text-sm font-medium text-[#1d1d1f]">Gruppi</span>
          </div>
          <button
            onClick={() => { setGroupQuery(''); setDraft({ id: uid('g'), label: '', entityIds: [] }) }}
            className="flex items-center gap-1 rounded-full bg-[#0066cc] px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            <Plus size={13} /> Nuovo
          </button>
        </div>
        {groups.length === 0 ? (
          <p className="text-[11px] text-black/40">Unisci più entità (es. tutte le luci del salotto) in un'unica card.</p>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2 rounded-[10px] bg-white px-3 py-2">
              <DynamicIcon name={g.icon} fallback={Layers} size={16} className="shrink-0 text-black/55" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#1d1d1f]">{g.label}</p>
                <p className="text-[11px] text-black/40">{g.entityIds.length} entità{g.type ? ` · ${g.type}` : ''}</p>
              </div>
              <button onClick={() => { setGroupQuery(''); setDraft({ ...g }) }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/55" aria-label="Modifica">
                <Pencil size={13} />
              </button>
              <button onClick={() => deleteGroup(g.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500" aria-label="Elimina">
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca dispositivo…"
          className="w-full rounded-full border border-black/10 bg-white py-2.5 pl-9 pr-4 text-sm text-[#1d1d1f] outline-none focus:border-[#0066cc]"
        />
      </div>

      <div className="max-h-[48vh] space-y-1.5 overflow-y-auto pr-1">
        {list.length === 0 && <p className="px-1 py-6 text-center text-sm text-black/40">Nessuna entità</p>}
        {list.map((e) => {
          const isHidden = hidden.includes(e.id)
          const ov = overrides[e.id]
          return (
            <div
              key={e.id}
              className={cn('flex items-center gap-2 rounded-[12px] px-3 py-2', isHidden ? 'bg-black/[0.03] opacity-60' : 'bg-black/[0.05]')}
            >
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm font-medium', isHidden ? 'text-black/45 line-through' : 'text-[#1d1d1f]')}>
                  {ov?.label || e.name}
                </p>
                <p className="truncate font-mono text-[11px] text-black/35">{e.id}{ov?.type ? ` · ${ov.type}` : ''}</p>
              </div>
              <button
                onClick={() => setEditId(e.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/55 transition hover:text-[#1d1d1f]"
                aria-label="Modifica"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => toggleHide(e.id)}
                className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', isHidden ? 'bg-black/8 text-black/40' : 'bg-[#0066cc]/12 text-[#0066cc]')}
                aria-label={isHidden ? 'Mostra' : 'Nascondi'}
              >
                {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          )
        })}
      </div>

      {/* Per-device editor */}
      <GlassSheet open={Boolean(editId)} onClose={() => setEditId(null)} title="Modifica dispositivo" side="right">
        {editId && (
          <div className="space-y-4">
            <p className="break-all font-mono text-[11px] text-black/35">{editId}</p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50">Nome</label>
              <input
                value={overrides[editId]?.label ?? ''}
                onChange={(e) => patchOverride(editId, { label: e.target.value })}
                placeholder={(entities[editId]?.attributes?.friendly_name as string | undefined) ?? editId}
                className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50">Tipo card</label>
              <div className="grid grid-cols-2 gap-2">
                {OVERRIDE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => patchOverride(editId, { type: overrides[editId]?.type === t.value ? undefined : t.value })}
                    className={cn(
                      'rounded-[10px] px-2 py-2 text-xs font-medium transition',
                      overrides[editId]?.type === t.value ? 'bg-[#0066cc] text-white' : 'bg-black/8 text-black/60 hover:bg-black/12',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-black/35">Vuoto = tipo automatico.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50">Icona (nome lucide)</label>
              <div className="flex items-center gap-2">
                <input
                  value={overrides[editId]?.icon ?? ''}
                  onChange={(e) => patchOverride(editId, { icon: e.target.value })}
                  placeholder="es. lightbulb"
                  className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
                />
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-black/8 text-black/60">
                  {iconExists(overrides[editId]?.icon)
                    ? <DynamicIcon name={overrides[editId]?.icon} fallback={Pencil} size={18} />
                    : <span className="text-[10px] text-black/30">—</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[12px] bg-black/[0.04] px-3 py-2.5">
              <span className="text-sm text-[#1d1d1f]">Attivo</span>
              <div
                className={cn('lg-toggle', overrides[editId]?.enabled !== false && 'on')}
                onClick={() => patchOverride(editId, { enabled: overrides[editId]?.enabled === false ? true : false })}
              >
                <span className="lg-toggle-knob" />
              </div>
            </div>

            <button
              onClick={() => { save(); setEditId(null) }}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] py-3 text-sm font-semibold text-white transition active:scale-95"
            >
              <Save size={14} /> Salva dispositivo
            </button>
          </div>
        )}
      </GlassSheet>

      {/* Group editor */}
      <GlassSheet open={Boolean(draft)} onClose={() => setDraft(null)} title="Gruppo" side="right">
        {draft && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50">Nome gruppo</label>
              <input
                value={draft.label}
                onChange={(e) => setDraft((d) => (d ? { ...d, label: e.target.value } : d))}
                placeholder="es. Luci salotto"
                className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-black/50">Tipo</label>
                <select
                  value={draft.type ?? ''}
                  onChange={(e) => setDraft((d) => (d ? { ...d, type: (e.target.value || undefined) as EntityType | undefined } : d))}
                  className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
                >
                  <option value="">Auto</option>
                  {OVERRIDE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-black/50">Icona</label>
                <input
                  value={draft.icon ?? ''}
                  onChange={(e) => setDraft((d) => (d ? { ...d, icon: e.target.value || undefined } : d))}
                  placeholder="es. sofa"
                  className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-black/50">Membri ({draft.entityIds.length})</label>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
                <input
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  placeholder="Cerca entità…"
                  className="w-full rounded-full border border-black/10 bg-white py-2 pl-9 pr-3 text-sm text-[#1d1d1f] outline-none focus:border-[#0066cc]"
                />
              </div>
              <div className="max-h-[38vh] space-y-1 overflow-y-auto pr-1">
                {Object.values(entities)
                  .filter((e) => {
                    const q = groupQuery.trim().toLowerCase()
                    const n = ((e.attributes?.friendly_name as string | undefined) ?? e.entity_id).toLowerCase()
                    return !q || e.entity_id.toLowerCase().includes(q) || n.includes(q)
                  })
                  .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
                  .slice(0, 80)
                  .map((e) => {
                    const checked = draft.entityIds.includes(e.entity_id)
                    return (
                      <button
                        key={e.entity_id}
                        onClick={() => toggleMember(e.entity_id)}
                        className={cn('flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left', checked ? 'bg-[#0066cc]/12' : 'bg-black/[0.04]')}
                      >
                        <div className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-[#0066cc] bg-[#0066cc] text-white' : 'border-black/25')}>
                          {checked && <Check size={11} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[#1d1d1f]">{(e.attributes?.friendly_name as string | undefined) ?? e.entity_id}</p>
                          <p className="truncate font-mono text-[10px] text-black/35">{e.entity_id}</p>
                        </div>
                      </button>
                    )
                  })}
              </div>
            </div>

            <button
              onClick={saveDraft}
              disabled={!draft.label.trim() || draft.entityIds.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
            >
              <Save size={14} /> Salva gruppo
            </button>
          </div>
        )}
      </GlassSheet>
    </div>
  )
}

// ── Main SettingsPage ────────────────────────────────────────────────────────

export function SettingsPage() {
  const [section, setSection] = useState<Section>('preferences')

  const sections: { id: Section; label: string; icon: React.ElementType }[] = [
    { id: 'preferences', label: 'Preferenze', icon: User },
    { id: 'rooms', label: 'Stanze & Entità', icon: Home },
    { id: 'connection', label: 'Connessione HA', icon: Wifi },
    { id: 'admin', label: 'Admin', icon: ShieldCheck },
  ]

  return (
    <div className="flex flex-col h-full gap-4 overflow-y-auto">
      {/* Header */}
      <GlassCard className="flex items-center gap-3 shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-black/8">
          <Settings size={20} className="text-black/60" />
        </div>
        <div>
          <p className="text-base font-semibold text-black/90">Impostazioni</p>
          <p className="text-xs" style={{ color: tokens.text.tertiary }}>Configura la tua dashboard</p>
        </div>
      </GlassCard>

      <div className="flex flex-col md:flex-row gap-3 flex-1 min-h-0">
        {/* Nav */}
        <div className="hidden md:flex flex-col gap-1 w-48 shrink-0">
          {sections.map((s) => (
            <SectionTab key={s.id} {...s} active={section === s.id} onClick={() => setSection(s.id)} />
          ))}
        </div>

        {/* Mobile tab row */}
        <div className="flex md:hidden gap-2 w-full mb-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 rounded-[14px] py-2.5 text-xs font-medium min-h-[52px] transition-all',
                section === s.id ? 'bg-black/12 text-[#1d1d1f]' : 'bg-black/5 text-black/40',
              )}
            >
              <s.icon size={16} />
              {s.label.split(' ')[0]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={framerSpring}
            >
              {section === 'preferences' && <PreferencesSection />}
              {section === 'rooms' && <RoomsSection />}
              {section === 'connection' && <ConnectionSection />}
              {section === 'admin' && <AdminSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
