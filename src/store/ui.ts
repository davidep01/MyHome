import { create } from 'zustand'

/**
 * Viste desktop = la regia (DOMINICA): Stato, Entità, Funzioni, Sistema.
 * Il controllo della casa vive sul kiosk (/kiosk), identico su ogni device.
 */
export type AppView = 'home' | 'entities' | 'functions' | 'system'

/** Canonical URL for every desktop view — keeps the SPA deep-linkable e refresh-safe. */
export const VIEW_PATHS: Record<AppView, string> = {
  home: '/',
  entities: '/entities',
  functions: '/functions',
  system: '/system',
}

const PATH_VIEWS = new Map(
  (Object.entries(VIEW_PATHS) as [AppView, string][]).map(([view, path]) => [path, view]),
)

/** Alias legacy (bookmark pre-DOMINICA) → vista più vicina. */
const LEGACY_VIEWS = new Map<string, AppView>([
  ['/settings', 'system'],
])

export function viewFromPath(pathname: string): AppView {
  const seg = pathname.split('/').filter(Boolean)[0]
  if (!seg || seg === 'backend' || seg === 'admin') return 'home'
  return PATH_VIEWS.get(`/${seg}`) ?? LEGACY_VIEWS.get(`/${seg}`) ?? 'home'
}

interface UIStore {
  activeView: AppView
  /** Entity shown in the on-demand contextual side panel (null = default weather/news panel). */
  selectedEntityId: string | null
  /** Camera rendered in the dedicated viewport-filling live overlay. */
  fullscreenCameraId: string | null
  /** True while the user is arranging the custom tile layout (drag/resize). */
  editMode: boolean
  setActiveView: (view: AppView) => void
  setSelectedEntity: (entityId: string | null) => void
  setFullscreenCamera: (entityId: string | null) => void
  setEditMode: (on: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeView: viewFromPath(window.location.pathname),
  selectedEntityId: null,
  fullscreenCameraId: null,
  editMode: false,
  setActiveView: (activeView) => set({ activeView, selectedEntityId: null, fullscreenCameraId: null, editMode: false }),
  setSelectedEntity: (selectedEntityId) => set({ selectedEntityId }),
  setFullscreenCamera: (fullscreenCameraId) => set({ fullscreenCameraId }),
  setEditMode: (editMode) => set({ editMode }),
}))
