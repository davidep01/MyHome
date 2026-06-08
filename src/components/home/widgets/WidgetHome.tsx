import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Plus, Check, Pencil, X, Maximize2, GripVertical, RotateCcw } from 'lucide-react'
import { useDashboardConfig, useUpdateConfig } from '../../../hooks/useDashboardConfig'
import { useUIStore } from '../../../store/ui'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { WidgetPicker } from './WidgetPicker'
import { HomeGridCanvas } from './HomeGridCanvas'
import { WIDGET_META } from './widgetCatalog'
import { HOME_ROW_HEIGHT, buildLayout, positionsFromLayout } from '../../../lib/homeLayout'
import type { HomeWidget } from '../../../api/backend'

const GRID_GAP = [12, 12] as const

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

/**
 * iOS-style widget canvas backed by react-grid-layout. The widget list stores
 * identity/configuration, while `home.positions` stores the user-arranged grid.
 * Layout maths (packing, serialisation) come from the shared `homeLayout` kernel.
 */
export function WidgetHome() {
  const { data: config, isError, isLoading, refetch } = useDashboardConfig()
  const { mutate: update, isPending } = useUpdateConfig()
  const isDesktop = useIsDesktop()
  const editModeRaw = useUIStore((s) => s.editMode)
  const setEditMode = useUIStore((s) => s.setEditMode)
  const [pickerOpen, setPickerOpen] = useState(false)

  const canEdit = isDesktop
  const editMode = canEdit && editModeRaw
  const widgets = useMemo(() => config?.home?.widgets ?? DEFAULT_WIDGETS, [config?.home?.widgets])
  const positions = useMemo(() => config?.home?.positions ?? {}, [config?.home?.positions])
  const layout = useMemo(() => buildLayout(widgets, positions), [widgets, positions])

  useEffect(() => {
    if (!canEdit && editModeRaw) setEditMode(false)
  }, [canEdit, editModeRaw, setEditMode])

  const persist = (nextWidgets: HomeWidget[], nextLayout = buildLayout(nextWidgets, positions)) => {
    if (isPending) return
    update({
      home: {
        ...(config?.home ?? {}),
        widgets: nextWidgets,
        positions: positionsFromLayout(nextLayout),
        order: nextLayout.map((item) => item.i),
        // Send the version we read; the backend bumps + rejects stale writes.
        layoutVersion: config?.home?.layoutVersion ?? 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'desktop',
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
    if (isPending) return
    // Clean reset: default widgets + fresh auto-layout (clears any stale positions).
    update({
      home: {
        widgets: DEFAULT_WIDGETS,
        positions: positionsFromLayout(buildLayout(DEFAULT_WIDGETS, {})),
        order: DEFAULT_WIDGETS.map((widget) => widget.id),
        layoutVersion: config?.home?.layoutVersion ?? 1,
        updatedAt: new Date().toISOString(),
        updatedBy: 'desktop',
      },
    })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — desktop/backend only */}
      {canEdit && (
        <div className="mb-3 flex shrink-0 items-center justify-end gap-2 px-0.5">
          <button
            onClick={() => setPickerOpen(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-full bg-black/[0.06] px-3.5 py-2 text-sm font-medium text-[#1d1d1f] transition active:scale-95 hover:bg-black/10"
          >
            <Plus size={15} /> Aggiungi widget
          </button>
          {editMode && (
            <button
              onClick={() => { if (window.confirm('Ripristinare la home predefinita? I widget attuali verranno sostituiti.')) resetHome() }}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-full bg-black/[0.06] px-3.5 py-2 text-sm font-medium text-black/60 transition active:scale-95 hover:text-[#1d1d1f] disabled:opacity-45"
            >
              <RotateCcw size={14} /> Ripristina
            </button>
          )}
          <button onClick={() => setEditMode(!editMode)} disabled={isPending} className={cnEdit(editMode)}>
            {editMode ? <><Check size={15} /> Fatto</> : <><Pencil size={14} /> Modifica</>}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isError ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[18px] border border-black/8 bg-black/[0.035] px-5 text-center">
            <p className="text-sm font-semibold text-[#1d1d1f]">Configurazione home non disponibile</p>
            <button
              onClick={() => refetch()}
              className="mt-4 rounded-full bg-[#0066cc] px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
            >
              Riprova
            </button>
          </div>
        ) : isLoading && !config ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-32 rounded-[18px] bg-black/[0.05]" />
            ))}
          </div>
        ) : widgets.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[18px] border border-dashed border-black/15 bg-black/[0.025] px-5 text-center">
            <p className="text-sm font-semibold text-[#1d1d1f]">Home vuota</p>
            {canEdit && (
              <button
                onClick={() => setPickerOpen(true)}
                disabled={isPending}
                className="mt-4 flex items-center gap-1.5 rounded-full bg-[#0066cc] px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-45"
              >
                <Plus size={15} /> Aggiungi widget
              </button>
            )}
          </div>
        ) : (
          <HomeGridCanvas
            className="relative"
            widgets={widgets}
            layout={layout}
            rowHeight={HOME_ROW_HEIGHT}
            gap={GRID_GAP}
            editMode={editMode}
            isDraggable={editMode && !isPending}
            draggableCancel=".widget-edit-control, button, input, select, textarea, a"
            onDragStop={persistDraggedLayout}
            renderTile={(_w, content) => (
              <motion.div
                className="h-full w-full"
                animate={editMode ? { rotate: [-0.5, 0.5, -0.5] } : { rotate: 0 }}
                transition={editMode ? { repeat: Infinity, duration: 0.34, ease: 'easeInOut' } : { duration: 0.15 }}
                style={{ transformOrigin: 'center' }}
              >
                {content}
              </motion.div>
            )}
            renderOverlay={(w) => (
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
                  disabled={isPending}
                  className="widget-edit-control absolute -left-1.5 -top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white shadow-lg active:scale-90 disabled:opacity-45"
                  aria-label="Rimuovi widget"
                >
                  <X size={14} />
                </button>
                <button
                  onClick={() => resizeWidget(w.id)}
                  disabled={isPending}
                  className="widget-edit-control absolute -right-1.5 -top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-[#0066cc] text-white shadow-lg active:scale-90 disabled:opacity-45"
                  aria-label="Ridimensiona"
                >
                  <Maximize2 size={12} />
                </button>
              </>
            )}
          />
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
