import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Boxes, Check, Eye, EyeOff, Layers, Pencil, Plus, Save, Search, Trash2, X,
} from 'lucide-react'
import { GlassCard } from '../components/glass/GlassCard'
import { GlassSheet } from '../components/glass/GlassSheet'
import { EntityCard } from '../components/widgets/WidgetGrid'
import { makeRoomEntity } from '../components/home/layers/makeRoomEntity'
import { stateLabel } from '../components/widgets/utils/stateLabel'
import { useDashboardConfig, useUpdateConfig } from '../hooks/useDashboardConfig'
import { useEntityStore } from '../store/entities'
import { haRegistry } from '../api/ha-registry'
import { iconExists } from '../lib/lucide'
import { uid } from '../lib/uid'
import { DynamicIcon } from '../components/DynamicIcon'
import { cn } from '../lib/utils'
import type { DeviceOverride, EntityGroup, EntityType } from '../api/backend'

const TYPE_OPTIONS: { value: EntityType; label: string }[] = [
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

type VisibilityFilter = 'all' | 'visible' | 'hidden' | 'unavailable'
const PAGE = 120

/**
 * Regia — Entità: IL workbench. Tabella unica di tutto ciò che HA espone, con
 * filtri (dominio/area/visibilità), ricerca, rinomina inline, bulk
 * nascondi/mostra, gruppi e pannello dettaglio con ANTEPRIMA LIVE della card:
 * vedi la card del kiosk mentre la configuri. Le aree arrivano dal registry
 * HA (lì si gestiscono): mai più entity_id digitati a mano.
 */
export function EntitiesPage() {
  const entities = useEntityStore((s) => s.entities)
  const connected = useEntityStore((s) => s.connectionStatus === 'connected')
  const { data: config } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()

  const { data: registry } = useQuery({
    queryKey: ['ha-registry-workbench'],
    enabled: connected,
    staleTime: 60_000,
    queryFn: async () => {
      const [areas, devices, regs] = await Promise.all([haRegistry.areas(), haRegistry.devices(), haRegistry.entities()])
      const deviceArea = new Map(devices.map((d) => [d.id, d.area_id]))
      const areaName = new Map(areas.map((a) => [a.area_id, a.name]))
      const byId = new Map(regs.map((r) => [r.entity_id, {
        areaName: (() => {
          const id = r.area_id ?? (r.device_id ? deviceArea.get(r.device_id) ?? null : null)
          return id ? areaName.get(id) : undefined
        })(),
        platform: r.platform ?? undefined,
        haHidden: r.hidden_by != null,
        category: r.entity_category ?? undefined,
      }]))
      return { byId, areaNames: [...areaName.values()].sort((a, b) => a.localeCompare(b)) }
    },
  })

  // ── Stato editabile (autosave 700ms, come il vecchio admin) ────────────────
  const [hidden, setHidden] = useState<string[]>([])
  const [overrides, setOverrides] = useState<Record<string, DeviceOverride>>({})
  const [groups, setGroups] = useState<EntityGroup[]>([])
  const seeded = useRef(false)
  useEffect(() => {
    if (!config || seeded.current) return
    seeded.current = true
    setHidden(config.hiddenEntities ?? [])
    setOverrides(config.deviceOverrides ?? {})
    setGroups(config.groups ?? [])
  }, [config])

  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    const t = setTimeout(() => update({ hiddenEntities: hidden, deviceOverrides: overrides, groups }), 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, overrides, groups])

  // ── Filtri ─────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('all')
  const [area, setArea] = useState('all')
  const [visibility, setVisibility] = useState<VisibilityFilter>('all')
  const [cap, setCap] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editId, setEditId] = useState<string | null>(null)
  const [groupDraft, setGroupDraft] = useState<EntityGroup | null>(null)
  const [groupQuery, setGroupQuery] = useState('')

  const domains = useMemo(
    () => [...new Set(Object.keys(entities).map((id) => id.split('.')[0]))].sort(),
    [entities],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hiddenSet = new Set(hidden)
    return Object.values(entities)
      .map((e) => {
        const meta = registry?.byId.get(e.entity_id)
        const ov = overrides[e.entity_id]
        return {
          id: e.entity_id,
          name: ov?.label || (e.attributes?.friendly_name as string | undefined) || e.entity_id,
          domain: e.entity_id.split('.')[0],
          state: e.state,
          areaName: meta?.areaName,
          platform: meta?.platform,
          isHidden: hiddenSet.has(e.entity_id) || ov?.enabled === false,
          haHidden: meta?.haHidden ?? false,
          hasOverride: Boolean(ov && Object.keys(ov).length),
        }
      })
      .filter((r) => domain === 'all' || r.domain === domain)
      .filter((r) => area === 'all' || r.areaName === area)
      .filter((r) =>
        visibility === 'all' ? true
          : visibility === 'visible' ? !r.isHidden && !r.haHidden
            : visibility === 'hidden' ? r.isHidden || r.haHidden
              : r.state === 'unavailable')
      .filter((r) => !q || r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [entities, registry, overrides, hidden, query, domain, area, visibility])

  const toggleHide = (ids: string[], hide: boolean) =>
    setHidden((h) => {
      const set = new Set(h)
      for (const id of ids) { if (hide) set.add(id); else set.delete(id) }
      return [...set]
    })

  const patchOverride = (id: string, patch: Partial<DeviceOverride>) =>
    setOverrides((o) => {
      const next: DeviceOverride = { ...(o[id] ?? {}), ...patch }
      ;(Object.keys(next) as (keyof DeviceOverride)[]).forEach((k) => {
        if (next[k] === '' || next[k] === undefined) delete next[k]
      })
      const out = { ...o, [id]: next }
      if (Object.keys(next).length === 0) delete out[id]
      return out
    })

  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const readOnly = config?.storage && !config.storage.writable

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">Entità</h1>
          <p className="mt-1 text-sm text-black/45">
            {rows.length} di {Object.keys(entities).length} · {hidden.length} nascoste
            {readOnly ? ' · sola lettura' : isPending ? ' · salvataggio…' : ' · salvataggio automatico'}
          </p>
        </div>
        <button
          onClick={() => { setGroupQuery(''); setGroupDraft({ id: uid('g'), label: '', entityIds: [] }) }}
          className="flex min-h-[44px] items-center gap-2 rounded-full bg-[#0066cc] px-4 text-sm font-semibold text-white transition active:scale-95"
        >
          <Layers size={15} /> Nuovo gruppo
        </button>
      </div>

      {/* Gruppi esistenti */}
      {groups.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2 rounded-full bg-black/[0.05] py-1.5 pl-3 pr-1.5">
              <DynamicIcon name={g.icon} fallback={Layers} size={14} className="text-black/50" />
              <span className="text-sm font-medium text-[#1d1d1f]">{g.label}</span>
              <span className="text-xs text-black/35">{g.entityIds.length}</span>
              <button onClick={() => { setGroupQuery(''); setGroupDraft({ ...g }) }} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black/55" aria-label="Modifica gruppo">
                <Pencil size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar filtri */}
      <GlassCard className="shrink-0 space-y-2.5 !py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCap(PAGE) }}
              placeholder="Cerca per nome o entity_id…"
              className="w-full rounded-full border border-black/10 bg-white py-2.5 pl-9 pr-4 text-sm text-[#1d1d1f] outline-none focus:border-[#0066cc]"
            />
          </div>
          <select value={domain} onChange={(e) => { setDomain(e.target.value); setCap(PAGE) }} className="min-h-[40px] rounded-full border border-black/10 bg-white px-3 text-sm text-black/70 outline-none">
            <option value="all">Tutti i domini</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={area} onChange={(e) => { setArea(e.target.value); setCap(PAGE) }} className="min-h-[40px] rounded-full border border-black/10 bg-white px-3 text-sm text-black/70 outline-none">
            <option value="all">Tutte le aree</option>
            {(registry?.areaNames ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="flex rounded-full bg-black/[0.05] p-1">
            {([['all', 'Tutte'], ['visible', 'Visibili'], ['hidden', 'Nascoste'], ['unavailable', 'Giù']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => { setVisibility(v); setCap(PAGE) }}
                className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition', visibility === v ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-black/45')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-[#0066cc]/8 px-3 py-2">
            <span className="text-sm font-semibold text-[#0066cc]">{selected.size} selezionate</span>
            <button onClick={() => { toggleHide([...selected], true); setSelected(new Set()) }} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black/60 active:scale-95">
              <EyeOff size={13} /> Nascondi
            </button>
            <button onClick={() => { toggleHide([...selected], false); setSelected(new Set()) }} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black/60 active:scale-95">
              <Eye size={13} /> Mostra
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-black/40">
              <X size={13} /> Annulla
            </button>
          </div>
        )}
      </GlassCard>

      {/* Tabella */}
      <GlassCard className="min-h-0 flex-1 overflow-y-auto !p-2">
        {rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-black/30">
            <Boxes size={28} />
            <p className="text-sm">Nessuna entità con questi filtri</p>
          </div>
        ) : (
          <div className="space-y-1">
            {rows.slice(0, cap).map((row) => (
              <EntityRow
                key={row.id}
                row={row}
                checked={selected.has(row.id)}
                onCheck={() => toggleSelect(row.id)}
                onRename={(label) => patchOverride(row.id, { label })}
                onToggleHide={() => toggleHide([row.id], !hidden.includes(row.id))}
                onEdit={() => setEditId(row.id)}
              />
            ))}
            {rows.length > cap && (
              <button onClick={() => setCap((c) => c + PAGE)} className="flex w-full min-h-[44px] items-center justify-center rounded-[12px] bg-black/[0.04] text-sm font-semibold text-black/50 active:scale-[0.99]">
                Mostra altre {Math.min(PAGE, rows.length - cap)} (su {rows.length - cap})
              </button>
            )}
          </div>
        )}
      </GlassCard>

      {/* Dettaglio con anteprima live */}
      <GlassSheet open={Boolean(editId)} onClose={() => setEditId(null)} title="Dispositivo" side="right">
        {editId && (
          <EntityDetail
            entityId={editId}
            override={overrides[editId]}
            isHidden={hidden.includes(editId)}
            meta={registry?.byId.get(editId)}
            onPatch={(patch) => patchOverride(editId, patch)}
            onToggleHide={() => toggleHide([editId], !hidden.includes(editId))}
          />
        )}
      </GlassSheet>

      {/* Editor gruppo */}
      <GlassSheet open={Boolean(groupDraft)} onClose={() => setGroupDraft(null)} title="Gruppo" side="right">
        {groupDraft && (
          <GroupEditor
            draft={groupDraft}
            setDraft={setGroupDraft}
            query={groupQuery}
            setQuery={setGroupQuery}
            onSave={() => {
              if (!groupDraft.label.trim() || groupDraft.entityIds.length === 0) return
              setGroups((gs) => (gs.some((g) => g.id === groupDraft.id) ? gs.map((g) => (g.id === groupDraft.id ? groupDraft : g)) : [...gs, groupDraft]))
              setGroupDraft(null)
            }}
            onDelete={() => {
              setGroups((gs) => gs.filter((g) => g.id !== groupDraft.id))
              setGroupDraft(null)
            }}
          />
        )}
      </GlassSheet>
    </div>
  )
}

