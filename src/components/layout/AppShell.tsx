import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { RightPanel } from './RightPanel'
import { BottomTabBar } from './BottomTabBar'
import { TabletDashboard } from '../../pages/TabletDashboard'
import { SettingsPage } from '../../pages/SettingsPage'
import { ClimatePage } from '../../pages/ClimatePage'
import { SecurityPage } from '../../pages/SecurityPage'
import { EnergyPage } from '../../pages/EnergyPage'
import { connectHA, disconnectHA } from '../../api/ha-websocket'
import { useUIStore } from '../../store/ui'
import { GlassSheet } from '../glass/GlassSheet'
import { ContextualPanel } from '../contextual/ContextualPanel'

export function AppShell() {
  const activeView = useUIStore((s) => s.activeView)
  const selectedEntityId = useUIStore((s) => s.selectedEntityId)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)

  useEffect(() => {
    connectHA().catch(console.error)
    return () => disconnectHA()
  }, [])

  const page =
    activeView === 'settings' ? <SettingsPage /> :
    activeView === 'climate' ? <ClimatePage /> :
    activeView === 'security' ? <SecurityPage /> :
    activeView === 'energy' ? <EnergyPage /> :
    <TabletDashboard />

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Ambient background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute -bottom-40 -right-20 h-80 w-80 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #a855f7 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute top-1/2 left-1/3 h-64 w-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #f97316 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

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

        {/* Main canvas — extra bottom padding on mobile for the tab bar */}
        <div className="flex-1 min-w-0 overflow-hidden pb-[80px] md:pb-0">
          {page}
        </div>

        {/* Right panel — desktop only (contextual device controls or weather/news) */}
        <div className="hidden shrink-0 lg:block lg:w-80">
          <RightPanel />
        </div>
      </div>

      {/* Bottom tab bar — mobile only */}
      <BottomTabBar />

      {/* Contextual device controls — mobile/tablet sheet (desktop uses the right panel) */}
      <div className="lg:hidden">
        <GlassSheet
          open={Boolean(selectedEntityId)}
          onClose={() => setSelectedEntity(null)}
          side="bottom"
          className="max-h-[88vh] overflow-y-auto"
        >
          {selectedEntityId && <ContextualPanel entityId={selectedEntityId} />}
        </GlassSheet>
      </div>
    </div>
  )
}
