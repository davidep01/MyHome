import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { GripVertical, LayoutGrid, Maximize2, Pencil, Plus, Save, WifiOff, X } from 'lucide-react'
import { HomeGridCanvas } from './HomeGridCanvas'
import { WidgetPicker } from './WidgetPicker'
import { WIDGET_META } from './widgetCatalog'
import { buildLayout, orderFromLayout, positionsFromLayout, sameLayout } from '../../../lib/homeLayout'
import { useTabletLayout, useSaveTabletLayout } from '../../../hooks/useTabletLayout'
import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'
import { useHaptic } from '../../../hooks/useHaptic'
import { cn } from '../../../lib/utils'
import { WeatherIcon } from '../../weather/WeatherIcon'
import { authApi, type HomeWidget, type TabletDashboardLayout, type WidgetSize } from '../../../api/backend'
import { NotificationBell } from '../../notifications/NotificationCenter'
import { BRAND_EXPANDED, BRAND_NAME } from '../../../lib/brand'

const GRID_GAP = [14, 14] as const
const SIZE_SHORT: Record<WidgetSize, string> = { sm: 'S', md: 'M', lg: 'L', wide: 'XL' }

interface Draft {
  widgets: HomeWidget[]
  layout: Layout
}

/** True when two widget sets carry the same tiles with the same binding + size. */
function sameWidgets(a: HomeWidget[], b: HomeWidget[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((w) => [w.id, w]))
  return a.every((w) => {
    const other = byId.get(w.id)
    return Boolean(other) && other!.type === w.type && other!.size === w.size
      && other!.entityId === w.entityId && other!.groupId === w.groupId
  })
}

function KioskHeader({ layout }: { layout: TabletDashboardLayout }) {
  const { time, date } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: weather } = useCurrentWeather()
  const status = useEntityStore((s) => s.connectionStatus)
  const online = status === 'connected'
  const syncing = status === 'connecting'
  const cached = layout.source === 'cache'

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="text-[56px] font-light leading-none text-[#1d1d1f] tabular-nums">{time}</span>
          <span className="truncate text-base capitalize text-black/45">{date}</span>
        </div>
        <div className="mt-2 flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[#0066cc]" title={BRAND_EXPANDED}>{BRAND_NAME}</span>
          <p className="truncate text-xl font-semibold text-[#1d1d1f]">
            {greeting}, {layout.userName || layout.dashboardName || 'Casa'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {weather && (
          <div className="flex items-center gap-2 rounded-full bg-sky-500/10 px-4 py-2 ring-1 ring-sky-500/10">
            <WeatherIcon code={weather.icon} size={27} />
            <span className="text-2xl font-light text-[#1d1d1f]">{weather.temp}°</span>
          </div>
        )}
        <div
          className={cn(
            'flex min-h-[48px] items-center gap-2 rounded-full px-4 text-sm font-semibold',
            online && !cached ? 'bg-green-500/12 text-green-700 ring-1 ring-green-500/10'
              : syncing ? 'bg-orange-500/12 text-orange-700 ring-1 ring-orange-500/10'
                : 'bg-red-500/10 text-red-700 ring-1 ring-red-500/10',
          )}
        >
          <span className={cn('h-2.5 w-2.5 rounded-full', online && !cached ? 'bg-green-500' : 'bg-orange-400')} />
          {online && !cached ? 'Online' : syncing ? 'Sincronizzazione' : 'Offline'}
        </div>
        <NotificationBell allowDismiss={false} />
      </div>
    </header>
  )
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-4 gap-4 pt-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-36 rounded-[18px] bg-black/[0.05]" />
      ))}
    </div>
  )
}