// ── Riga ──────────────────────────────────────────────────────────────────────

interface RowData {
  id: string
  name: string
  domain: string
  state: string
  areaName?: string
  isHidden: boolean
  haHidden: boolean
  hasOverride: boolean
}

function EntityRow({
  row, checked, onCheck, onRename, onToggleHide, onEdit,
}: {
  row: RowData
  checked: boolean
  onCheck: () => void
  onRename: (label: string) => void
  onToggleHide: () => void
  onEdit: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.name)

  const commit = () => {
    setEditing(false)
    if (draft.trim() && draft !== row.name) onRename(draft.trim())
  }

  return (
    <div className={cn('flex min-h-[48px] items-center gap-2.5 rounded-[12px] px-2.5 py-1.5', row.isHidden || row.haHidden ? 'bg-black/[0.02] opacity-60' : 'bg-black/[0.04]')}>
      <button
        onClick={onCheck}
        className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border transition', checked ? 'border-[#0066cc] bg-[#0066cc] text-white' : 'border-black/25 bg-white')}
        aria-label="Seleziona"
      >
        {checked && <Check size={12} />}
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
            className="w-full rounded-[8px] bg-white px-2 py-1 text-sm text-[#1d1d1f] outline-none ring-1 ring-[#0066cc]"
          />
        ) : (
          <button onClick={() => { setDraft(row.name); setEditing(true) }} className="block w-full truncate text-left text-sm font-medium text-[#1d1d1f] hover:underline decoration-black/20" title="Rinomina">
            {row.name}{row.hasOverride && <span className="ml-1.5 align-middle text-[9px] font-bold uppercase text-[#0066cc]">mod</span>}
          </button>
        )}
        <p className="truncate font-mono text-[10px] text-black/30">{row.id}</p>
      </div>

      <span className="hidden shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-semibold text-black/45 md:block">{row.domain}</span>
      <span className="hidden w-24 shrink-0 truncate text-xs text-black/45 lg:block">{row.areaName ?? '—'}</span>
      <span className={cn('w-28 shrink-0 truncate text-right text-xs font-medium', row.state === 'unavailable' ? 'text-orange-600' : 'text-black/55')}>
        {stateLabel(row.state)}
      </span>

      <button
        onClick={onToggleHide}
        className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', row.isHidden ? 'bg-black/8 text-black/40' : 'bg-[#0066cc]/12 text-[#0066cc]')}
        aria-label={row.isHidden ? 'Mostra' : 'Nascondi'}
        title={row.haHidden ? 'Nascosta in Home Assistant' : undefined}
      >
        {row.isHidden || row.haHidden ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <button onClick={onEdit} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/55 hover:text-[#1d1d1f]" aria-label="Dettagli">
        <Pencil size={14} />
      </button>
    </div>
  )
}

// ── Dettaglio con anteprima live ─────────────────────────────────────────────

function EntityDetail({
  entityId, override, isHidden, meta, onPatch, onToggleHide,
}: {
  entityId: string
  override?: DeviceOverride
  isHidden: boolean
  meta?: { areaName?: string; platform?: string; haHidden: boolean; category?: string }
  onPatch: (patch: Partial<DeviceOverride>) => void
  onToggleHide: () => void
}) {
  const entities = useEntityStore((s) => s.entities)
  const overrides = useMemo(() => (override ? { [entityId]: override } : undefined), [entityId, override])

  return (
    <div className="space-y-4">
      {/* Anteprima live: la card ESATTAMENTE come appare sul kiosk */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Anteprima live</label>
        <div className="h-[170px] rounded-[18px] bg-[#f5f5f7] p-2">
          <EntityCard entity={makeRoomEntity(entityId, entities, overrides)} size="M" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <Meta label="Area HA" value={meta?.areaName ?? '—'} />
        <Meta label="Integrazione" value={meta?.platform ?? '—'} />
      </div>
      {meta?.haHidden && (
        <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700">Nascosta direttamente in Home Assistant.</p>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Nello strato "Adesso" del kiosk</label>
        <div className="flex rounded-full bg-black/[0.05] p-1">
          {([['', 'Auto'], ['always', 'Sempre'], ['never', 'Mai']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => onPatch({ hero: (v || undefined) as 'always' | 'never' | undefined })}
              className={cn(
                'min-h-[36px] flex-1 rounded-full text-xs font-semibold transition',
                (override?.hero ?? '') === v ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-black/45',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-black/35">Auto = il composer decide per rilevanza. Sempre = card fissa in evidenza. Mai = resta solo nelle stanze.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Nome</label>
        <input
          value={override?.label ?? ''}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={(entities[entityId]?.attributes?.friendly_name as string | undefined) ?? entityId}
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Tipo card</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => onPatch({ type: override?.type === t.value ? undefined : t.value })}
              className={cn('rounded-[10px] px-2 py-2 text-xs font-medium transition', override?.type === t.value ? 'bg-[#0066cc] text-white' : 'bg-black/8 text-black/60 hover:bg-black/12')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-black/35">Vuoto = tipo automatico dal dominio.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Icona (nome lucide)</label>
        <div className="flex items-center gap-2">
          <input
            value={override?.icon ?? ''}
            onChange={(e) => onPatch({ icon: e.target.value })}
            placeholder="es. lightbulb"
            className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
          />
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-black/8 text-black/60">
            {iconExists(override?.icon)
              ? <DynamicIcon name={override?.icon} fallback={Pencil} size={18} />
              : <span className="text-[10px] text-black/30">—</span>}
          </div>
        </div>
      </div>

      <button
        onClick={onToggleHide}
        className={cn('flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[14px] text-sm font-semibold transition active:scale-[0.99]', isHidden ? 'bg-[#0066cc] text-white' : 'bg-black/[0.07] text-black/60')}
      >
        {isHidden ? <><Eye size={15} /> Mostra in dashboard</> : <><EyeOff size={15} /> Nascondi dalla dashboard</>}
      </button>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-black/[0.05] px-2 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-black/30">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-black/65">{value}</p>
    </div>
  )
}

// ── Editor gruppo (spostato dal vecchio Admin) ───────────────────────────────

function GroupEditor({
  draft, setDraft, query, setQuery, onSave, onDelete,
}: {
  draft: EntityGroup
  setDraft: (d: EntityGroup | null) => void
  query: string
  setQuery: (q: string) => void
  onSave: () => void
  onDelete: () => void
}) {
  const entities = useEntityStore((s) => s.entities)

  const toggleMember = (id: string) =>
    setDraft({ ...draft, entityIds: draft.entityIds.includes(id) ? draft.entityIds.filter((x) => x !== id) : [...draft.entityIds, id] })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Nome gruppo</label>
        <input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="es. Luci salotto"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-black/50">Tipo</label>
          <select
            value={draft.type ?? ''}
            onChange={(e) => setDraft({ ...draft, type: (e.target.value || undefined) as EntityType | undefined })}
            className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
          >
            <option value="">Auto</option>
            {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-black/50">Icona</label>
          <input
            value={draft.icon ?? ''}
            onChange={(e) => setDraft({ ...draft, icon: e.target.value || undefined })}
            placeholder="es. sofa"
            className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-black/50">Membri ({draft.entityIds.length})</label>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca entità…"
            className="w-full rounded-full border border-black/10 bg-white py-2 pl-9 pr-3 text-sm text-[#1d1d1f] outline-none focus:border-[#0066cc]"
          />
        </div>
        <div className="max-h-[34vh] space-y-1 overflow-y-auto pr-1">
          {Object.values(entities)
            .filter((e) => {
              const q = query.trim().toLowerCase()
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

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={!draft.label.trim() || draft.entityIds.length === 0}
          className="flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
        >
          <Save size={14} /> Salva gruppo
        </button>
        <button onClick={onDelete} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-red-500/10 text-red-500 active:scale-95" aria-label="Elimina gruppo">
          <Trash2 size={15} />
        </button>
        <button onClick={() => setDraft(null)} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-black/8 text-black/50 active:scale-95" aria-label="Chiudi">
          <Plus size={15} className="rotate-45" />
        </button>
      </div>
    </div>
  )
}
