import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { GripVertical, LayoutGrid, Pencil, Plus, Save, WifiOff, X } from 'lucide-react'
import { HomeGridCanvas } from './HomeGridCanvas'
import { WidgetPicker } from './WidgetPicker'
import { buildLayout, layoutPixelHeight, orderFromLayout, positionsFromLayout, sameLayout } from '../../../lib/homeLayout'
import { useTabletLayout, useSaveTabletLayout } from '../../../hooks/useTabletLayout'
import { useEntityStore } from '../../../store/entities'
import { useHaptic } from '../../../hooks/useHaptic'
import { cn } from '../../../lib/utils'
import { authApi, type HomeWidget, type WidgetSize } from '../../../api/backend'
import { StatusHeader } from '../layers/StatusHeader'
import { CameraMonitoringRow } from '../layers/CameraMonitoringRow'
import { RoomDashboard } from '../layers/RoomDashboard'
import { RoomsRow, type RoomTarget } from '../layers/RoomsRow'
import { SpacesCatalog } from '../layers/SpacesCatalog'
import { useRoomsOverview } from '../../../hooks/useRoomsOverview'
import { selectDashboardCameraIds } from '../../../lib/dashboardSelection'
import { contentAwareHomeWidgets } from '../../../lib/contentAwareHome'
import { useCameraRowVisibility } from '../../../hooks/useCameraRowVisibility'
import { WIDGET_META } from './widgetCatalog'

const GRID_GAP = [14, 14] as const
const SIZE_SHORT: Record<WidgetSize, string> = { xs: 'XS', sm: 'S', md: 'M', lg: 'L', wide: 'XL' }
const SIZE_FOOTPRINT: Record<WidgetSize, string> = {
  xs: '1 slot, mini', sm: '1 slot', md: '2 slot', lg: '3 slot, 2 righe', wide: '3 slot, 1 riga',
}
const SIZE_ORDER: WidgetSize[] = ['xs', 'sm', 'md', 'lg', 'wide']

interface Draft {
  widgets: HomeWidget[]
  layout: Layout
}

