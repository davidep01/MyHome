import { create } from 'zustand'

type ThemeMode = 'dark' | 'light'
export type AppView =
  | 'home'
  | 'areas'
  | 'lights'
  | 'climate'
  | 'security'
  | 'energy'
  | 'cameras'
  | 'automations'
  | 'media'
  | 'water'
  | 'system'
  | 'settings'

/** 'auto' = domain sections (default); 'grid' = user's custom tile layout. */
export type DashboardView = 'auto' | 'grid'

/** Canonical URL for every desktop view — keeps the SPA deep-linkable e refresh-safe. */
export const VIEW_PATHS: Record<AppView, string> = {
  home: '/',
  areas: '/areas',
  lights: '/lights',
  climate: '/climate',
  security: '/security',
  energy: '/energy',
  cameras: '/cameras',
  automations: '/automations',
  media: '/media',
  water: '/water',
  system: '/system',
  settings: '/settings',
}

const PATH_VIEWS = new Map(
  (Object.entries(VIEW_PATHS) as [AppView, string][]).map(([view, path]) => [path, view]),
)

export function viewFromPath(pathname: string): AppView {
  const seg = pathname.split('/').filter(Boolean)[0]
  if (!seg || seg === 'backend' || seg === 'admin') return 'home'
  return PATH_VIEWS.get(`/${seg}`) ?? 'home'
}

interface UIStore {
  activeRoom: string
  activeView: AppView
  theme: ThemeMode
  rightPanelOpen: boolean
  /** Entity shown in the on-demand contextual side panel (null = default weather/news panel). */
  selectedEntityId: string | null
  dashboardView: DashboardView
  /** True while the user is arranging the custom tile layout (drag/resize). */
  editMode: boolean
  setActiveRoom: (room: string) => void
  setActiveView: (view: AppView) => void
  setTheme: (theme: ThemeMode) => void
  toggleRightPanel: () => void
  setSelectedEntity: (entityId: string | null) => void
  setDashboardView: (view: DashboardView) => void
  setEditMode: (on: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeRoom: 'all',
  activeView: viewFromPath(window.location.pathname),
  theme: 'dark',
  rightPanelOpen: true,
  selectedEntityId: null,
  dashboardView: 'auto',
  editMode: false,
  setActiveRoom: (activeRoom) => set({ activeRoom }),
  setActiveView: (activeView) => set({ activeView, selectedEntityId: null, editMode: false }),
  setTheme: (theme) => set({ theme }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setSelectedEntity: (selectedEntityId) => set({ selectedEntityId }),
  setDashboardView: (dashboardView) => set({ dashboardView }),
  setEditMode: (editMode) => set({ editMode }),
}))
