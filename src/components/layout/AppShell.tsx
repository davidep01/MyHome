import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { RightPanel } from './RightPanel'
import { TabletDashboard } from '../../pages/TabletDashboard'
import { connectHA } from '../../api/ha-websocket'

export function AppShell() {
  useEffect(() => {
    connectHA().catch(console.error)
  }, [])

  return (
    <div
      className="relative flex h-full w-full overflow-hidden"
      style={{ padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)) 16px' }}
    >
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
      <div className="relative flex w-full gap-3 h-full">
        {/* Sidebar */}
        <div className="hidden md:block shrink-0 w-52">
          <Sidebar />
        </div>

        {/* Main canvas */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <TabletDashboard />
        </div>

        {/* Right panel */}
        <div className="hidden lg:block shrink-0 w-72">
          <RightPanel />
        </div>
      </div>
    </div>
  )
}
