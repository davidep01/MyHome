import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import ReactGridLayout, { WidthProvider, type Layout, type LayoutItem } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Plus, Check, Pencil, X, Maximize2, GripVertical, RotateCcw } from 'lucide-react'
import { useDashboardConfig, useUpdateConfig } from '../../../hooks/useDashboardConfig'
import { useUIStore } from '../../../store/ui'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { useMinWidth } from '../../../hooks/useMinWidth'
import { HomeWidgetView } from './HomeWidgetView'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'
import { WidgetPicker } from './WidgetPicker'
import { SIZE_WH, WIDGET_META } from './widgetCatalog'
import type { HomeConfig, HomeWidget } from '../../../api/backend'

const COLS = 8
const ROW_HEIGHT = 64
const GRID_GAP = [12, 12] as const
const GRID_PADDING = [0, 0] as const
const GridLayout = WidthProvider(ReactGridLayout)
type HomePositions = NonNullable<HomeConfig['positions']>

/** A sensible starter home so it's never empty on first use. */
const DEFAULT_WIDGETS: HomeWidget[] = [
  { id: 'w-clock', type: 'clock', size: 'md' },
  { id: 'w-status', type: 'status', size: 'sm' },
  { id: 'w-weather', type: 'weather', size: 'md' },
  { id: 'w-stats', type: 'quickStats', size: 'wide' },
  { id: 'w-scenes', type: 'scenes', size: 'wide' },
]

/** Next size in the widget type's allowed list (wraps around). */
function nextSize(w: HomeWidget): HomeWidget['size'] {
  const allowed = WIDGET_META[w.type]?.sizes ?? ['sm', 'md']
  const i = allowed.indexOf(w.size)
  return allowed[(i + 1) % allowed.length]
}

function widgetLayoutItem(widget: HomeWidget, x: number, y: number): LayoutItem {
  const wh = SIZE_WH[widget.size]
  return { i: widget.id, x, y, w: wh.w, h: wh.h }
}

function cellsFor(item: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>): string[] {
  const cells: string[] = []
  for (let y = item.y; y < item.y + item.h; y += 1) {
    for (let x = item.x; x < item.x + item.w; x += 1) cells.push(`${x}:${y}`)
  }
  return cells
}

function fits(occupied: Set<string>, item: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>): boolean {
  if (item.x < 0 || item.y < 0 || item.x + item.w > COLS) return false
  return cellsFor(item).every((cell) => !occupied.has(cell))
}

function occupy(occupied: Set<string>, item: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>): void {
  cellsFor(item).forEach((cell) => occupied.add(cell))
}

function firstFreeSlot(occupied: Set<string>, widget: HomeWidget): { x: number; y: number } {
  const wh = SIZE_WH[widget.size]
  for (let y = 0; y < 1000; y += 1) {
    for (let x = 0; x <= COLS - wh.w; x += 1) {
      const candidate = { x, y, w: wh.w, h: wh.h }
      if (fits(occupied, candidate)) return { x, y }
    }
  }
  return { x: 0, y: 0 }
}

function buildLayout(widgets: HomeWidget[], saved: HomePositions = {}): Layout {
  const occupied = new Set<string>()
  const layout: LayoutItem[] = []
  const missing: HomeWidget[] = []

  widgets.forEach((widget) => {
    const wh = SIZE_WH[widget.size]
    const pos = saved[widget.id]
    const x = Math.max(0, Math.min(pos?.x ?? 0, COLS - wh.w))
    const y = Math.max(0, pos?.y ?? 0)
    const item = widgetLayoutItem(widget, x, y)

    if (pos && fits(occupied, item)) {
      layout.push(item)
      occupy(occupied, item)
    } else {
      missing.push(widget)
    }
  })

  missing.forEach((widget) => {
    const { x, y } = firstFreeSlot(occupied, widget)
    const item = widgetLayoutItem(widget, x, y)
    layout.push(item)
    occupy(occupied, item)
  })

  return layout
}

function positionsFromLayout(layout: Layout): HomePositions {
  return layout.reduce<HomePositions>((acc, item) => {
    acc[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h }
    return acc
  }, {})
}

/**
 * iOS-style widget canvas backed by react-grid-layout. The widget list stores
 * identity/configuration, while `home.positions` stores the user-arranged grid.
 */