export function KioskWidgetHome() {
  const { data, isLoading, isError, refetch } = useTabletLayout('home')
  const saveLayout = useSaveTabletLayout('home')
  const { light: tapHaptic } = useHaptic()
  const authStatus = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.status,
    retry: false,
    staleTime: 30_000,
  })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const savedWidgets = useMemo(() => data?.widgets ?? [], [data?.widgets])
  const savedLayout = useMemo(() => buildLayout(savedWidgets, data?.layout.items), [savedWidgets, data?.layout.items])

  // Auth removed on the LAN → /status reports the admin role on every device,
  // so home customization is available directly on the wall tablet.
  const canEdit = authStatus.data?.role === 'admin'
  const editing = draft !== null && canEdit
  const activeWidgets = editing ? draft.widgets : savedWidgets
  const activeLayout = editing ? draft.layout : savedLayout
  const dirty = editing ? (!sameWidgets(draft.widgets, savedWidgets) || !sameLayout(draft.layout, savedLayout)) : false

  const beginEdit = () => {
    if (!canEdit) return
    setMessage(null)
    setDraft({ widgets: savedWidgets, layout: savedLayout })
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  const cancel = () => {
    setDraft(null)
    setPickerOpen(false)
    setMessage('Modifiche annullate')
  }

  /** Re-pack after any change: keep current x/y, re-derive footprints from size. */
  const repack = (widgets: HomeWidget[], layout: Layout): Draft => ({
    widgets,
    layout: buildLayout(widgets, positionsFromLayout(layout)),
  })

  const addWidget = (widget: HomeWidget) => {
    if (!draft) return
    tapHaptic()
    setDraft(repack([...draft.widgets, widget], draft.layout))
  }

  const removeWidget = (id: string) => {
    if (!draft) return
    tapHaptic()
    setDraft(repack(draft.widgets.filter((w) => w.id !== id), draft.layout))
  }

  const resizeWidget = (id: string) => {
    if (!draft) return
    const widget = draft.widgets.find((w) => w.id === id)
    if (!widget) return
    const sizes = WIDGET_META[widget.type].sizes
    const next = sizes[(sizes.indexOf(widget.size) + 1) % sizes.length]
    tapHaptic()
    setDraft(repack(draft.widgets.map((w) => (w.id === id ? { ...w, size: next } : w)), draft.layout))
  }

  const save = () => {
    if (!data || !draft) return
    setMessage('Salvataggio…')
    saveLayout.mutate({
      layoutVersion: data.layoutVersion,
      widgets: draft.widgets,
      items: positionsFromLayout(draft.layout, draft.widgets),
      order: orderFromLayout(draft.layout),
    }, {
      onSuccess: () => {
        setDraft(null)
        setPickerOpen(false)
        setMessage('Home aggiornata')
      },
      onError: () => setMessage('Salvataggio non riuscito. Riprova.'),
    })
  }

  if (isLoading && !data) {
    return (
      <div className="flex h-full flex-col px-6 py-5">
        <div className="h-20 rounded-[18px] bg-black/[0.05]" />
        <LoadingGrid />
      </div>
    )
  }

  if (isError && !data) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-black/[0.06] text-black/45">
            <WifiOff size={28} />
          </div>
          <p className="mt-4 text-xl font-semibold text-[#1d1d1f]">Dashboard temporaneamente non disponibile</p>
          <button
            onClick={() => refetch()}
            className="mt-5 min-h-[48px] rounded-full bg-[#0066cc] px-6 text-base font-semibold text-white active:scale-95"
          >
            Riprova
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="kiosk-burnin-shift flex h-full flex-col gap-5 px-[max(22px,env(safe-area-inset-left))] py-[max(18px,env(safe-area-inset-top))]">
      <KioskHeader layout={data} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            {editing ? (
              <p className="truncate text-sm font-semibold text-[#0066cc]">Personalizzazione home</p>
            ) : (
              <p className="truncate text-sm font-semibold text-black/35">{data.dashboardName}</p>
            )}
            {message && <p aria-live="polite" className="mt-0.5 text-xs font-semibold text-black/45">{message}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-[#0066cc] px-5 text-base font-semibold text-white transition active:scale-95"
                >
                  <Plus size={18} /> Aggiungi
                </button>
                <button
                  onClick={save}
                  disabled={!dirty || saveLayout.isPending}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-black px-5 text-base font-semibold text-white transition active:scale-95 disabled:opacity-40"
                >
                  <Save size={18} /> {saveLayout.isPending ? 'Salvataggio…' : 'Salva'}
                </button>
                <button
                  onClick={cancel}
                  disabled={saveLayout.isPending}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-black/[0.07] px-5 text-base font-semibold text-black/65 transition active:scale-95 disabled:opacity-45"
                >
                  <X size={18} /> Annulla
                </button>
              </>
            ) : canEdit ? (
              <button
                type="button"
                onClick={beginEdit}
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-black/[0.06] px-5 text-base font-semibold text-black/60 transition active:scale-95"
              >
                <Pencil size={17} aria-hidden="true" /> Personalizza
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {editing && activeWidgets.length === 0 ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-black/15 text-black/45 transition hover:border-[#0066cc]/40 hover:text-[#0066cc]"
            >
              <LayoutGrid size={30} aria-hidden="true" />
              <span className="text-base font-semibold">Aggiungi il primo widget</span>
            </button>
          ) : (
            <HomeGridCanvas
              className={cn('relative pb-10', editing && 'kiosk-layout-editing')}
              widgets={activeWidgets}
              layout={activeLayout}
              rowHeight={data.layout.rowHeight}
              gap={GRID_GAP}
              editMode={editing}
              isDraggable={editing}
              draggableCancel="button, input, select, textarea, a"
              publicConfig={data}
              onDrag={(_, __, ___, ____, event) => event.stopPropagation()}
              onDragStop={(nextLayout) => draft && setDraft({ ...draft, layout: buildLayout(draft.widgets, positionsFromLayout(nextLayout, draft.widgets)) })}
              renderOverlay={(widget) => (
                <TileEditOverlay
                  widget={widget}
                  onRemove={() => removeWidget(widget.id)}
                  onResize={() => resizeWidget(widget.id)}
                />
              )}
            />
          )}
        </div>
      </div>

      <WidgetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existing={activeWidgets}
        onAdd={addWidget}
        curation={data}
      />
    </div>
  )
}

/** Per-tile controls in edit mode: drag surface, remove and resize. */
function TileEditOverlay({
  widget, onRemove, onResize,
}: {
  widget: HomeWidget
  onRemove: () => void
  onResize: () => void
}) {
  const resizable = WIDGET_META[widget.type].sizes.length > 1
  return (
    <>
      <div className="pointer-events-none absolute inset-0 rounded-[18px] bg-white/10 ring-2 ring-[#0066cc]/40" />
      {/* Full-surface grab layer: blocks accidental device toggles while editing. */}
      <div
        className="absolute inset-0 z-10 cursor-grab rounded-[18px] active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Rimuovi widget"
        className="tap-target pointer-events-auto absolute -right-2 -top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-90"
      >
        <X size={17} aria-hidden="true" />
      </button>
      {resizable && (
        <button
          type="button"
          onClick={onResize}
          aria-label={`Cambia dimensione widget (attuale ${SIZE_SHORT[widget.size]})`}
          className="pointer-events-auto absolute bottom-2 right-2 z-20 flex min-h-9 items-center gap-1 rounded-full bg-white/95 px-3 text-sm font-semibold text-black/70 shadow-lg transition active:scale-90"
        >
          <Maximize2 size={14} aria-hidden="true" /> {SIZE_SHORT[widget.size]}
        </button>
      )}
      <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex h-8 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-white/95 text-black/45 shadow-lg">
        <GripVertical size={18} aria-hidden="true" />
      </div>
    </>
  )
}
