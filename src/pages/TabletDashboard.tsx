import { useState } from 'react'
import { LayoutGrid, Rows3, Check, Pencil } from 'lucide-react'
import { useDiscoveredEntities } from '../hooks/useDiscoveredEntities'
import { useEntityStore } from '../store/entities'
import { useUIStore } from '../store/ui'
import { HomeHeader } from '../components/home/HomeHeader'
import { QuickStats } from '../components/home/QuickStats'
import { PeopleCard } from '../components/home/PeopleCard'
import { SectionBand } from '../components/home/SectionBand'
import { EditableHome } from '../components/home/EditableHome'
import { SceneRow } from '../components/layout/SceneRow'
import { WidgetGrid } from '../components/widgets/WidgetGrid'
import { cn } from '../lib/utils'

const SECTION_LIMIT = 8

/** Auto-configuring home: sections built live from the HA entity stream. */
function AutoHome() {
  const { sections, total } = useDiscoveredEntities()
  const status = useEntityStore((s) => s.connectionStatus)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (domain: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })

  if (total === 0) {
    return (
      <p className="px-1 text-sm text-black/40">
        {status === 'connected'
          ? 'Nessuna entità controllabile esposta da Home Assistant.'
          : status === 'connecting'
            ? 'Connessione a Home Assistant…'
            : 'In attesa di Home Assistant — verifica la connessione.'}
      </p>
    )
  }

  return (
    <>
      {sections.map((s) => {
        const open = expanded.has(s.domain)
        const shown = open ? s.entities : s.entities.slice(0, SECTION_LIMIT)
        const action = s.entities.length > SECTION_LIMIT ? (
          <button
            onClick={() => toggle(s.domain)}
            className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-[#0066cc] transition hover:bg-black/8"
          >
            {open ? 'Comprimi' : `Mostra tutti (${s.entities.length})`}
          </button>
        ) : undefined
        return (
          <SectionBand key={s.domain} title={s.label} count={s.entities.length} minColumn={s.minColumn} action={action}>
            <WidgetGrid entities={shown} />
          </SectionBand>
        )
      })}
    </>
  )
}

function ViewControls() {
  const view = useUIStore((s) => s.dashboardView)
  const setView = useUIStore((s) => s.setDashboardView)
  const editMode = useUIStore((s) => s.editMode)
  const setEditMode = useUIStore((s) => s.setEditMode)

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex gap-1 rounded-full bg-black/5 p-1">
        {([['auto', 'Sezioni', Rows3], ['grid', 'Griglia', LayoutGrid]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => { setView(id); if (id === 'auto') setEditMode(false) }}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition',
              view === id ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-black/45 hover:text-black/70',
            )}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {view === 'grid' && (
        <button
          onClick={() => setEditMode(!editMode)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95',
            editMode ? 'bg-[#0066cc] text-white' : 'bg-black/5 text-black/55 hover:text-[#1d1d1f]',
          )}
        >
          {editMode ? <><Check size={14} /> Fatto</> : <><Pencil size={13} /> Modifica</>}
        </button>
      )}
    </div>
  )
}

export function TabletDashboard() {
  const view = useUIStore((s) => s.dashboardView)

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      <HomeHeader />
      <QuickStats />
      <SceneRow />

      <SectionBand title="Persone">
        <div className="min-w-0" style={{ gridColumn: 'span 2', gridRow: 'span 1' }}>
          <PeopleCard className="h-full" />
        </div>
      </SectionBand>

      <ViewControls />

      {view === 'grid' ? <EditableHome /> : <AutoHome />}
    </div>
  )
}