export function WidgetHome() {
  const { data: config } = useDashboardConfig()
  const { mutate: update } = useUpdateConfig()
  const isDesktop = useIsDesktop()
  const isTabletViewport = useMinWidth(768)
  const editModeRaw = useUIStore((s) => s.editMode)
  const setEditMode = useUIStore((s) => s.setEditMode)
  const [pickerOpen, setPickerOpen] = useState(false)

  const canEdit = isDesktop || (Boolean(config?.advancedMode) && isTabletViewport)
  const editMode = canEdit && editModeRaw
  const widgets = config?.home?.widgets ?? DEFAULT_WIDGETS
  const positions = config?.home?.positions ?? {}
  const layout = useMemo(() => buildLayout(widgets, positions), [widgets, positions])

  useEffect(() => {
    if (!canEdit && editModeRaw) setEditMode(false)
  }, [canEdit, editModeRaw, setEditMode])

  const persist = (nextWidgets: HomeWidget[], nextLayout = buildLayout(nextWidgets, positions)) => {
    update({
      home: {
        ...(config?.home ?? {}),
        widgets: nextWidgets,
        positions: positionsFromLayout(nextLayout),
      },
    })
  }
  const addWidget = (w: HomeWidget) => {
    const nextWidgets = [...widgets, w]
    persist(nextWidgets, buildLayout(nextWidgets, positions))
  }
  const removeWidget = (id: string) => {
    const nextWidgets = widgets.filter((w) => w.id !== id)
    persist(nextWidgets, buildLayout(nextWidgets, positions))
  }
  const resizeWidget = (id: string) => {
    const nextWidgets = widgets.map((w) => (w.id === id ? { ...w, size: nextSize(w) } : w))
    persist(nextWidgets, buildLayout(nextWidgets, positions))
  }
  const persistDraggedLayout = (nextLayout: Layout) => persist(widgets, buildLayout(widgets, positionsFromLayout(nextLayout)))
  const resetHome = () => {
    // Clean reset: default widgets + fresh auto-layout (clears any stale positions).
    update({ home: { widgets: DEFAULT_WIDGETS, positions: positionsFromLayout(buildLayout(DEFAULT_WIDGETS, {})) } })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — desktop, or tablet+ when advanced mode is enabled */}
      {canEdit && (
        <div className="mb-3 flex shrink-0 items-center justify-end gap-2 px-0.5">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-black/[0.06] px-3.5 py-2 text-sm font-medium text-[#1d1d1f] transition active:scale-95 hover:bg-black/10"
          >
            <Plus size={15} /> Aggiungi widget
          </button>
          {editMode && (
            <button
              onClick={() => { if (window.confirm('Ripristinare la home predefinita? I widget attuali verranno sostituiti.')) resetHome() }}
              className="flex items-center gap-1.5 rounded-full bg-black/[0.06] px-3.5 py-2 text-sm font-medium text-black/60 transition active:scale-95 hover:text-[#1d1d1f]"
            >
              <RotateCcw size={14} /> Ripristina
            </button>
          )}
          <button onClick={() => setEditMode(!editMode)} className={cnEdit(editMode)}>
            {editMode ? <><Check size={15} /> Fatto</> : <><Pencil size={14} /> Modifica</>}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <GridLayout
          className="relative"
          layout={layout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={GRID_GAP}
          containerPadding={GRID_PADDING}
          compactType={null}
          preventCollision={false}
          isBounded
          isDraggable={editMode}
          isResizable={false}
          draggableCancel=".widget-edit-control, button, input, select, textarea, a"
          onDragStop={persistDraggedLayout}
          useCSSTransforms
          autoSize
          measureBeforeMount
        >
          {widgets.map((w) => (
            <div key={w.id} className="relative min-w-0">
              <motion.div
                className="h-full w-full"
                animate={editMode ? { rotate: [-0.5, 0.5, -0.5] } : { rotate: 0 }}
                transition={editMode ? { repeat: Infinity, duration: 0.34, ease: 'easeInOut' } : { duration: 0.15 }}
                style={{ transformOrigin: 'center' }}
              >
                <WidgetErrorBoundary>
                  <HomeWidgetView widget={w} />
                </WidgetErrorBoundary>
              </motion.div>

              {editMode && (
                <>
                  <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-2 ring-[#0066cc]/40" />
                  <div
                    className="widget-drag-surface absolute inset-0 z-10 cursor-grab rounded-[18px] active:cursor-grabbing"
                    style={{ touchAction: 'none' }}
                    aria-hidden="true"
                  />
                  <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 flex h-6 w-10 -translate-x-1/2 items-center justify-center rounded-full bg-white/90 text-black/45 shadow-lg">
                    <GripVertical size={15} />
                  </div>
                  <button
                    onClick={() => removeWidget(w.id)}
                    className="widget-edit-control absolute -left-1.5 -top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white shadow-lg active:scale-90"
                    aria-label="Rimuovi widget"
                  >
                    <X size={14} />
                  </button>
                  <button
                    onClick={() => resizeWidget(w.id)}
                    className="widget-edit-control absolute -right-1.5 -top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-[#0066cc] text-white shadow-lg active:scale-90"
                    aria-label="Ridimensiona"
                  >
                    <Maximize2 size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </GridLayout>
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