function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const next = Math.floor(element.getBoundingClientRect().height)
      setHeight((current) => current === next ? current : next)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return height
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
  const [activeRoomKey, setActiveRoomKey] = useState<string | null>(null)
  const [spacesOpen, setSpacesOpen] = useState(false)
  const { cameraRowVisible, toggleCameraRow } = useCameraRowVisibility()
  const gridViewportRef = useRef<HTMLDivElement>(null)
  const gridViewportHeight = useElementHeight(gridViewportRef)
  const entities = useEntityStore((state) => state.entities)
  const { rooms } = useRoomsOverview({ hiddenEntities: data?.hiddenEntities, overrides: data?.deviceOverrides })
  const activeRoom = rooms.find((room) => room.key === activeRoomKey) ?? null
  const preferredCameraIds = useMemo(
    () => (data?.doorbells ?? [])
      .filter((doorbell) => doorbell.active !== false && doorbell.cameraEntityId)
      .map((doorbell) => doorbell.cameraEntityId!),
    [data?.doorbells],
  )
  const cameraIds = useMemo(() => selectDashboardCameraIds(entities, {
    hiddenEntities: data?.hiddenEntities,
    overrides: data?.deviceOverrides,
    preferredEntityIds: preferredCameraIds,
    limit: 3,
  }), [entities, data?.hiddenEntities, data?.deviceOverrides, preferredCameraIds])

  const openRoom = (room: RoomTarget) => {
    setActiveRoomKey(room.key)
    setSpacesOpen(false)
  }

  const savedWidgets = useMemo(() => data?.widgets ?? [], [data?.widgets])
  const savedLayout = useMemo(() => buildLayout(savedWidgets, data?.layout.items), [savedWidgets, data?.layout.items])
  const displayWidgets = useMemo(
    () => contentAwareHomeWidgets(savedWidgets, entities, data?.deviceOverrides, data?.groups),
    [savedWidgets, entities, data?.deviceOverrides, data?.groups],
  )
  const displayLayout = useMemo(
    () => buildLayout(displayWidgets, data?.layout.items),
    [displayWidgets, data?.layout.items],
  )

  // Auth removed on the LAN → /status reports the admin role on every device,
  // so home customization is available directly on the wall tablet.
  const canEdit = authStatus.data?.role === 'admin'
  const editing = draft !== null && canEdit
  const activeWidgets = editing ? draft.widgets : displayWidgets
  const activeLayout = editing ? draft.layout : displayLayout
  const dirty = editing ? (!sameWidgets(draft.widgets, savedWidgets) || !sameLayout(draft.layout, savedLayout)) : false
  const naturalGridHeight = layoutPixelHeight(activeLayout, data?.layout.rowHeight ?? 64, GRID_GAP[1])
  const fitScale = !editing && gridViewportHeight > 0 && naturalGridHeight > gridViewportHeight
    ? gridViewportHeight / naturalGridHeight
    : 1

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
  const repack = (widgets: HomeWidget[], layout: Layout, priorityId?: string): Draft => ({
    widgets,
    layout: buildLayout(widgets, positionsFromLayout(layout), priorityId),
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

  const setWidgetSize = (id: string, size: WidgetSize) => {
    if (!draft) return
    const widget = draft.widgets.find((w) => w.id === id)
    if (!widget || widget.size === size) return
    tapHaptic()
    setDraft(repack(draft.widgets.map((w) => (w.id === id ? { ...w, size } : w)), draft.layout, id))
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
    <div className="kiosk-burnin-shift flex h-full flex-col gap-3.5 px-[max(22px,env(safe-area-inset-left))] py-[max(14px,env(safe-area-inset-top))]">
      <StatusHeader
        userName={data.userName || data.dashboardName}
        contextTitle={activeRoom?.title}
        alerts={[]}
        onAlertTap={() => undefined}
        cameraRowVisible={cameraRowVisible}
        onCameraRowToggle={toggleCameraRow}
      />

      {!editing && activeRoom ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <RoomDashboard room={activeRoom} overrides={data.deviceOverrides} />
        </div>
      ) : (
        <>
          {!editing && cameraRowVisible && (
            <div className="h-[clamp(111px,17.25vh,162px)] shrink-0 overflow-hidden">
              <CameraMonitoringRow entityIds={cameraIds} overrides={data.deviceOverrides} compact />
            </div>
          )}
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

        <div
          ref={gridViewportRef}
          className={cn('min-h-0 flex-1', editing ? 'overflow-y-auto overscroll-contain pr-1' : 'overflow-hidden')}
        >
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
            <div
              style={fitScale < 1 ? {
                width: `${100 / fitScale}%`,
                transform: `scale(${fitScale})`,
                transformOrigin: 'top left',
              } : undefined}
            >
              <HomeGridCanvas
                className={cn('relative', editing && 'kiosk-layout-editing pb-10')}
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
                    onSizeChange={(size) => setWidgetSize(widget.id, size)}
                  />
                )}
              />
            </div>
          )}
        </div>
          </div>
        </>
      )}

      {!editing && (
        <RoomsRow
          hiddenEntities={data.hiddenEntities}
          overrides={data.deviceOverrides}
          onOpen={openRoom}
          onZoomOut={() => setSpacesOpen(true)}
          activeRoomKey={activeRoom?.key}
          onHome={() => setActiveRoomKey(null)}
        />
      )}

      <SpacesCatalog
        open={spacesOpen}
        hiddenEntities={data.hiddenEntities}
        overrides={data.deviceOverrides}
        onClose={() => setSpacesOpen(false)}
        onOpenRoom={openRoom}
      />

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
  widget, onRemove, onSizeChange,
}: {
  widget: HomeWidget
  onRemove: () => void
  onSizeChange: (size: WidgetSize) => void
}) {
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
        className="pointer-events-auto absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-90"
      >
        <X size={17} aria-hidden="true" />
      </button>
      <div
        className="pointer-events-auto absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center rounded-full bg-white/95 p-1 shadow-lg ring-1 ring-black/[0.05]"
        role="group"
        aria-label="Dimensione tile"
      >
        {SIZE_ORDER.filter((size) => WIDGET_META[widget.type].sizes.includes(size)).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => onSizeChange(size)}
            aria-label={`Dimensione ${SIZE_SHORT[size]}, ${SIZE_FOOTPRINT[size]}`}
            aria-pressed={widget.size === size}
            className={cn(
              'flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-bold transition active:scale-90',
              widget.size === size ? 'bg-[#0066cc] text-white shadow-sm' : 'text-black/45 hover:bg-black/[0.05]',
            )}
          >
            {SIZE_SHORT[size]}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex h-8 items-center gap-1 rounded-full bg-white/95 px-2.5 text-[11px] font-semibold text-black/45 shadow-lg">
        <GripVertical size={15} aria-hidden="true" /> Trascina
      </div>
    </>
  )
}
