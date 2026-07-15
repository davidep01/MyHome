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
import { useFullyKiosk } from '../../hooks/useFullyKiosk'
import { AmbientLayer } from '../home/layers/AmbientLayer'
import { CriticalEventOverlay } from '../system/CriticalEventOverlay'
import { useCriticalAlerts } from '../../hooks/useCriticalAlerts'
import { useEmergencyMode } from '../../hooks/useEmergencyMode'
import { useKioskHeartbeat } from '../../hooks/useKioskHeartbeat'
import { useTimeOfDay } from '../../hooks/useTimeOfDay'

// Le viste regia sono lazy: il kiosk (percorso primario) carica solo
// TabletDashboard; il desktop scarica ogni pagina al primo accesso.
// Stato resta eager (è la landing).
const EntitiesPage = lazy(() => import('../../pages/EntitiesPage').then((m) => ({ default: m.EntitiesPage })))
const FunctionsPage = lazy(() => import('../../pages/FunctionsPage').then((m) => ({ default: m.FunctionsPage })))
const SystemPage = lazy(() => import('../../pages/SystemPage').then((m) => ({ default: m.SystemPage })))

export function AppShell() {
  const path = usePathname()
  const isDesktop = useIsDesktop()
  const kioskPath = isKioskPath(path)
  const managementPath = isManagementPath(path)

  // Explicit URLs always win. Pointer type only chooses the convenient landing
  // page at `/`; it must never make URL and rendered content disagree.
  if (kioskPath) return <KioskShell />
  if (managementPath) return <DesktopShell path={path} />
  if (path === '/') return isDesktop ? <DesktopShell path={path} /> : <KioskShell />
  return <NotFoundPage />
}

const VIEW_TITLES: Record<ReturnType<typeof viewFromPath>, string> = {
  home: 'Stato',
  entities: 'Entità',
  functions: 'Funzioni',
  system: 'Sistema',
}

function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · MyHome`
  }, [title])
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

function isManagementPath(path: string) {
  return path === '/entities' || path === '/functions' || path === '/system'
    || path === '/backend' || path === '/admin' || path === '/settings'
    || path.startsWith('/backend/') || path.startsWith('/admin/')
}

function isKioskPath(path: string) {
  return path === '/kiosk' || path === '/tablet' || path === '/dashboard' || path.startsWith('/kiosk/') || path.startsWith('/tablet/')
}

function NotFoundPage() {
  useDocumentTitle('Pagina non trovata')
  return (
    <main className="flex h-full w-full items-center justify-center bg-[#f5f5f7] px-6 text-center">
      <div className="glass glass-border max-w-md rounded-[18px] px-6 py-6">
        <h1 className="text-xl font-semibold text-[#1d1d1f]">Pagina non trovata</h1>
        <p className="mt-2 text-sm text-black/55">Questo indirizzo non corrisponde a una vista di MyHome.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a href="/" className="inline-flex min-h-11 items-center rounded-full bg-black/[0.07] px-5 text-sm font-semibold text-[#1d1d1f]">Apri la regia</a>
          <a href="/kiosk" className="inline-flex min-h-11 items-center rounded-full bg-[#0066cc] px-5 text-sm font-semibold text-white">Apri la dashboard</a>
        </div>
      </div>
    </main>
  )
}

function DesktopShell({ path }: { path: string }) {
  const activeView = useUIStore((s) => s.activeView)
  const selectedEntityId = useUIStore((s) => s.selectedEntityId)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const criticalAlerts = useCriticalAlerts()
  const { data: layout } = useTabletLayout('home')
  useViewRouting(path)
  usePerfMode()
  useConfigSync()
  useAutoTheme()
  useDocumentTitle(VIEW_TITLES[activeView])

  useEffect(() => {
    // Same data path as the kiosk: backend SSE stream (token never in browser).
    connectHAStream().catch(console.error)
    return () => disconnectHAStream()
  }, [])

  const page = (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-black/40">Caricamento…</div>}>
      {activeView === 'entities' ? <EntitiesPage /> :
       activeView === 'functions' ? <FunctionsPage /> :
       activeView === 'system' ? <SystemPage /> :
       <StatusPage />}
    </Suspense>
  )

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <a href="#main-content" className="skip-link">Vai al contenuto</a>
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
          <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-hidden outline-none">
            {page}
          </main>
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
        ariaLabel="Dettagli dispositivo"
      >
        {selectedEntityId && <ContextualPanel entityId={selectedEntityId} />}
      </GlassSheet>


      {/* HA-down fullscreen overlay (auto-dismisses on reconnect) */}
      <ConnectionOverlay />

      {/* Doorbell → fullscreen video alert */}
      <DoorbellAlert doorbells={layout?.doorbells ?? []} vision={layout?.ai?.doorbellVision === true} />

      <CriticalEventOverlay alerts={criticalAlerts} shortcuts={layout?.alarm?.shortcuts} />
    </div>
  )
}

function KioskShell() {
  const selectedEntityId = useUIStore((s) => s.selectedEntityId)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const { data: layout } = useTabletLayout('home')
  const criticalAlerts = useCriticalAlerts()
  const { period } = useTimeOfDay()
  usePerfMode(layout?.kiosk?.perfProfile)
  useWakeLock()
  useAutoTheme()
  useFullyKiosk({ ambientBrightness: layout?.kiosk?.screensaver?.brightness })
  useEmergencyMode(criticalAlerts, layout?.alarm?.photo === true)
  useKioskHeartbeat()
  useKioskDocumentMode()
  useDocumentTitle('Dashboard')

  useEffect(() => {
    connectHAStream().catch(() => {})
    return () => disconnectHAStream()
  }, [])

  return (
    <div className="kiosk-root relative h-full w-full overflow-hidden bg-[#f5f5f7]">
      <div className={`kiosk-mesh-overlay kiosk-mesh-${period}`} aria-hidden="true">
        <span className="kiosk-mesh-orb kiosk-mesh-orb-a" />
        <span className="kiosk-mesh-orb kiosk-mesh-orb-b" />
      </div>
      <main id="main-content" className="h-full">
        <TabletDashboard />
      </main>

      <GlassSheet
        open={Boolean(selectedEntityId)}
        onClose={() => setSelectedEntity(null)}
        side="center"
        hideHeader
        ariaLabel="Dettagli dispositivo"
      >
        {selectedEntityId && <ContextualPanel entityId={selectedEntityId} />}
      </GlassSheet>

      <AmbientLayer
        wakeEntityId={layout?.kiosk?.wakeEntityId}
        settings={layout?.kiosk?.screensaver}
        forceWake={criticalAlerts.length > 0}
      />

      <DoorbellAlert kiosk doorbells={layout?.doorbells ?? []} vision={layout?.ai?.doorbellVision === true} />
      <CriticalEventOverlay alerts={criticalAlerts} shortcuts={layout?.alarm?.shortcuts} />
    </div>
  )
}

function useKioskDocumentMode() {
  useEffect(() => {
    document.documentElement.classList.add('kiosk-mode')
    return () => {
      document.documentElement.classList.remove('kiosk-mode')
    }
  }, [])
}
