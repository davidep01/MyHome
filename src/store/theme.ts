import { create } from 'zustand'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ThemeSource = 'sensor' | 'prefers' | 'manual'
export type SensorState = 'unsupported' | 'permission_denied' | 'active' | 'error' | 'disabled'

const KEY = 'myhome.themeMode'

function initialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto'
}

interface ThemeStore {
  themeMode: ThemeMode
  effectiveDark: boolean
  source: ThemeSource
  sensorState: SensorState
  lastLux: number | null
  setThemeMode: (m: ThemeMode) => void
  /** internal: updated by useAutoTheme */
  _patch: (p: Partial<Pick<ThemeStore, 'effectiveDark' | 'source' | 'sensorState' | 'lastLux'>>) => void
}

export const useThemeStore = create<ThemeStore>((set) => ({
  themeMode: initialMode(),
  effectiveDark: false,
  source: 'prefers',
  sensorState: 'disabled',
  lastLux: null,
  setThemeMode: (themeMode) => {
    try { localStorage.setItem(KEY, themeMode) } catch { /* private mode */ }
    set({ themeMode })
  },
  _patch: (p) => set(p),
}))
