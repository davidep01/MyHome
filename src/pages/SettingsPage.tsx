import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, User, Wifi, Plus, Trash2,
  ChevronRight, Save, X, Home,
} from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { GlassSheet } from '../components/glass/GlassSheet'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import {
  useRooms, useCreateRoom, useDeleteRoom, useAddEntity, useRemoveEntity,
} from '../hooks/useRooms'
import type { Room, RoomEntity } from '../api/backend'
import { framerSpring, tokens } from '../design/tokens'
import { cn } from '../lib/utils'

type Section = 'preferences' | 'rooms' | 'connection'

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
        active ? 'bg-white/12 text-white' : 'text-white/50 hover:text-white/75 hover:bg-white/6',
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
  if (!config) return <p className="text-sm text-white/40">Caricamento...</p>

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
      <label className="text-xs font-medium text-white/50">{label}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-[12px] bg-white/8 px-3 py-3 text-sm text-white placeholder-white/25 outline-none focus:bg-white/12 transition-colors min-h-[44px]"
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
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-blue-500 min-h-[44px] px-4 text-sm font-semibold text-white hover:bg-blue-400 transition-colors"
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
  if (!config) return <p className="text-sm text-white/40">Caricamento...</p>

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
        <div className="rounded-[14px] border border-white/10 bg-white/6 p-3">
          <p className="text-xs leading-relaxed text-white/45">
            Questo deploy è in sola lettura: le modifiche a stanze, entità e preferenze non vengono salvate qui.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[12px] bg-white/6 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/25">URL</p>
          <p className="mt-1 text-xs font-semibold text-white/65">{config.haConfigSource?.url ?? 'db'}</p>
        </div>
        <div className="rounded-[12px] bg-white/6 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-white/25">Token</p>
          <p className="mt-1 text-xs font-semibold text-white/65">{config.haConfigSource?.token ?? 'missing'}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/50">Home Assistant URL</label>
        <input
          value={haUrl}
          onChange={(e) => setHaUrl(e.target.value)}
          disabled={urlLocked}
          placeholder="http://homeassistant.local:8123"
          className="w-full rounded-[12px] bg-white/8 px-3 py-3 text-sm text-white placeholder-white/25 outline-none focus:bg-white/12 disabled:opacity-45 transition-colors min-h-[44px] font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/50">Token (lascia vuoto per non modificarlo)</label>
        <input
          type="password"
          value={haToken}
          onChange={(e) => setHaToken(e.target.value)}
          disabled={tokenLocked}
          placeholder="••••••••••••"
          className="w-full rounded-[12px] bg-white/8 px-3 py-3 text-sm text-white placeholder-white/25 outline-none focus:bg-white/12 disabled:opacity-45 transition-colors min-h-[44px] font-mono"
        />
      </div>
      <button
        onClick={() => update({ haUrl, ...(haToken ? { haToken } : {}) })}
        disabled={isPending || (urlLocked && tokenLocked)}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-blue-500 min-h-[44px] px-4 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50 transition-colors"
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
        <label className="text-xs font-medium text-white/50">Entity ID (da Home Assistant)</label>
        <input
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          placeholder="es. light.soggiorno"
          className="w-full rounded-[12px] bg-white/8 px-3 py-3 text-sm text-white placeholder-white/25 outline-none focus:bg-white/12 transition-colors min-h-[44px] font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/50">Nome visualizzato</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="es. Luce soggiorno"
          className="w-full rounded-[12px] bg-white/8 px-3 py-3 text-sm text-white placeholder-white/25 outline-none focus:bg-white/12 transition-colors min-h-[44px]"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-white/50">Tipo widget</label>
        <div className="grid grid-cols-3 gap-2">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'rounded-[10px] py-2.5 text-xs font-medium transition-all min-h-[44px]',
                type === t ? 'bg-blue-500 text-white' : 'bg-white/8 text-white/60 hover:bg-white/12',
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
        className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-blue-500 min-h-[44px] text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-40 transition-colors"
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
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-white/8 text-white/50">
            <Home size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/90">{room.label}</p>
            <p className="text-xs" style={{ color: tokens.text.tertiary }}>{room.entities.length} entità</p>
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/8 text-white/50 hover:text-white transition-colors"
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
              <div className="space-y-1.5 pt-2 border-t border-white/8">
                {room.entities.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 rounded-[10px] bg-white/5 px-3 py-2">
                    <span className="text-xs font-mono text-white/60 flex-1 truncate">{e.entityId}</span>
                    <span className="text-[10px] text-white/30 px-1.5 py-0.5 rounded-full bg-white/8">{e.type}</span>
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
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-white/8 min-h-[44px] text-xs font-medium text-white/60 hover:bg-white/12 hover:text-white transition-colors"
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

  if (isLoading) return <p className="text-sm text-white/40">Caricamento...</p>

  return (
    <div className="space-y-4">
      {/* Add room form */}
      <GlassCard className="space-y-3">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Nuova stanza</p>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="es. Studio"
          className="w-full rounded-[12px] bg-white/8 px-3 py-3 text-sm text-white placeholder-white/25 outline-none focus:bg-white/12 min-h-[44px]"
        />
        <div className="flex gap-2 flex-wrap">
          {ROOM_ICONS.map((icon) => (
            <button
              key={icon}
              onClick={() => setNewIcon(icon)}
              className={cn(
                'px-3 min-h-[36px] rounded-[10px] text-xs font-mono transition-all',
                newIcon === icon ? 'bg-blue-500 text-white' : 'bg-white/8 text-white/50 hover:bg-white/12',
              )}
            >
              {icon}
            </button>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={isPending || !newLabel.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-blue-500 min-h-[44px] text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-40 transition-colors"
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

// ── Main SettingsPage ────────────────────────────────────────────────────────

export function SettingsPage() {
  const [section, setSection] = useState<Section>('preferences')

  const sections: { id: Section; label: string; icon: React.ElementType }[] = [
    { id: 'preferences', label: 'Preferenze', icon: User },
    { id: 'rooms', label: 'Stanze & Entità', icon: Home },
    { id: 'connection', label: 'Connessione HA', icon: Wifi },
  ]

  return (
    <div className="flex flex-col h-full gap-4 overflow-y-auto">
      {/* Header */}
      <GlassCard className="flex items-center gap-3 shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/8">
          <Settings size={20} className="text-white/60" />
        </div>
        <div>
          <p className="text-base font-semibold text-white/90">Impostazioni</p>
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
                section === s.id ? 'bg-white/12 text-white' : 'bg-white/5 text-white/40',
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
