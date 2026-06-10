import { useEffect, lazy, Suspense, useState } from 'react'
import { Sidebar } from './Sidebar'
import { BottomTabBar } from './BottomTabBar'
import { TabletDashboard } from '../../pages/TabletDashboard'
import { StatusPage } from '../../pages/StatusPage'
import { connectHAStream, disconnectHAStream } from '../../api/ha-websocket'
import { useUIStore, viewFromPath, VIEW_PATHS } from '../../store/ui'
import { GlassSheet } from '../glass/GlassSheet'
import { ContextualPanel } from '../contextual/ContextualPanel'
import { ConnectionOverlay } from '../system/ConnectionOverlay'
import { DoorbellAlert } from '../system/DoorbellAlert'
import { LiveActivityBar } from '../live/LiveActivityBar'
import { usePerfMode } from '../../hooks/usePerfMode'
import { useWakeLock } from '../../hooks/useWakeLock'
import { useConfigSync } from '../../hooks/useConfigSync'
import { useAutoTheme } from '../../hooks/useAutoTheme'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useTabletLayout } from '../../hooks/useTabletLayout'

// Le viste desktop sono lazy: il kiosk (percorso primario) carica solo TabletDashboard,
// il desktop scarica ogni pagina al primo accesso. Home resta eager (è la landing).
const SettingsPage = lazy(() => import('../../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const EntitiesPage = lazy(() => import('../../pages/EntitiesPage').then((m) => ({ default: m.EntitiesPage })))
const FunctionsPage = lazy(() => import('../../pages/FunctionsPage').then((m) => ({ default: m.FunctionsPage })))
const AreasPage = lazy(() => import('../../pages/AreasPage').then((m) => ({ default: m.AreasPage })))
const LightsPage = lazy(() => import('../../pages/LightsPage').then((m) => ({ default: m.LightsPage })))
const ClimatePage = lazy(() => import('../../pages/ClimatePage').then((m) => ({ default: m.ClimatePage })))
const SecurityPage = lazy(() => import('../../pages/SecurityPage').then((m) => ({ default: m.SecurityPage })))
const EnergyPage = lazy(() => import('../../pages/EnergyPage').then((m) => ({ default: m.EnergyPage })))
const CamerasPage = lazy(() => import('../../pages/CamerasPage').then((m) => ({ default: m.CamerasPage })))
const AutomationsPage = lazy(() => import('../../pages/AutomationsPage').then((m) => ({ default: m.AutomationsPage })))
const MediaPage = lazy(() => import('../../pages/MediaPage').then((m) => ({ default: m.MediaPage })))
const WaterPage = lazy(() => import('../../pages/WaterPage').then((m) => ({ default: m.WaterPage })))
const SystemPage = lazy(() => import('../../pages/SystemPage').then((m) => ({ default: m.SystemPage })))

export function AppShell() {
  const path = usePathname()
  const isDesktop = useIsDesktop()
  const backendPath = isBackendPath(path)
  const kioskPath = isKioskPath(path)

  if (backendPath && !isDesktop) return <DesktopOnlyMessage />
  if (kioskPath || !isDesktop) return <KioskShell />
  return <DesktopShell path={path} />
}

/**
 * Two-way sync between the URL and the active desktop view:
 * deep-link/refresh land on the right page, back/forward navigate views,
 * and nav clicks push a history entry. No router library needed.
 */
function useViewRouting(path: string) {
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)

  // URL → store (popstate, deep link)
  useEffect(() => {
    const view = viewFromPath(path)
    if (view !== useUIStore.getState().activeView) setActiveView(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  // store → URL (nav clicks); skip when the current path already maps to the view
  // (e.g. /backend ↔ home) to avoid history loops on back/forward
  useEffect(() => {
    if (viewFromPath(window.location.pathname) === activeView) return
    window.history.pushState(null, '', VIEW_PATHS[activeView])
  }, [activeView])
}

function usePathname() {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return path
}

function isBackendPath(path: string) {
  return path === '/backend' || path === '/admin' || path.startsWith('/backend/') || path.startsWith('/admin/') || path === '/settings'
}

function isKioskPath(path: string) {
  return path === '/kiosk' || path === '/tablet' || path === '/dashboard' || path.startsWith('/kiosk/') || path.startsWith('/tablet/')
}

function DesktopOnlyMessage() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f5f5f7] px-6 text-center">
      <div className="rounded-[18px] border border-black/10 bg-white/75 px-6 py-5 shadow-sm">
        <p className="text-lg font-semibold text-[#1d1d1f]">Pannello disponibile solo da desktop.</p>
      </div>
    </div>
  )
}

function DesktopShell({ path }: { path: string }) {
  const activeView = useUIStore((s) => s.activeView)
  const selectedEntityId = useUIStore((s) => s.selectedEntityId)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  useViewRouting(path)
  usePerfMode()
  useConfigSync()
  useAutoTheme()

  useEffect(() => {
    // Same data path as the kiosk: backend SSE stream (token never in browser).
    connectHAStream().catch(console.error)
    return () => disconnectHAStream()
  }, [])

  const page = (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-black/40">Caricamento…</div>}>
      {activeView === 'settings' ? <SettingsPage /> :
       activeView === 'entities' ? <EntitiesPage /> :
       activeView === 'functions' ? <FunctionsPage /> :
       activeView === 'areas' ? <AreasPage /> :
       activeView === 'lights' ? <LightsPage /> :
       activeView === 'climate' ? <ClimatePage /> :
       activeView === 'security' ? <SecurityPage /> :
       activeView === 'energy' ? <EnergyPage /> :
       activeView === 'cameras' ? <CamerasPage /> :
       activeView === 'automations' ? <AutomationsPage /> :
       activeView === 'media' ? <MediaPage /> :
       activeView === 'water' ? <WaterPage /> :
       activeView === 'system' ? <SystemPage /> :
       <StatusPage />}
    </Suspense>
  )

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Layout: sidebar | main | right panel */}
      <div
        className="relative flex w-full gap-3 h-full"
        style={{
          // On mobile: add bottom padding for the fixed tab bar (≈72px) + safe area
          // On tablet/desktop: standard safe area padding all around
          paddingTop: 'max(16px, env(safe-area-inset-top))',
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Sidebar rail — tablet+ only */}
        <div className="hidden shrink-0 md:block">
          <Sidebar />
        </div>

        {/* Main canvas — full width; extra bottom padding on mobile for the tab bar */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden pb-[80px] md:pb-0">
          <LiveActivityBar />
          <div className="min-h-0 flex-1 overflow-hidden">
            {page}
          </div>
        </div>
      </div>

      {/* Bottom tab bar — mobile only */}
      <BottomTabBar />

      {/* Contextual device controls — centered modal, always fully on-screen */}
      <GlassSheet
        open={Boolean(selectedEntityId)}
        onClose={() => setSelectedEntity(null)}
        side="center"
        hideHeader
      >
        {selectedEntityId && <ContextualPanel entityId={selectedEntityId} />}
      </GlassSheet>


      {/* HA-down fullscreen overlay (auto-dismisses on reconnect) */}
      <ConnectionOverlay />

      {/* Doorbell → fullscreen video alert */}
      <DoorbellAlert />
    </div>
  )
}

function KioskShell() {
  const selectedEntityId = useUIStore((s) => s.selectedEntityId)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const { data: layout } = useTabletLayout('home')
  usePerfMode()
  useWakeLock()
  useAutoTheme()
  useKioskDocumentMode()
  useKioskIdleDimming()

  useEffect(() => {
    connectHAStream().catch(() => {})
    return () => disconnectHAStream()
  }, [])

  return (
    <div className="kiosk-root relative h-full w-full overflow-hidden bg-[#f5f5f7]">
      <TabletDashboard />

      <GlassSheet
        open={Boolean(selectedEntityId)}
        onClose={() => setSelectedEntity(null)}
        side="center"
        hideHeader
      >
        {selectedEntityId && <ContextualPanel entityId={selectedEntityId} />}
      </GlassSheet>

      <DoorbellAlert kiosk doorbells={layout?.doorbells ?? []} />
    </div>
  )
}

function useKioskDocumentMode() {
  useEffect(() => {
    document.documentElement.classList.add('kiosk-mode')
    const prevent = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault()
    }
    document.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      document.documentElement.classList.remove('kiosk-mode')
      document.removeEventListener('touchmove', prevent)
    }
  }, [])
}

function useKioskIdleDimming() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const markActive = () => {
      document.documentElement.classList.remove('kiosk-idle')
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        document.documentElement.classList.add('kiosk-idle')
      }, 180_000)
    }
    markActive()
    window.addEventListener('pointerdown', markActive)
    window.addEventListener('pointermove', markActive)
    window.addEventListener('keydown', markActive)
    return () => {
      if (timer) clearTimeout(timer)
      document.documentElement.classList.remove('kiosk-idle')
      window.removeEventListener('pointerdown', markActive)
      window.removeEventListener('pointermove', markActive)
      window.removeEventListener('keydown', markActive)
    }
  }, [])
}
