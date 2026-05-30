import { create } from 'zustand'

type ThemeMode = 'dark' | 'light'
export type AppView = 'home' | 'climate' | 'security' | 'energy' | 'settings'

interface UIStore {
  activeRoom: string
  activeView: AppView
  theme: ThemeMode
  rightPanelOpen: boolean
  /** Entity shown in the on-demand contextual side panel (null = default weather/news panel). */
  selectedEntityId: string | null
  setActiveRoom: (room: string) => void
  setActiveView: (view: AppView) => void
  setTheme: (theme: ThemeMode) => void
  toggleRightPanel: () => void
  setSelectedEntity: (entityId: string | null) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeRoom: 'all',
  activeView: 'home',
  theme: 'dark',
  rightPanelOpen: true,
  selectedEntityId: null,
  setActiveRoom: (activeRoom) => set({ activeRoom }),
  setActiveView: (activeView) => set({ activeView, selectedEntityId: null }),
  setTheme: (theme) => set({ theme }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setSelectedEntity: (selectedEntityId) => set({ selectedEntityId }),
}))
