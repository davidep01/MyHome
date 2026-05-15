import { create } from 'zustand'

type ThemeMode = 'dark' | 'light'

interface UIStore {
  activeRoom: string
  theme: ThemeMode
  rightPanelOpen: boolean
  setActiveRoom: (room: string) => void
  setTheme: (theme: ThemeMode) => void
  toggleRightPanel: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeRoom: 'all',
  theme: 'dark',
  rightPanelOpen: true,
  setActiveRoom: (activeRoom) => set({ activeRoom }),
  setTheme: (theme) => set({ theme }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
}))
