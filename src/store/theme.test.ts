import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('can mount and change appearance when browser storage is unavailable', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('storage denied') },
    setItem: () => { throw new Error('storage denied') },
  })
  const { useThemeStore } = await import('./theme')
  expect(useThemeStore.getState().themeMode).toBe('auto')
  useThemeStore.getState().setThemeMode('dark')
  expect(useThemeStore.getState().themeMode).toBe('dark')
})
