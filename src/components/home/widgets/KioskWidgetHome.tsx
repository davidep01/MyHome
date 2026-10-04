import { StackEditor } from './StackEditor'
import { ApiError } from '../../../api/backend'
import { readStorage, writeStorage, removeStorage } from '../../../lib/browserStorage'
import { changeEdit, decodeEdit, editHistory, encodeEdit, stepEdit, type HomeEditHistory, type HomeEditDraft } from '../../../lib/homeEditSession'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { GripVertical, LayoutGrid, Pencil, Plus, Save, WifiOff, X, Undo2, Redo2 } from 'lucide-react'
import { HomeGridCanvas } from './HomeGridCanvas'
import { WidgetPicker } from './WidgetPicker'
import { buildLayout, orderFromLayout, positionsFromLayout, sameLayout } from '../../../lib/homeLayout'
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

type Draft = HomeEditDraft
const DRAFT_KEY = 'simi.home.edit-draft.v1'

/** True when two widget sets carry the same tiles with the same binding + size. */
function sameWidgets(a: HomeWidget[], b: HomeWidget[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((w) => [w.id, w]))
  return a.every((w) => {
    const other = byId.get(w.id)
    return Boolean(other) && other!.type === w.type && other!.size === w.size
      && other!.entityId === w.entityId && other!.groupId === w.groupId
      && other!.label === w.label && JSON.stringify(other!.entityIds) === JSON.stringify(w.entityIds)
  })
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-4 gap-4 pt-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-36 rounded-[18px] bg-[var(--fill-subtle)]" />
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
  const [history, setHistory] = useState<HomeEditHistory | null>(null)
  const draft = history?.present ?? null
  const [recovery, setRecovery] = useState(() => decodeEdit(readStorage(DRAFT_KEY)))
  const setDraft = (next: Draft | null) => setHistory(current => !next ? null : current ? changeEdit(current, next) : editHistory(next))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [stackEditing, setStackEditing] = useState<string | null>(null)
  const [previewWidth, setPreviewWidth] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [activeRoomKey, setActiveRoomKey] = useState<string | null>(null)
  const [spacesOpen, setSpacesOpen] = useState(false)
  const { cameraRowVisible, toggleCameraRow } = useCameraRowVisibility()
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
    () => contentAwareHomeWidgets(savedWidgets, entities, data?.deviceOverrides, data?.groups, data?.hiddenEntities),
    [savedWidgets, entities, data?.deviceOverrides, data?.groups, data?.hiddenEntities],
  )
  const displayLayout = useMemo(
    // Se la vista ha filtrato qualcosa (videocamere, dispositivi non ancora
    // scelti nel wizard), le posizioni salvate lascerebbero buchi al loro
    // posto: si ricompatta la SOLA vista, il layout salvato resta intatto e
    // torna com'era appena il dispositivo viene attivato.
    () => buildLayout(
      displayWidgets,
      displayWidgets.length === savedWidgets.length ? data?.layout.items : undefined,
    ),
    [displayWidgets, savedWidgets.length, data?.layout.items],
  )

  // Auth removed on the LAN → /status reports the admin role on every device,
  // so home customization is available directly on the wall tablet.
  const canEdit = authStatus.data?.role === 'admin'
  const editing = draft !== null && canEdit
  const activeWidgets = editing ? draft.widgets : displayWidgets
  const activeLayout = editing ? draft.layout : displayLayout
  const dirty = editing ? (!sameWidgets(draft.widgets, savedWidgets) || !sameLayout(draft.layout, savedLayout)) : false
  useEffect(() => {
    if (!draft || !canEdit) return
    if (dirty) writeStorage(DRAFT_KEY, encodeEdit(draft))
    else removeStorage(DRAFT_KEY)
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    const keydown = (e: KeyboardEvent) => {
      if (saveLayout.isPending || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]'))) return
      e.preventDefault(); setHistory(current => current ? stepEdit(current, e.shiftKey ? 'redo' : 'undo') : current)
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', keydown) }
  }, [draft, canEdit, dirty, saveLayout.isPending])

  const beginEdit = () => {
    if (!canEdit) return
    setMessage(null)
    setDraft({ widgets: savedWidgets, layout: savedLayout, baseVersion: data?.layoutVersion ?? 0 })
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  const cancel = () => {
    setDraft(null)
    setPickerOpen(false)
    removeStorage(DRAFT_KEY)
    setRecovery(null)
    setMessage('Modifiche annullate')
  }

  /** Re-pack after any change: keep current x/y, re-derive footprints from size. */
  const repack = (widgets: HomeWidget[], layout: Layout, priorityId?: string): Draft => ({
    widgets,
    baseVersion: draft?.baseVersion ?? data?.layoutVersion ?? 0,
    layout: buildLayout(widgets, positionsFromLayout(layout), priorityId),
  })

  const addWidget = (widget: HomeWidget) => {
    if (!draft || saveLayout.isPending) return
    if (draft.widgets.length >= 60) { setMessage('La home può contenere al massimo 60 widget.'); return }
    tapHaptic()
    setDraft(repack([...draft.widgets, widget], draft.layout))
  }

  const removeWidget = (id: string) => {
    if (!draft || saveLayout.isPending) return
    tapHaptic()
    setDraft(repack(draft.widgets.filter((w) => w.id !== id), draft.layout))
  }

  const setWidgetSize = (id: string, size: WidgetSize) => {
    if (!draft || saveLayout.isPending) return
    const widget = draft.widgets.find((w) => w.id === id)
    if (!widget || widget.size === size) return
    tapHaptic()
    setDraft(repack(draft.widgets.map((w) => (w.id === id ? { ...w, size } : w)), draft.layout, id))
  }

  const save = () => {
    if (!data || !draft) return
    setMessage('Salvataggio…')
    saveLayout.mutate({
      layoutVersion: draft.baseVersion,
      widgets: draft.widgets,
      items: positionsFromLayout(draft.layout, draft.widgets),
      order: orderFromLayout(draft.layout),
    }, {
      onSuccess: () => {
        setDraft(null)
        setPickerOpen(false)
        removeStorage(DRAFT_KEY)
        setRecovery(null)
        setMessage('Home aggiornata')
      },
      onError: error => setMessage(error instanceof ApiError && error.status === 409 ? 'La home è cambiata su un altro dispositivo. La bozza è conservata: annulla per caricare la versione corrente.' : 'Salvataggio non riuscito. La bozza è conservata. Riprova.'),
    })
  }

  if (isLoading && !data) {
    return (
      <div className="flex h-full flex-col px-6 py-5">
        <div className="h-20 rounded-[18px] bg-[var(--fill-subtle)]" />
        <LoadingGrid />
      </div>
    )
  }

  if (isError && !data) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--fill-subtle)] text-[var(--ink-secondary)]">
            <WifiOff size={28} />
          </div>
          <p className="mt-4 text-xl font-semibold text-[var(--ink)]">Dashboard temporaneamente non disponibile</p>
          <button
            onClick={() => refetch()}
            className="mt-5 min-h-[48px] rounded-full bg-[var(--action-blue)] px-6 text-base font-semibold text-white active:scale-95"
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
        onCameraRowToggle={() => {
            if (!cameraRowVisible) setActiveRoomKey(null)
            toggleCameraRow()
          }}
      />

      {!editing && activeRoom ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <RoomDashboard
            room={activeRoom}
            overrides={data.deviceOverrides}
            cameraStreamsEnabled={cameraRowVisible}
          />
        </div>
      ) : (
        <>
          {!editing && cameraRowVisible && (
            <div className="h-[clamp(111px,17.25vh,162px)] shrink-0 overflow-hidden">
              <CameraMonitoringRow entityIds={cameraIds} overrides={data.deviceOverrides} compact />
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col">
        {canEdit && recovery && !editing && <div className="simi-editor-recovery" role="status"><p>Hai una bozza della home non salvata{recovery.baseVersion !== data.layoutVersion ? ' basata su una versione precedente' : ''}.</p><div className="flex gap-2"><button className="simi-editor-button" onClick={() => { setDraft(recovery); setRecovery(null) }}>Riprendi bozza</button><button className="simi-editor-button" onClick={() => { removeStorage(DRAFT_KEY); setRecovery(null) }}>Scarta bozza</button></div></div>}
        {editing && <p className="mb-2 text-sm text-[var(--ink-secondary)]">Trascina dalla maniglia, scegli la taglia o rimuovi una card. Annulla/Ripeti conserva fino a 40 passaggi. Le modifiche si applicano solo con Salva.</p>}
        {editing && draft.baseVersion !== data.layoutVersion && <p role="alert" className="mb-2 text-sm text-[var(--danger-red)]">La home è stata aggiornata su un altro dispositivo. La tua bozza resta disponibile; il salvataggio non sovrascrive quella versione.</p>}
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {editing ? (
              <p className="truncate text-sm font-semibold text-[var(--action-blue)]">Personalizzazione home</p>
            ) : (
              <p className="truncate text-sm font-semibold text-[var(--ink-tertiary)]">{data.dashboardName}</p>
            )}
            {message && <p aria-live="polite" className="mt-0.5 text-xs font-semibold text-[var(--ink-secondary)]">{message}</p>}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {editing ? (
              <>
                <button className="simi-editor-button" aria-label="Annulla ultima modifica" disabled={!history?.past.length || saveLayout.isPending} onClick={() => setHistory(h => h ? stepEdit(h, 'undo') : h)}><Undo2 size={18} /></button>
                <button className="simi-editor-button" aria-label="Ripeti modifica" disabled={!history?.future.length || saveLayout.isPending} onClick={() => setHistory(h => h ? stepEdit(h, 'redo') : h)}><Redo2 size={18} /></button>
                <button
                  disabled={saveLayout.isPending || activeWidgets.length >= 60}
                  onClick={() => setPickerOpen(true)}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-[var(--action-blue)] px-5 text-base font-semibold text-white transition active:scale-95"
                >
                  <Plus size={18} /> Aggiungi
                </button>
                <button
                  onClick={save}
                  disabled={!dirty || saveLayout.isPending}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-[var(--action-blue)] px-5 text-base font-semibold text-white transition active:scale-95 disabled:opacity-40"
                >
                  <Save size={18} /> {saveLayout.isPending ? 'Salvataggio…' : 'Salva'}
                </button>
                <button
                  onClick={cancel}
                  disabled={saveLayout.isPending}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-[var(--fill-subtle)] px-5 text-base font-semibold text-[var(--ink-secondary)] transition active:scale-95 disabled:opacity-45"
                >
                  <X size={18} /> Annulla
                </button>
              </>
            ) : canEdit ? (
              <button
                type="button"
                onClick={beginEdit}
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-[var(--fill-subtle)] px-5 text-base font-semibold text-[var(--ink-secondary)] transition active:scale-95"
              >
                <Pencil size={17} aria-hidden="true" /> Personalizza
              </button>
            ) : null}
          </div>
        </div>

        {editing && <label className="mb-2 flex items-center gap-2 text-sm text-[var(--ink-secondary)]">Anteprima tablet
          <select aria-label="Larghezza anteprima tablet" value={previewWidth} onChange={e => setPreviewWidth(Number(e.target.value))} className="simi-editor-button">
            <option value={0}>Questo schermo</option><option value={600}>600 px</option><option value={768}>768 px</option><option value={1024}>1024 px</option><option value={1280}>1280 px</option>
          </select>
        </label>}
        <div
          className="min-h-0 flex-1 overflow-auto overscroll-contain p-2"
        >
          {editing && activeWidgets.length === 0 ? (
            <button
              type="button"
              disabled={saveLayout.isPending || activeWidgets.length >= 60}
                  onClick={() => setPickerOpen(true)}
              className="flex min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-[var(--hairline-strong)] text-[var(--ink-secondary)] transition hover:border-[var(--action-blue)] hover:text-[var(--action-blue)]"
            >
              <LayoutGrid size={30} aria-hidden="true" />
              <span className="text-base font-semibold">Aggiungi il primo widget</span>
            </button>
          ) : (
            <div style={editing && previewWidth ? { width:previewWidth, maxWidth:"none" } : undefined}>
              <HomeGridCanvas
                className={cn('relative', editing && 'kiosk-layout-editing pb-10')}
                widgets={activeWidgets}
                layout={activeLayout}
                rowHeight={data.layout.rowHeight}
                gap={GRID_GAP}
                editMode={editing}
                isDraggable={editing && !saveLayout.isPending}
                draggableCancel="button, input, select, textarea, a"
                publicConfig={data}
                onDrag={(_, __, ___, ____, event) => event.stopPropagation()}
                onDragStop={(nextLayout) => draft && !saveLayout.isPending && setDraft({ ...draft, layout: buildLayout(draft.widgets, positionsFromLayout(nextLayout, draft.widgets)) })}
                renderOverlay={(widget) => (
                  <TileEditOverlay
                    widget={widget}
                    disabled={saveLayout.isPending}
                    onRemove={() => removeWidget(widget.id)}
                    onEdit={widget.type === 'stack' ? () => setStackEditing(widget.id) : undefined}
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

      {stackEditing && draft && <StackEditor key={stackEditing} widget={draft.widgets.find(w => w.id === stackEditing)} curation={data} onClose={() => setStackEditing(null)} onSave={widget => setDraft({ ...draft, widgets:draft.widgets.map(w => w.id === widget.id ? widget : w) })} />}
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
  widget, onRemove, onSizeChange, disabled, onEdit,
}: {
  widget: HomeWidget
  disabled: boolean
  onRemove: () => void
  onEdit?: () => void
  onSizeChange: (size: WidgetSize) => void
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 rounded-[18px] bg-[var(--fill-subtle)] ring-2 ring-[var(--action-blue)]" />
      {/* Full-surface grab layer: blocks accidental device toggles while editing. */}
      <div
        className="absolute inset-0 z-10 cursor-grab rounded-[18px] active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        aria-hidden="true"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label="Rimuovi widget"
        className="pointer-events-auto absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-90"
      >
        <X size={17} aria-hidden="true" />
      </button>
      {onEdit && <button type="button" disabled={disabled} onClick={onEdit} aria-label="Modifica raccolta" className="simi-editor-button pointer-events-auto absolute bottom-2 right-2 z-20"><Pencil size={17} aria-hidden="true" /></button>}
      <select
        disabled={disabled}
        aria-label="Dimensione tile"
        value={widget.size}
        onChange={(event) => onSizeChange(event.target.value as WidgetSize)}
        className="pointer-events-auto absolute bottom-2 left-2 z-20 h-11 min-w-11 max-w-[calc(100%-68px)] rounded-full bg-[var(--surface-solid)] px-2 text-[13px] font-semibold text-[var(--ink)] shadow-lg"
      >
        {SIZE_ORDER.filter((size) => WIDGET_META[widget.type].sizes.includes(size)).map((size) => (
          <option key={size} value={size}>{SIZE_SHORT[size]} · {SIZE_FOOTPRINT[size]}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex h-8 items-center gap-1 rounded-full bg-[var(--surface-elevated)] px-2.5 text-[11px] font-semibold text-[var(--ink-secondary)] shadow-lg">
        <GripVertical size={15} aria-hidden="true" /> Trascina
      </div>
    </>
  )
}
