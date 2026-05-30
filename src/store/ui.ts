import { create } from 'zustand'

type ThemeMode = 'dark' | 'light'
export type AppView = 'home' | 'climate' | 'security' | 'energy' | 'settings'
/** 'auto' = entities discovered live from HA; 'demo' = the curated rooms in db.json. */
export type DashboardSource = 'auto' | 'demo'

interface UIStore {
  activeRoom: string
  activeView: AppView
  theme: ThemeMode
  rightPanelOpen: boolean
  /** Entity shown in the on-demand contextual side panel (null = default weather/news panel). */
  selectedEntityId: string | null
  dashboardSource: DashboardSource
  setActiveRoom: (room: string) => void
  setActiveView: (view: AppView) => void
  setTheme: (theme: ThemeMode) => void
  toggleRightPanel: () => void
  setSelectedEntity: (entityId: string | null) => void
  setDashboardSource: (source: DashboardSource) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeRoom: 'all',
  activeView: 'home',
  theme: 'dark',
  rightPanelOpen: true,
  selectedEntityId: null,
  dashboardSource: 'auto',
  setActiveRoom: (activeRoom) => set({ activeRoom }),
  setActiveView: (activeView) => set({ activeView, selectedEntityId: null }),
  setTheme: (theme) => set({ theme }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setSelectedEntity: (selectedEntityId) => set({ selectedEntityId }),
  setDashboardSource: (dashboardSource) => set({ dashboardSource }),
}))
