import { useMemo, useState } from 'react'
import ReactGridLayout, { WidthProvider, type Layout, type LayoutItem } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Check, GripVertical, Pencil, RotateCcw, Save, WifiOff, X } from 'lucide-react'
import { HomeWidgetView } from './HomeWidgetView'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'
import { SIZE_WH } from './widgetCatalog'
import { useTabletLayout, useSaveTabletLayout } from '../../../hooks/useTabletLayout'
import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'
import { cn } from '../../../lib/utils'
import type { HomeWidget, TabletDashboardLayout } from '../../../api/backend'

const COLS = 8
const GRID_GAP = [14, 14] as const
const GRID_PADDING = [0, 0] as const
const GridLayout = WidthProvider(ReactGridLayout)

type HomePositions = TabletDashboardLayout['layout']['items']

function widgetLayoutItem(widget: HomeWidget, pos?: HomePositions[string]): LayoutItem {
  const wh = SIZE_WH[widget.size]
  return {
    i: widget.id,
    x: Math.max(0, Math.min(pos?.x ?? 0, COLS - wh.w)),
    y: Math.max(0, pos?.y ?? 0),
    w: wh.w,
    h: wh.h,
  }
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
    const item = widgetLayoutItem(widget, saved[widget.id])
    if (saved[widget.id] && fits(occupied, item)) {
      layout.push(item)
      occupy(occupied, item)
    } else {
      missing.push(widget)
    }
  })

  missing.forEach((widget) => {
    const { x, y } = firstFreeSlot(occupied, widget)
    const item = widgetLayoutItem(widget, { ...SIZE_WH[widget.size], x, y })
    layout.push(item)
    occupy(occupied, item)
  })

  return layout
}

function positionsFromLayout(layout: Layout, widgets: HomeWidget[]): HomePositions {
  const widgetById = new Map(widgets.map((widget) => [widget.id, widget]))
  return layout.reduce<HomePositions>((acc, item) => {
    const widget = widgetById.get(item.i)
    if (!widget) return acc
    const wh = SIZE_WH[widget.size]
    acc[item.i] = { x: item.x, y: item.y, w: wh.w, h: wh.h }
    return acc
  }, {})
}

function orderFromLayout(layout: Layout): string[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.i)
}

