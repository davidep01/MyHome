import { useEffect, useMemo, useRef, useState } from 'react'
import { GridLayout, type Layout, type LayoutItem } from 'react-grid-layout'
import { motion } from 'framer-motion'
import { Plus, Check, Pencil, X } from 'lucide-react'
import { useDashboardConfig, useUpdateConfig } from '../../../hooks/useDashboardConfig'
import { useUIStore } from '../../../store/ui'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { HomeWidgetView } from './HomeWidgetView'
import { WidgetPicker } from './WidgetPicker'
import { SIZE_WH } from './widgetCatalog'
import type { HomeConfig, HomeWidget } from '../../../api/backend'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

const COLS = 8

/** A sensible starter home so it's never empty on first use. */
const DEFAULT_WIDGETS: HomeWidget[] = [
  { id: 'w-clock', type: 'clock', size: 'md' },
  { id: 'w-status', type: 'status', size: 'sm' },
  { id: 'w-weather', type: 'weather', size: 'md' },
  { id: 'w-stats', type: 'quickStats', size: 'wide' },
  { id: 'w-scenes', type: 'scenes', size: 'wide' },
]

type Positions = NonNullable<HomeConfig['positions']>

function buildLayout(widgets: HomeWidget[], saved: Positions): LayoutItem[] {
  let x = 0, y = 0, rowH = 0
  return widgets.map((w) => {
    const wh = SIZE_WH[w.size]
    const s = saved[w.id]
    if (s) return { i: w.id, x: s.x, y: s.y, w: s.w, h: s.h }
    if (x + wh.w > COLS) { x = 0; y += rowH; rowH = 0 }
    const item: LayoutItem = { i: w.id, x, y, w: wh.w, h: wh.h }
    x += wh.w
    rowH = Math.max(rowH, wh.h)
    return item
  })
}

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

export function WidgetHome() {
  const { data: config } = useDashboardConfig()
  const { mutate: update } = useUpdateConfig()
  const isDesktop = useIsDesktop()
  const editModeRaw = useUIStore((s) => s.editMode)
  const setEditMode = useUIStore((s) => s.setEditMode)
  const { ref, width } = useElementWidth()
  const [pickerOpen, setPickerOpen] = useState(false)

  // Editing is desktop-only; tablets/kiosk are strictly view-only.
  const editMode = isDesktop && editModeRaw

  const widgets = config?.home?.widgets ?? DEFAULT_WIDGETS
  const positions = useMemo(() => config?.home?.positions ?? {}, [config?.home?.positions])
  const layout = useMemo(() => buildLayout(widgets, positions), [widgets, positions])

  const persistHome = (next: HomeConfig) => update({ home: next })

  const onLayoutChange = (l: Layout) => {
    if (!editMode) return
    const pos: Positions = {}
    l.forEach((it) => { pos[it.i] = { x: it.x, y: it.y, w: it.w, h: it.h } })
    persistHome({ widgets, positions: pos })
  }

  const addWidget = (w: HomeWidget) => persistHome({ widgets: [...widgets, w], positions })
  const removeWidget = (id: string) => {
    const { [id]: _omit, ...rest } = positions
    persistHome({ widgets: widgets.filter((w) => w.id !== id), positions: rest })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — desktop only (tablets/kiosk are view-only) */}
      {isDesktop && (
        <div className="mb-3 flex shrink-0 items-center justify-end gap-2 px-0.5">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-black/[0.06] px-3.5 py-2 text-sm font-medium text-[#1d1d1f] transition active:scale-95 hover:bg-black/10"
          >
            <Plus size={15} /> Aggiungi widget
          </button>
          <button
            onClick={() => setEditMode(!editMode)}
            className={cnEdit(editMode)}
          >
            {editMode ? <><Check size={15} /> Fatto</> : <><Pencil size={14} /> Modifica</>}
          </button>
        </div>
      )}

      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {width > 0 && (
          <GridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: COLS, rowHeight: 64, margin: [12, 12] }}
            dragConfig={{ enabled: editMode }}
            resizeConfig={{ enabled: editMode }}
            onLayoutChange={onLayoutChange}
          >
            {widgets.map((w) => (
              <div key={w.id} className="relative h-full w-full">
                <motion.div
                  className="h-full w-full"
                  animate={editMode ? { rotate: [-0.6, 0.6, -0.6] } : { rotate: 0 }}
                  transition={editMode ? { repeat: Infinity, duration: 0.32, ease: 'easeInOut' } : { duration: 0.15 }}
                  style={{ transformOrigin: 'center' }}
                >
                  <HomeWidgetView widget={w} />
                </motion.div>
                {editMode && (
                  <>
                    <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-2 ring-[#0066cc]/40" />
                    <button
                      onClick={() => removeWidget(w.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      className="absolute -left-1.5 -top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white shadow-lg active:scale-90"
                      aria-label="Rimuovi widget"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      <WidgetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={addWidget} />
    </div>
  )
}

function cnEdit(editMode: boolean) {
  return [
    'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition active:scale-95',
    editMode ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60 hover:text-[#1d1d1f]',
  ].join(' ')
}
