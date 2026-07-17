import { useMemo, useState } from 'react'
import { Check, Layers, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { GlassSheet } from '../../glass/GlassSheet'
import { DynamicIcon } from '../../DynamicIcon'
import { useDiscoveredEntities } from '../../../hooks/useDiscoveredEntities'
import { WIDGET_META } from './widgetCatalog'
import { uid } from '../../../lib/uid'
import { cn } from '../../../lib/utils'
import type { EntityGroup, HomeWidget, TabletDashboardLayout, WidgetType } from '../../../api/backend'

/** Widget "informativi/casa" proposti nel picker (i device arrivano dalla discovery). */
const STATIC_WIDGETS: WidgetType[] = [
  'clock', 'weather', 'quickStats', 'scenes', 'status',
  'security', 'people', 'calendar', 'news', 'insight', 'system',
]

/** Questi widget hanno senso una sola volta sulla home: già presenti → disabilitati. */
const SINGLETON = new Set<WidgetType>(STATIC_WIDGETS)

function makeWidget(type: WidgetType, opts?: { entityId?: string; groupId?: string }): HomeWidget {
  return {
    id: uid('w'),
    type,
    size: WIDGET_META[type].sizes[0],
    ...(opts?.entityId ? { entityId: opts.entityId } : {}),
    ...(opts?.groupId ? { groupId: opts.groupId } : {}),
  }
}

/**
 * Picker di aggiunta widget alla home (grid mode): un bottom sheet con i widget
 * informativi in griglia e, sotto, i dispositivi reali scoperti da Home
 * Assistant con ricerca. Ogni voce già presente resta visibile ma spuntata,
 * così si capisce cosa c'è senza doverlo cercare nella home.
 */
type Curation = Pick<TabletDashboardLayout, 'hiddenEntities' | 'deviceOverrides' | 'groups'>

export function WidgetPicker({
  open,
  onClose,
  existing,
  onAdd,
  curation,
}: {
  open: boolean
  onClose: () => void
  existing: HomeWidget[]
  onAdd: (widget: HomeWidget) => void
  /** Public curation from the tablet layout: keeps the picker admin-config free. */
  curation?: Curation
}) {
  const { sections } = useDiscoveredEntities(curation)
  const configGroups: EntityGroup[] = curation?.groups ?? []
  const [query, setQuery] = useState('')

  const presentTypes = useMemo(() => new Set(existing.map((w) => w.type)), [existing])
  const presentEntities = useMemo(() => new Set(existing.map((w) => w.entityId).filter(Boolean)), [existing])
  const presentGroups = useMemo(() => new Set(existing.map((w) => w.groupId).filter(Boolean)), [existing])

  const q = query.trim().toLowerCase()
  const deviceMatches = useMemo(() => {
    return sections
      .map((section) => ({
        label: section.label,
        entities: section.entities.filter((e) => !q || e.label.toLowerCase().includes(q) || e.entityId.toLowerCase().includes(q)),
      }))
      .filter((section) => section.entities.length > 0)
  }, [sections, q])

  const groups = configGroups.filter((g) => !q || g.label.toLowerCase().includes(q))

  return (
    <GlassSheet open={open} onClose={onClose} side="bottom" wide title="Aggiungi alla home">
      <div className="space-y-6 pb-2">
        {/* Widget informativi */}
        <section className="space-y-2">
          <h3 className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-black/40">Widget</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STATIC_WIDGETS.map((type) => {
              const meta = WIDGET_META[type]
              const Icon = meta.Icon
              const added = SINGLETON.has(type) && presentTypes.has(type)
              return (
                <button
                  key={type}
                  type="button"
                  disabled={added}
                  onClick={() => onAdd(makeWidget(type))}
                  className={cn(
                    'flex min-h-[64px] items-center gap-3 rounded-[14px] border border-black/[0.06] bg-white/70 px-3 py-2.5 text-left transition active:scale-[0.98]',
                    added ? 'opacity-45' : 'hover:bg-white',
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-black/[0.05] text-black/60">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#1d1d1f]">{meta.label}</span>
                  </span>
                  {added && <Check size={16} className="shrink-0 text-[#0066cc]" aria-label="Già presente" />}
                </button>
              )
            })}
          </div>
        </section>

        {/* Ricerca dispositivi */}
        <section className="space-y-2">
          <h3 className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-black/40">Dispositivi</h3>
          <div className="flex items-center gap-2 rounded-[12px] bg-black/[0.05] px-3">
            <Search size={16} className="shrink-0 text-black/35" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca una luce, un sensore, una camera…"
              aria-label="Cerca un dispositivo da aggiungere"
              className="min-h-[44px] w-full bg-transparent text-sm text-[#1d1d1f] outline-none placeholder:text-black/35"
            />
          </div>

          {groups.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="px-0.5 text-[11px] font-semibold text-black/35">Gruppi</p>
              {groups.map((group) => {
                const added = presentGroups.has(group.id)
                return (
                  <DeviceRow
                    key={group.id}
                    label={group.label}
                    icon={group.icon}
                    fallbackIcon={Layers}
                    added={added}
                    onAdd={() => onAdd(makeWidget('group', { groupId: group.id }))}
                  />
                )
              })}
            </div>
          )}

          {deviceMatches.length === 0 && groups.length === 0 ? (
            <p className="px-0.5 py-6 text-center text-sm text-black/40">
              {q ? 'Nessun dispositivo corrisponde alla ricerca.' : 'Nessun dispositivo disponibile.'}
            </p>
          ) : (
            deviceMatches.map((section) => (
              <div key={section.label} className="space-y-1 pt-1">
                <p className="px-0.5 text-[11px] font-semibold text-black/35">{section.label}</p>
                {section.entities.map((entity) => {
                  const added = presentEntities.has(entity.entityId)
                  return (
                    <DeviceRow
                      key={entity.entityId}
                      label={entity.label}
                      icon={entity.icon}
                      added={added}
                      onAdd={() => onAdd(makeWidget('entity', { entityId: entity.entityId }))}
                    />
                  )
                })}
              </div>
            ))
          )}
        </section>
      </div>
    </GlassSheet>
  )
}

function DeviceRow({
  label, icon, fallbackIcon, added, onAdd,
}: {
  label: string
  icon?: string
  fallbackIcon?: LucideIcon
  added: boolean
  onAdd: () => void
}) {
  return (
    <button
      type="button"
      disabled={added}
      onClick={onAdd}
      className={cn(
        'flex min-h-[48px] w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left transition active:scale-[0.99]',
        added ? 'opacity-45' : 'hover:bg-black/[0.04]',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-black/55">
        <DynamicIcon name={icon} fallback={fallbackIcon ?? Layers} size={17} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1d1d1f]">{label}</span>
      {added
        ? <Check size={16} className="shrink-0 text-[#0066cc]" aria-label="Già presente" />
        : <span className="shrink-0 rounded-full bg-[#0066cc]/10 px-2.5 py-1 text-[11px] font-semibold text-[#0066cc]">Aggiungi</span>}
    </button>
  )
}
