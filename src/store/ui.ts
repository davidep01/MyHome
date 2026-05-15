import { create } from 'zustand'

type ThemeMode = 'dark' | 'light'
type AppView = 'dashboard' | 'settings'

interface UIStore {
  activeRoom: string
  activeView: AppView
  theme: ThemeMode
  rightPanelOpen: boolean
  setActiveRoom: (room: string) => void
  setActiveView: (view: AppView) => void
  setTheme: (theme: ThemeMode) => void
  toggleRightPanel: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeRoom: 'all',
  activeView: 'dashboard',
  theme: 'dark',
  rightPanelOpen: true,
  setActiveRoom: (activeRoom) => set({ activeRoom }),
  setActiveView: (activeView) => set({ activeView }),
  setTheme: (theme) => set({ theme }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
}))
