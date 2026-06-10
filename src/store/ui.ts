import { create } from 'zustand'

export type AppView =
  | 'home'
  | 'entities'
  | 'functions'
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

/** Canonical URL for every desktop view — keeps the SPA deep-linkable e refresh-safe. */
export const VIEW_PATHS: Record<AppView, string> = {
  home: '/',
  entities: '/entities',
  functions: '/functions',
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
  activeView: AppView
  /** Entity shown in the on-demand contextual side panel (null = default weather/news panel). */
  selectedEntityId: string | null
  /** True while the user is arranging the custom tile layout (drag/resize). */
  editMode: boolean
  setActiveView: (view: AppView) => void
  setSelectedEntity: (entityId: string | null) => void
  setEditMode: (on: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeView: viewFromPath(window.location.pathname),
  selectedEntityId: null,
  editMode: false,
  setActiveView: (activeView) => set({ activeView, selectedEntityId: null, editMode: false }),
  setSelectedEntity: (selectedEntityId) => set({ selectedEntityId }),
  setEditMode: (editMode) => set({ editMode }),
}))
