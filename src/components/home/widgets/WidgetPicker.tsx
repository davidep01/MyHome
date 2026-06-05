import { useMemo, useState } from 'react'
import { ChevronLeft, Check, Search } from 'lucide-react'
import { GlassSheet } from '../../glass/GlassSheet'
import { useEntityStore } from '../../../store/entities'
import { useDashboardConfig } from '../../../hooks/useDashboardConfig'
import { DOMAIN_TYPE } from '../../../hooks/useDiscoveredEntities'
import { WIDGET_META, WIDGET_ORDER, SIZE_LABEL } from './widgetCatalog'
import type { HomeWidget, WidgetSize, WidgetType } from '../../../api/backend'
import { uid } from '../../../lib/uid'
import { cn } from '../../../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onAdd: (widget: HomeWidget) => void
}

export function WidgetPicker({ open, onClose, onAdd }: Props) {
  const entities = useEntityStore((s) => s.entities)
  const { data: config } = useDashboardConfig()
  const [type, setType] = useState<WidgetType | null>(null)
  const [size, setSize] = useState<WidgetSize>('sm')
  const [bind, setBind] = useState<string>('')
  const [query, setQuery] = useState('')

  const meta = type ? WIDGET_META[type] : null

  const reset = () => { setType(null); setBind(''); setQuery('') }
  const close = () => { reset(); onClose() }

  const choose = (t: WidgetType) => {
    setType(t)
    setSize(WIDGET_META[t].sizes[0])
    setBind('')
  }

  // Candidate entities/groups for the binding step.
  const candidates = useMemo(() => {
    if (!meta?.needs) return []
    if (meta.needs === 'group') {
      return (config?.groups ?? []).map((g) => ({ id: g.id, name: g.label, sub: `${g.entityIds.length} entità` }))
    }
    const q = query.trim().toLowerCase()
    return Object.values(entities)
      .filter((e) => {
        const d = e.entity_id.split('.')[0]
        if (meta.needs === 'sensor') return d === 'sensor'
        if (meta.needs === 'camera') return d === 'camera'
        return Boolean(DOMAIN_TYPE[d]) // entity
      })
      .filter((e) => {
        const n = ((e.attributes?.friendly_name as string | undefined) ?? e.entity_id).toLowerCase()
        return !q || e.entity_id.toLowerCase().includes(q) || n.includes(q)
      })
      .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
      .slice(0, 60)
      .map((e) => ({ id: e.entity_id, name: (e.attributes?.friendly_name as string | undefined) ?? e.entity_id, sub: e.entity_id }))
  }, [meta, entities, config?.groups, query])

  const canAdd = type && (!meta?.needs || bind)

  const add = () => {
    if (!type || !canAdd) return
    const w: HomeWidget = { id: uid('w'), type, size }
    if (meta?.needs === 'group') w.groupId = bind
    else if (meta?.needs) w.entityId = bind
    onAdd(w)
    close()
  }

  return (
    <GlassSheet open={open} onClose={close} side="center" title={type ? WIDGET_META[type].label : 'Aggiungi widget'}>
      {!type ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {WIDGET_ORDER.map((t) => {
            const m = WIDGET_META[t]
            const Icon = m.Icon
            return (
              <button
                key={t}
                onClick={() => choose(t)}
                className="flex flex-col items-center gap-2 rounded-[16px] bg-black/[0.05] px-3 py-4 transition active:scale-95 hover:bg-black/[0.08]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-white">
                  <Icon size={20} className="text-[#0066cc]" />
                </div>
                <span className="text-xs font-medium text-[#1d1d1f]">{m.label}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={reset} className="flex items-center gap-1 text-sm text-[#0066cc]">
            <ChevronLeft size={16} /> Tutti i widget
          </button>

          {/* Size */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-black/50">Dimensione</p>
            <div className="flex gap-2">
              {meta!.sizes.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    'flex-1 rounded-[12px] py-2.5 text-sm font-medium transition',
                    size === s ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60',
                  )}
                >
                  {SIZE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Binding */}
          {meta!.needs && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-black/50">
                {meta!.needs === 'group' ? 'Gruppo' : meta!.needs === 'camera' ? 'Videocamera' : meta!.needs === 'sensor' ? 'Sensore' : 'Dispositivo'}
              </p>
              {meta!.needs !== 'group' && (
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cerca…"
                    className="w-full rounded-full border border-black/10 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0066cc]"
                  />
                </div>
              )}
              <div className="max-h-[34vh] space-y-1 overflow-y-auto pr-1">
                {candidates.length === 0 && <p className="px-1 py-4 text-center text-xs text-black/40">Nessuna opzione</p>}
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setBind(c.id)}
                    className={cn('flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left', bind === c.id ? 'bg-[#0066cc]/12' : 'bg-black/[0.04]')}
                  >
                    <div className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', bind === c.id ? 'border-[#0066cc] bg-[#0066cc] text-white' : 'border-black/25')}>
                      {bind === c.id && <Check size={11} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#1d1d1f]">{c.name}</p>
                      <p className="truncate font-mono text-[10px] text-black/35">{c.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={add}
            disabled={!canAdd}
            className="w-full rounded-[14px] bg-[#0066cc] py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
          >
            Aggiungi alla home
          </button>
        </div>
      )}
    </GlassSheet>
  )
}
