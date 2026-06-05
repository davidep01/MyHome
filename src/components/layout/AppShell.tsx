import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { InfoPanel } from './RightPanel'
import { BottomTabBar } from './BottomTabBar'
import { TabletDashboard } from '../../pages/TabletDashboard'
import { AreasPage } from '../../pages/AreasPage'
import { SettingsPage } from '../../pages/SettingsPage'
import { ClimatePage } from '../../pages/ClimatePage'
import { SecurityPage } from '../../pages/SecurityPage'
import { EnergyPage } from '../../pages/EnergyPage'
import { connectHA, disconnectHA } from '../../api/ha-websocket'
import { useUIStore } from '../../store/ui'
import { GlassSheet } from '../glass/GlassSheet'
import { ContextualPanel } from '../contextual/ContextualPanel'
import { ConnectionOverlay } from '../system/ConnectionOverlay'
import { DoorbellAlert } from '../system/DoorbellAlert'
import { useAmbientNightMode } from '../../hooks/useAmbientNightMode'
import { usePerfMode } from '../../hooks/usePerfMode'
import { useWakeLock } from '../../hooks/useWakeLock'

export function AppShell() {
  const activeView = useUIStore((s) => s.activeView)
  const selectedEntityId = useUIStore((s) => s.selectedEntityId)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const infoPanelOpen = useUIStore((s) => s.rightPanelOpen)
  const toggleInfoPanel = useUIStore((s) => s.toggleRightPanel)
  const night = useAmbientNightMode()
  usePerfMode()
  useWakeLock()

  useEffect(() => {
    connectHA().catch(console.error)
    return () => disconnectHA()
  }, [])

  const page =
    activeView === 'settings' ? <SettingsPage /> :
    activeView === 'areas' ? <AreasPage /> :
    activeView === 'climate' ? <ClimatePage /> :
    activeView === 'security' ? <SecurityPage /> :
    activeView === 'energy' ? <EnergyPage /> :
    <TabletDashboard />

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
        <div className="flex-1 min-w-0 overflow-hidden pb-[80px] md:pb-0">
          {page}
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

      {/* Weather + news — on-demand centered modal (was the fixed right bar) */}
      <GlassSheet open={infoPanelOpen} onClose={toggleInfoPanel} side="center" title="Meteo · News">
        <InfoPanel />
      </GlassSheet>

      {/* Night mode dimming scrim (driven by ambient light / clock) */}
      {night && (
        <div
          className="pointer-events-none fixed inset-0 z-[80] transition-opacity duration-700"
          style={{ background: 'rgba(8,6,20,0.34)', mixBlendMode: 'multiply' }}
          aria-hidden="true"
        />
      )}

      {/* HA-down fullscreen overlay (auto-dismisses on reconnect) */}
      <ConnectionOverlay />

      {/* Doorbell → fullscreen video alert */}
      <DoorbellAlert />
    </div>
  )
}
