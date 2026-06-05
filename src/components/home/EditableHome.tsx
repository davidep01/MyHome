import { useEffect, useMemo, useRef, useState } from 'react'
import { GridLayout, type Layout, type LayoutItem } from 'react-grid-layout'
import { useDiscoveredEntities } from '../../hooks/useDiscoveredEntities'
import { useDashboardConfig, useUpdateConfig } from '../../hooks/useDashboardConfig'
import { useUIStore } from '../../store/ui'
import { EntityCard, defaultGridSize } from '../widgets/WidgetGrid'
import type { RoomEntity } from '../../api/backend'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

type SavedItems = Record<string, { x: number; y: number; w: number; h: number }>

/** Build the layout array: saved positions where present, else auto-flow defaults. */
function buildLayout(entities: RoomEntity[], saved: SavedItems, cols: number): LayoutItem[] {
  let x = 0
  let y = 0
  let rowH = 0
  return entities.map((e) => {
    const s = saved[e.entityId]
    if (s) return { i: e.entityId, x: s.x, y: s.y, w: s.w, h: s.h }
    const { w, h } = defaultGridSize(e.type)
    if (x + w > cols) { x = 0; y += rowH; rowH = 0 }
    const item: LayoutItem = { i: e.entityId, x, y, w, h }
    x += w
    rowH = Math.max(rowH, h)
    return item
  })
}

/** Measures the container width (react-grid-layout v2 needs an explicit width). */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/**
 * Custom, editable tile dashboard. Tiles drag/resize in edit mode and positions
 * persist to the backend (config.dashboardLayout). New entities flow in with a
 * default footprint per type.
 */
export function EditableHome() {
  const { sections } = useDiscoveredEntities()
  const { data: config } = useDashboardConfig()
  const { mutate: update } = useUpdateConfig()
  const editMode = useUIStore((s) => s.editMode)
  const { ref, width } = useElementWidth()

  const entities = useMemo(() => sections.flatMap((s) => s.entities), [sections])
  const cols = config?.dashboardLayout?.cols ?? 8
  const saved = useMemo(() => config?.dashboardLayout?.items ?? {}, [config?.dashboardLayout])

  const layout = useMemo(() => buildLayout(entities, saved, cols), [entities, saved, cols])

  const persist = (l: Layout) => {
    const items: Record<string, { x: number; y: number; w: number; h: number }> = {}
    l.forEach((it) => { items[it.i] = { x: it.x, y: it.y, w: it.w, h: it.h } })
    update({ dashboardLayout: { cols, items } })
  }

  if (entities.length === 0) {
    return <p className="px-1 text-sm text-black/40">Nessun dispositivo da disporre.</p>
  }

  return (
    <div ref={ref} className="min-h-0">
      {width > 0 && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols, rowHeight: 56, margin: [12, 12] }}
          dragConfig={{ enabled: editMode }}
          resizeConfig={{ enabled: editMode }}
          onLayoutChange={(l) => { if (editMode) persist(l) }}
        >
          {entities.map((e) => (
            <div key={e.entityId} className="relative h-full w-full overflow-hidden">
              <EntityCard entity={e} />
              {editMode && (
                <div className="absolute inset-0 cursor-move rounded-[18px] bg-[#0066cc]/5 ring-2 ring-[#0066cc]/40" />
              )}
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}
