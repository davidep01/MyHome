import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  const { data: config, isPending: configPending, isError: configError, error: configQueryError } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()

  const { data: registry, isPending: registryPending, isError: registryError } = useQuery({
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

  // ── Stato editabile (autosave affidabile e serializzato) ───────────────────
  const [hidden, setHidden] = useState<string[]>([])
  const [overrides, setOverrides] = useState<Record<string, DeviceOverride>>({})
  const [groups, setGroups] = useState<EntityGroup[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const seeded = useRef(false)
  const draftRef = useRef({ hiddenEntities: hidden, deviceOverrides: overrides, groups })
  const savedSignature = useRef('')
  const queuedSignature = useRef('')
  const saveSequence = useRef(0)
  const updateRef = useRef(update)
  const writableRef = useRef(true)

  useEffect(() => { updateRef.current = update }, [update])
  useEffect(() => {
    draftRef.current = { hiddenEntities: hidden, deviceOverrides: overrides, groups }
  }, [hidden, overrides, groups])

  useEffect(() => {
    if (!config) return
    const incoming = {
      hiddenEntities: config.hiddenEntities ?? [],
      deviceOverrides: config.deviceOverrides ?? {},
      groups: config.groups ?? [],
    }
    const incomingSignature = JSON.stringify(incoming)
    const currentSignature = JSON.stringify(draftRef.current)

    // Accept live changes made by another LAN client only while this editor is
    // clean; never replace an unsaved local draft underneath the user.
    if (!seeded.current || currentSignature === savedSignature.current) {
      seeded.current = true
      savedSignature.current = incomingSignature
      queuedSignature.current = incomingSignature
      draftRef.current = incoming
      setHidden(incoming.hiddenEntities)
      setOverrides(incoming.deviceOverrides)
      setGroups(incoming.groups)
      setSaveState('idle')
    }
  }, [config])

  const readOnly = Boolean(config?.storage && !config.storage.writable)
  useEffect(() => { writableRef.current = !readOnly }, [readOnly])

  const persistDraft = (payload = draftRef.current, signature = JSON.stringify(payload)) => {
    if (!seeded.current || !writableRef.current || signature === savedSignature.current) return
    queuedSignature.current = signature
    const sequence = ++saveSequence.current
    setSaveState('saving')
    updateRef.current(payload, {
      onSuccess: () => {
        savedSignature.current = signature
        if (sequence === saveSequence.current) setSaveState('saved')
      },
      onError: () => {
        if (sequence === saveSequence.current) {
          queuedSignature.current = ''
          setSaveState('error')
        }
      },
    })
  }

  useEffect(() => {
    if (!seeded.current || readOnly) return
    const payload = { hiddenEntities: hidden, deviceOverrides: overrides, groups }
    const signature = JSON.stringify(payload)
    draftRef.current = payload
    if (signature === savedSignature.current) {
      queuedSignature.current = signature
      setSaveState('saved')
      return
    }
    if (signature === queuedSignature.current) return
    setSaveState('saving')
    const t = window.setTimeout(() => persistDraft(payload, signature), 700)
    return () => clearTimeout(t)
  }, [hidden, overrides, groups, readOnly])

  useEffect(() => () => {
    const payload = draftRef.current
    const signature = JSON.stringify(payload)
    if (seeded.current && writableRef.current && signature !== savedSignature.current && signature !== queuedSignature.current) {
      updateRef.current(payload)
    }
  }, [])

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

  if (configPending && !config) {
    return <div className="flex h-full items-center justify-center text-sm text-black/45" role="status">Caricamento delle entità…</div>
  }

  if (configError && !config) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center" role="alert">
        <AlertMessage error={configQueryError} fallback="Configurazione non disponibile. Controlla il servizio MyHome in LAN." />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#1d1d1f] sm:text-3xl">Entità</h1>
          <p className="mt-1 text-sm text-black/45" aria-live="polite">
            {rows.length} di {Object.keys(entities).length} · {hidden.length} nascoste
            {readOnly ? ' · sola lettura' : saveState === 'saving' || isPending ? ' · salvataggio…' : saveState === 'error' ? ' · salvataggio non riuscito' : saveState === 'saved' ? ' · salvato' : ' · salvataggio automatico'}
          </p>
          {saveState === 'error' && !readOnly && (
            <button type="button" onClick={() => persistDraft()} className="mt-1 min-h-[44px] text-sm font-semibold text-red-600 underline underline-offset-2">
              Riprova il salvataggio
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setGroupQuery(''); setGroupDraft({ id: uid('g'), label: '', entityIds: [] }) }}
          disabled={readOnly}
          className="flex min-h-[44px] items-center gap-2 rounded-full bg-[#0066cc] px-4 text-sm font-semibold text-white transition active:scale-95"
        >
          <Layers size={15} /> Nuovo gruppo
        </button>
      </div>
      {configError && config && (
        <p className="shrink-0 rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="alert">
          Sincronizzazione della configurazione interrotta: sono visibili gli ultimi dati disponibili.
        </p>
      )}

      {/* Gruppi esistenti */}
      {groups.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2 rounded-full bg-black/[0.05] py-1.5 pl-3 pr-1.5">
              <DynamicIcon name={g.icon} fallback={Layers} size={14} className="text-black/50" />
              <span className="text-sm font-semibold text-[#1d1d1f]">{g.label}</span>
              <span className="text-xs text-black/35">{g.entityIds.length}</span>
              <button type="button" onClick={() => { setGroupQuery(''); setGroupDraft({ ...g }) }} disabled={readOnly} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black/55" aria-label={`Modifica gruppo ${g.label}`}>
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
            <label htmlFor="entities-search" className="sr-only">Cerca entità</label>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
            <input
              id="entities-search"
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCap(PAGE) }}
              placeholder="Cerca per nome o entity_id…"
              className="min-h-[44px] w-full rounded-full border border-black/10 bg-white py-2.5 pl-9 pr-4 text-sm text-[#1d1d1f] outline-none focus:border-[#0066cc]"
            />
          </div>
          <label htmlFor="entities-domain" className="sr-only">Filtra per dominio</label>
          <select id="entities-domain" aria-label="Filtra per dominio" value={domain} onChange={(e) => { setDomain(e.target.value); setCap(PAGE) }} className="min-h-[44px] rounded-full border border-black/10 bg-white px-3 text-sm text-black/70 outline-none">
            <option value="all">Tutti i domini</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <label htmlFor="entities-area" className="sr-only">Filtra per area</label>
          <select id="entities-area" aria-label="Filtra per area" value={area} onChange={(e) => { setArea(e.target.value); setCap(PAGE) }} className="min-h-[44px] rounded-full border border-black/10 bg-white px-3 text-sm text-black/70 outline-none">
            <option value="all">Tutte le aree</option>
            {(registry?.areaNames ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="flex rounded-full bg-black/[0.05] p-1" role="group" aria-label="Filtra per visibilità">
            {([['all', 'Tutte'], ['visible', 'Visibili'], ['hidden', 'Nascoste'], ['unavailable', 'Giù']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => { setVisibility(v); setCap(PAGE) }}
                aria-pressed={visibility === v}
                className={cn('min-h-[44px] rounded-full px-3 py-1.5 text-xs font-semibold transition', visibility === v ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-black/45')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-[#0066cc]/8 px-3 py-2">
            <span className="text-sm font-semibold text-[#0066cc]">{selected.size} selezionate</span>
            <button type="button" disabled={readOnly} onClick={() => { toggleHide([...selected], true); setSelected(new Set()) }} className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black/60 active:scale-95">
              <EyeOff size={13} /> Nascondi
            </button>
            <button type="button" disabled={readOnly} onClick={() => { toggleHide([...selected], false); setSelected(new Set()) }} className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black/60 active:scale-95">
              <Eye size={13} /> Mostra
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto flex min-h-[44px] items-center gap-1 rounded-full px-2 py-1.5 text-xs text-black/40">
              <X size={13} /> Annulla
            </button>
          </div>
        )}
      </GlassCard>

      {/* Tabella */}
      <GlassCard className="min-h-0 flex-1 overflow-y-auto !p-2">
        {!connected && Object.keys(entities).length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-black/40" role="status">
            <Boxes size={28} />
            <p className="text-sm font-semibold text-black/55">Home Assistant non è connesso</p>
            <p className="max-w-sm text-xs">Verifica la connessione nella pagina Sistema. MyHome comunica con Home Assistant direttamente nella rete LAN.</p>
          </div>
        ) : registryPending && connected && Object.keys(entities).length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-black/45" role="status">Caricamento del registro Home Assistant…</div>
        ) : rows.length === 0 ? (
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
                disabled={readOnly}
                onCheck={() => toggleSelect(row.id)}
                onRename={(label) => patchOverride(row.id, { label })}
                onToggleHide={() => toggleHide([row.id], !hidden.includes(row.id))}
                onEdit={() => setEditId(row.id)}
              />
            ))}
            {rows.length > cap && (
              <button type="button" onClick={() => setCap((c) => c + PAGE)} className="flex w-full min-h-[44px] items-center justify-center rounded-[12px] bg-black/[0.04] text-sm font-semibold text-black/50 active:scale-[0.99]">
                Mostra altre {Math.min(PAGE, rows.length - cap)} (su {rows.length - cap})
              </button>
            )}
          </div>
        )}
        {registryError && connected && (
          <p className="sticky bottom-0 m-2 rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="alert">
            Il registro Home Assistant non è disponibile: area e integrazione potrebbero mancare, ma le entità live restano utilizzabili.
          </p>
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
            disabled={readOnly}
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
            disabled={readOnly}
            canDelete={groups.some((g) => g.id === groupDraft.id)}
            onSave={() => {
              if (!groupDraft.label.trim() || groupDraft.entityIds.length === 0) return
              setGroups((gs) => (gs.some((g) => g.id === groupDraft.id) ? gs.map((g) => (g.id === groupDraft.id ? groupDraft : g)) : [...gs, groupDraft]))
              setGroupDraft(null)
            }}
            onDelete={() => {
              if (groups.some((g) => g.id === groupDraft.id) && !window.confirm(`Eliminare il gruppo “${groupDraft.label}”?`)) return
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
  row, checked, disabled, onCheck, onRename, onToggleHide, onEdit,
}: {
  row: RowData
  checked: boolean
  disabled: boolean
  onCheck: () => void
  onRename: (label: string) => void
  onToggleHide: () => void
  onEdit: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.name)
  const skipBlurCommit = useRef(false)

  const commit = () => {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false
      return
    }
    setEditing(false)
    if (draft.trim() && draft !== row.name) onRename(draft.trim())
  }

  return (
    <div className={cn('flex min-h-[48px] items-center gap-2.5 rounded-[12px] px-2.5 py-1.5', row.isHidden || row.haHidden ? 'bg-black/[0.02] opacity-60' : 'bg-black/[0.04]')}>
      <button
        type="button"
        onClick={onCheck}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        aria-label={`${checked ? 'Deseleziona' : 'Seleziona'} ${row.name}`}
        aria-pressed={checked}
      >
        <span className={cn('flex h-5 w-5 items-center justify-center rounded border transition', checked ? 'border-[#0066cc] bg-[#0066cc] text-white' : 'border-black/25 bg-white')}>
          {checked && <Check size={12} />}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            aria-label={`Rinomina ${row.name}`}
            disabled={disabled}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                skipBlurCommit.current = true
                setDraft(row.name)
                setEditing(false)
              }
            }}
            className="w-full rounded-[8px] bg-white px-2 py-1 text-sm text-[#1d1d1f] outline-none ring-1 ring-[#0066cc]"
          />
        ) : (
          <button type="button" disabled={disabled} onClick={() => { skipBlurCommit.current = false; setDraft(row.name); setEditing(true) }} className="block min-h-[44px] w-full truncate text-left text-sm font-semibold text-[#1d1d1f] hover:underline decoration-black/20" aria-label={`Rinomina ${row.name}`}>
            {row.name}{row.hasOverride && <span className="ml-1.5 align-middle text-[9px] font-bold uppercase text-[#0066cc]">mod</span>}
          </button>
        )}
        <p className="truncate font-mono text-[10px] text-black/30">
          {row.id}<span className={cn('font-sans sm:hidden', row.state === 'unavailable' ? 'text-orange-600' : 'text-black/45')}> · {stateLabel(row.state)}</span>
        </p>
      </div>

      <span className="hidden shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-semibold text-black/45 md:block">{row.domain}</span>
      <span className="hidden w-24 shrink-0 truncate text-xs text-black/45 lg:block">{row.areaName ?? '—'}</span>
      <span className={cn('hidden w-28 shrink-0 truncate text-right text-xs font-semibold sm:block', row.state === 'unavailable' ? 'text-orange-600' : 'text-black/55')}>
        {stateLabel(row.state)}
      </span>

      <button
        type="button"
        onClick={onToggleHide}
        disabled={disabled || row.haHidden}
        className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', row.isHidden ? 'bg-black/8 text-black/40' : 'bg-[#0066cc]/12 text-[#0066cc]')}
        aria-label={row.haHidden ? `${row.name} è nascosta in Home Assistant` : `${row.isHidden ? 'Mostra' : 'Nascondi'} ${row.name}`}
        title={row.haHidden ? 'Nascosta in Home Assistant' : undefined}
      >
        {row.isHidden || row.haHidden ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <button type="button" onClick={onEdit} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/55 hover:text-[#1d1d1f]" aria-label={`Dettagli ${row.name}`}>
        <Pencil size={14} />
      </button>
    </div>
  )
}

// ── Dettaglio con anteprima live ─────────────────────────────────────────────

function EntityDetail({
  entityId, override, isHidden, meta, disabled, onPatch, onToggleHide,
}: {
  entityId: string
  override?: DeviceOverride
  isHidden: boolean
  meta?: { areaName?: string; platform?: string; haHidden: boolean; category?: string }
  disabled: boolean
  onPatch: (patch: Partial<DeviceOverride>) => void
  onToggleHide: () => void
}) {
  const entities = useEntityStore((s) => s.entities)
  const overrides = useMemo(() => (override ? { [entityId]: override } : undefined), [entityId, override])
  const id = useId()

  return (
    <div className="space-y-4">
      {disabled && <p className="rounded-[10px] bg-orange-500/10 px-3 py-2 text-xs text-orange-700" role="status">Configurazione in sola lettura: puoi consultare l’entità, ma non modificarla.</p>}
      {/* Anteprima live: la card ESATTAMENTE come appare sul kiosk */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-black/50">Anteprima live</p>
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
        <p className="text-xs font-semibold text-black/50" id={`${id}-hero-label`}>Nello strato “Adesso” del kiosk</p>
        <div className="flex rounded-full bg-black/[0.05] p-1" role="group" aria-labelledby={`${id}-hero-label`}>
          {([['', 'Auto'], ['always', 'Sempre'], ['never', 'Mai']] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onPatch({ hero: (v || undefined) as 'always' | 'never' | undefined })}
              aria-pressed={(override?.hero ?? '') === v}
              className={cn(
                'min-h-[44px] flex-1 rounded-full text-xs font-semibold transition',
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
        <label htmlFor={`${id}-name`} className="text-xs font-semibold text-black/50">Nome</label>
        <input
          id={`${id}-name`}
          value={override?.label ?? ''}
          disabled={disabled}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={(entities[entityId]?.attributes?.friendly_name as string | undefined) ?? entityId}
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-black/50" id={`${id}-type-label`}>Tipo card</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={`${id}-type-label`}>
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              disabled={disabled}
              onClick={() => onPatch({ type: override?.type === t.value ? undefined : t.value })}
              aria-pressed={override?.type === t.value}
              className={cn('min-h-[44px] rounded-[10px] px-2 py-2 text-xs font-semibold transition', override?.type === t.value ? 'bg-[#0066cc] text-white' : 'bg-black/8 text-black/60 hover:bg-black/12')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-black/35">Vuoto = tipo automatico dal dominio.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-icon`} className="text-xs font-semibold text-black/50">Icona (nome Lucide)</label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-icon`}
            value={override?.icon ?? ''}
            disabled={disabled}
            onChange={(e) => onPatch({ icon: e.target.value })}
            placeholder="es. lightbulb"
            className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
          />
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-black/8 text-black/60" aria-hidden="true">
            {iconExists(override?.icon)
              ? <DynamicIcon name={override?.icon} fallback={Pencil} size={18} />
              : <span className="text-[10px] text-black/30">—</span>}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleHide}
        disabled={disabled || meta?.haHidden}
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
  draft, setDraft, query, setQuery, disabled, canDelete, onSave, onDelete,
}: {
  draft: EntityGroup
  setDraft: (d: EntityGroup | null) => void
  query: string
  setQuery: (q: string) => void
  disabled: boolean
  canDelete: boolean
  onSave: () => void
  onDelete: () => void
}) {
  const entities = useEntityStore((s) => s.entities)
  const id = useId()

  const matchingEntities = useMemo(() => Object.values(entities)
    .filter((e) => {
      const q = query.trim().toLowerCase()
      const n = ((e.attributes?.friendly_name as string | undefined) ?? e.entity_id).toLowerCase()
      return !q || e.entity_id.toLowerCase().includes(q) || n.includes(q)
    })
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id)), [entities, query])
  const filteredEntities = matchingEntities.slice(0, 80)

  const toggleMember = (id: string) =>
    setDraft({ ...draft, entityIds: draft.entityIds.includes(id) ? draft.entityIds.filter((x) => x !== id) : [...draft.entityIds, id] })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-name`} className="text-xs font-semibold text-black/50">Nome gruppo</label>
        <input
          id={`${id}-name`}
          value={draft.label}
          disabled={disabled}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="es. Luci salotto"
          className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-type`} className="text-xs font-semibold text-black/50">Tipo</label>
          <select
            id={`${id}-type`}
            value={draft.type ?? ''}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, type: (e.target.value || undefined) as EntityType | undefined })}
            className="w-full rounded-[12px] bg-black/8 px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
          >
            <option value="">Auto</option>
            {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-icon`} className="text-xs font-semibold text-black/50">Icona</label>
          <input
            id={`${id}-icon`}
            value={draft.icon ?? ''}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, icon: e.target.value || undefined })}
            placeholder="es. sofa"
            className="w-full rounded-[12px] bg-black/8 px-3 py-3 font-mono text-sm text-[#1d1d1f] outline-none focus:bg-black/12 min-h-[44px]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-members`} className="text-xs font-semibold text-black/50">Membri ({draft.entityIds.length})</label>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
          <input
            id={`${id}-members`}
            type="search"
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca entità…"
            className="min-h-[44px] w-full rounded-full border border-black/10 bg-white py-2 pl-9 pr-3 text-sm text-[#1d1d1f] outline-none focus:border-[#0066cc]"
          />
        </div>
        <div className="max-h-[34vh] space-y-1 overflow-y-auto pr-1">
          {filteredEntities.length === 0 && <p className="py-4 text-center text-sm text-black/40">Nessuna entità corrisponde alla ricerca.</p>}
          {filteredEntities.map((e) => {
              const checked = draft.entityIds.includes(e.entity_id)
              return (
                <button
                  key={e.entity_id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleMember(e.entity_id)}
                  aria-pressed={checked}
                  className={cn('flex min-h-[44px] w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left', checked ? 'bg-[#0066cc]/12' : 'bg-black/[0.04]')}
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
          {matchingEntities.length > filteredEntities.length && (
            <p className="py-2 text-center text-[11px] text-black/40">Mostrate le prime 80 di {matchingEntities.length}; restringi la ricerca per trovare le altre.</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || !draft.label.trim() || draft.entityIds.length === 0}
          className="flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#0066cc] text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
        >
          <Save size={14} /> Salva gruppo
        </button>
        {canDelete && (
          <button type="button" onClick={onDelete} disabled={disabled} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-red-500/10 text-red-500 active:scale-95" aria-label={`Elimina gruppo ${draft.label}`}>
            <Trash2 size={15} />
          </button>
        )}
        <button type="button" onClick={() => setDraft(null)} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-black/8 text-black/50 active:scale-95" aria-label="Chiudi senza salvare">
          <Plus size={15} className="rotate-45" />
        </button>
      </div>
    </div>
  )
}

function AlertMessage({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <p className="max-w-md rounded-[12px] bg-red-500/10 px-4 py-3 text-sm text-red-700">
      {error instanceof Error && error.message ? `${fallback} (${error.message})` : fallback}
    </p>
  )
}
