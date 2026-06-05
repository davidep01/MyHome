import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Check, Pencil, X, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useDashboardConfig, useUpdateConfig } from '../../../hooks/useDashboardConfig'
import { useUIStore } from '../../../store/ui'
import { useIsDesktop } from '../../../hooks/useIsDesktop'
import { HomeWidgetView } from './HomeWidgetView'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'
import { WidgetPicker } from './WidgetPicker'
import { SIZE_WH, WIDGET_META } from './widgetCatalog'
import type { HomeWidget } from '../../../api/backend'

const COLS = 8

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
 * iOS-style widget canvas on a plain CSS grid. Widgets flow by array order and
 * size (dense packing); add/remove/resize/reorder are pure array mutations that
 * persist to the global config — no external grid library, so the view always
 * reflects the data.
 */
export function WidgetHome() {
  const { data: config } = useDashboardConfig()
  const { mutate: update } = useUpdateConfig()
  const isDesktop = useIsDesktop()
  const editModeRaw = useUIStore((s) => s.editMode)
  const setEditMode = useUIStore((s) => s.setEditMode)
  const [pickerOpen, setPickerOpen] = useState(false)

  const canEdit = isDesktop || Boolean(config?.advancedMode)
  const editMode = canEdit && editModeRaw
  const widgets = config?.home?.widgets ?? DEFAULT_WIDGETS

  const persist = (next: HomeWidget[]) => update({ home: { widgets: next } })
  const addWidget = (w: HomeWidget) => persist([...widgets, w])
  const removeWidget = (id: string) => persist(widgets.filter((w) => w.id !== id))
  const resizeWidget = (id: string) => persist(widgets.map((w) => (w.id === id ? { ...w, size: nextSize(w) } : w)))
  const moveWidget = (id: string, dir: -1 | 1) => {
    const i = widgets.findIndex((w) => w.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= widgets.length) return
    const next = [...widgets]
    ;[next[i], next[j]] = [next[j], next[i]]
    persist(next)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — desktop, or any device when advanced mode is enabled */}
      {canEdit && (
        <div className="mb-3 flex shrink-0 items-center justify-end gap-2 px-0.5">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-black/[0.06] px-3.5 py-2 text-sm font-medium text-[#1d1d1f] transition active:scale-95 hover:bg-black/10"
          >
            <Plus size={15} /> Aggiungi widget
          </button>
          <button onClick={() => setEditMode(!editMode)} className={cnEdit(editMode)}>
            {editMode ? <><Check size={15} /> Fatto</> : <><Pencil size={14} /> Modifica</>}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridAutoRows: '64px', gridAutoFlow: 'row dense' }}
        >
          {widgets.map((w, i) => {
            const wh = SIZE_WH[w.size]
            return (
              <div key={w.id} className="relative min-w-0" style={{ gridColumn: `span ${wh.w}`, gridRow: `span ${wh.h}` }}>
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
                    {/* Remove */}
                    <button
                      onClick={() => removeWidget(w.id)}
                      className="absolute -left-1.5 -top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white shadow-lg active:scale-90"
                      aria-label="Rimuovi widget"
                    >
                      <X size={14} />
                    </button>
                    {/* Resize */}
                    <button
                      onClick={() => resizeWidget(w.id)}
                      className="absolute -right-1.5 -top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[#0066cc] text-white shadow-lg active:scale-90"
                      aria-label="Ridimensiona"
                    >
                      <Maximize2 size={12} />
                    </button>
                    {/* Reorder */}
                    <div className="absolute -bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1">
                      <button onClick={() => moveWidget(w.id, -1)} disabled={i === 0} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black/70 shadow-lg active:scale-90 disabled:opacity-30" aria-label="Sposta indietro">
                        <ChevronLeft size={14} />
                      </button>
                      <button onClick={() => moveWidget(w.id, 1)} disabled={i === widgets.length - 1} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black/70 shadow-lg active:scale-90 disabled:opacity-30" aria-label="Sposta avanti">
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
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