function sameLayout(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((item) => [item.i, item]))
  return a.every((item) => {
    const other = byId.get(item.i)
    return other && item.x === other.x && item.y === other.y && item.w === other.w && item.h === other.h
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
        <p className="mt-2 truncate text-xl font-semibold text-[#1d1d1f]">
          {greeting}, {layout.userName || layout.dashboardName || 'Casa'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {weather && (
          <div className="flex items-center gap-2 rounded-full bg-black/[0.05] px-4 py-2">
            <img src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="" className="h-9 w-9" />
            <span className="text-2xl font-light text-[#1d1d1f]">{weather.temp}°</span>
          </div>
        )}
        <div
          className={cn(
            'flex min-h-[48px] items-center gap-2 rounded-full px-4 text-sm font-semibold',
            online && !cached ? 'bg-green-500/12 text-green-700' : syncing ? 'bg-orange-500/12 text-orange-700' : 'bg-black/[0.06] text-black/55',
          )}
        >
          <span className={cn('h-2.5 w-2.5 rounded-full', online && !cached ? 'bg-green-500' : syncing ? 'bg-orange-400' : 'bg-orange-400')} />
          {online && !cached ? 'Online' : syncing ? 'Sincronizzazione' : 'Offline'}
        </div>
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
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Layout | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const widgets = useMemo(() => data?.widgets ?? [], [data?.widgets])
  const savedLayout = useMemo(() => buildLayout(widgets, data?.layout.items), [widgets, data?.layout.items])
  const activeLayout = draft ?? savedLayout
  const dirty = draft ? !sameLayout(draft, savedLayout) : false

  const enterEdit = async () => {
    setMessage(null)
    setDraft(savedLayout)
    setEditMode(true)
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  const cancel = () => {
    setDraft(null)
    setEditMode(false)
    setMessage('Modifiche annullate')
  }

  const save = () => {
    if (!data || !draft) return
    setMessage('Salvataggio...')
    saveLayout.mutate({
      layoutVersion: data.layoutVersion,
      items: positionsFromLayout(draft, widgets),
      order: orderFromLayout(draft),
    }, {
      onSuccess: () => {
        setDraft(null)
        setEditMode(false)
        setMessage('Modifiche salvate')
      },
      onError: () => {
        setDraft(savedLayout)
        setMessage('Errore salvataggio')
      },
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
            {editMode ? (
              <p className="truncate text-sm font-medium text-black/50">Stai modificando solo la disposizione</p>
            ) : (
              <p className="truncate text-sm font-medium text-black/35">{data.dashboardName}</p>
            )}
            {message && <p className="mt-0.5 text-xs font-medium text-black/45">{message}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={save}
                  disabled={!dirty || saveLayout.isPending}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-[#0066cc] px-5 text-base font-semibold text-white transition active:scale-95 disabled:opacity-45"
                >
                  <Save size={18} /> {saveLayout.isPending ? 'Salvataggio...' : 'Salva'}
                </button>
                <button
                  onClick={cancel}
                  disabled={saveLayout.isPending}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-black/[0.07] px-5 text-base font-semibold text-black/65 transition active:scale-95 disabled:opacity-45"
                >
                  <X size={18} /> Annulla
                </button>
                <button
                  onClick={() => { setDraft(null); setEditMode(false) }}
                  disabled={saveLayout.isPending}
                  className="flex min-h-[48px] items-center gap-2 rounded-full bg-black px-5 text-base font-semibold text-white transition active:scale-95 disabled:opacity-45"
                >
                  <Check size={18} /> Fine
                </button>
              </>
            ) : (
              <button
                onClick={enterEdit}
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-black/[0.06] px-5 text-base font-semibold text-black/60 transition active:scale-95"
              >
                <Pencil size={17} /> Modifica disposizione
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <GridLayout
            className={cn('relative pb-10', editMode && 'kiosk-layout-editing')}
            layout={activeLayout}
            cols={COLS}
            rowHeight={data.layout.rowHeight}
            margin={GRID_GAP}
            containerPadding={GRID_PADDING}
            compactType={null}
            preventCollision={false}
            isBounded
            isDraggable={editMode}
            isResizable={false}
            draggableCancel="button, input, select, textarea, a"
            onDrag={(_, __, ___, ____, event) => event.stopPropagation()}
            onDragStop={(nextLayout) => setDraft(buildLayout(widgets, positionsFromLayout(nextLayout, widgets)))}
            useCSSTransforms
            autoSize
            measureBeforeMount
          >
            {widgets.map((widget) => (
              <div key={widget.id} className="relative min-w-0">
                <WidgetErrorBoundary>
                  <HomeWidgetView widget={widget} publicConfig={data} />
                </WidgetErrorBoundary>

                {editMode && (
                  <>
                    <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-2 ring-[#0066cc]/45" />
                    <div
                      className="absolute inset-0 z-10 cursor-grab rounded-[18px] active:cursor-grabbing"
                      style={{ touchAction: 'none' }}
                      aria-hidden="true"
                    />
                    <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex h-8 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-white/95 text-black/45 shadow-lg">
                      <GripVertical size={18} />
                    </div>
                  </>
                )}
              </div>
            ))}
          </GridLayout>
        </div>
      </div>

      {editMode && (
        <button
          onClick={() => setDraft(savedLayout)}
          disabled={!dirty || saveLayout.isPending}
          className="fixed bottom-[max(18px,env(safe-area-inset-bottom))] left-[max(20px,env(safe-area-inset-left))] z-40 flex min-h-[48px] items-center gap-2 rounded-full bg-white/90 px-5 text-sm font-semibold text-black/60 shadow-lg backdrop-blur active:scale-95 disabled:opacity-40"
        >
          <RotateCcw size={16} /> Ripristina
        </button>
      )}
    </div>
  )
}
