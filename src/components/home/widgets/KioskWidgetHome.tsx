import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Check, GripVertical, Pencil, RotateCcw, Save, WifiOff, X } from 'lucide-react'
import { HomeGridCanvas } from './HomeGridCanvas'
import { buildLayout, orderFromLayout, positionsFromLayout, sameLayout } from '../../../lib/homeLayout'
import { useTabletLayout, useSaveTabletLayout } from '../../../hooks/useTabletLayout'
import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'
import { cn } from '../../../lib/utils'
import { WeatherIcon } from '../../weather/WeatherIcon'
import { authApi, type TabletDashboardLayout } from '../../../api/backend'
import { NotificationBell } from '../../notifications/NotificationCenter'

const GRID_GAP = [14, 14] as const

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
            <WeatherIcon code={weather.icon} size={27} />
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
  const authStatus = useQuery({
    queryKey: ['auth-status'],
    queryFn: authApi.status,
    retry: false,
    staleTime: 30_000,
  })
  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState<Layout | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const widgets = useMemo(() => data?.widgets ?? [], [data?.widgets])
  const savedLayout = useMemo(() => buildLayout(widgets, data?.layout.items), [widgets, data?.layout.items])
  const activeLayout = draft ?? savedLayout
  const dirty = draft ? !sameLayout(draft, savedLayout) : false
  const isAdmin = authStatus.data?.authenticated === true && authStatus.data.role === 'admin'
  const editing = editMode && isAdmin

  const beginEdit = () => {
    setMessage(null)
    setDraft(savedLayout)
    setEditMode(true)
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  const enterEdit = () => {
    if (!isAdmin) return
    beginEdit()
  }

  const cancel = () => {
    setDraft(null)
    setEditMode(false)
    setMessage('Modifiche annullate')
  }

  const save = () => {
    if (!isAdmin || !data || !draft) return
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
            {editing ? (
              <p className="truncate text-sm font-semibold text-black/50">Stai modificando solo la disposizione</p>
            ) : (
              <p className="truncate text-sm font-semibold text-black/35">{data.dashboardName}</p>
            )}
            {message && <p aria-live="polite" className="mt-0.5 text-xs font-semibold text-black/45">{message}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
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
            ) : isAdmin ? (
              <button
                type="button"
                onClick={enterEdit}
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-black/[0.06] px-5 text-base font-semibold text-black/60 transition active:scale-95"
              >
                <Pencil size={17} aria-hidden="true" /> Modifica disposizione
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <HomeGridCanvas
            className={cn('relative pb-10', editing && 'kiosk-layout-editing')}
            widgets={widgets}
            layout={activeLayout}
            rowHeight={data.layout.rowHeight}
            gap={GRID_GAP}
            editMode={editing}
            isDraggable={editing}
            draggableCancel="button, input, select, textarea, a"
            publicConfig={data}
            onDrag={(_, __, ___, ____, event) => event.stopPropagation()}
            onDragStop={(nextLayout) => setDraft(buildLayout(widgets, positionsFromLayout(nextLayout, widgets)))}
            renderOverlay={() => (
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
          />
        </div>
      </div>

      {editing && (
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
