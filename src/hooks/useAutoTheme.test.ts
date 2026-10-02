import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFullyKioskStore } from '../store/fullyKiosk'
const harness = vi.hoisted(() => ({ cleanup: null as (() => void) | null, theme: { themeMode: 'auto', effectiveDark: false } as Record<string, unknown> }))
vi.mock('react', () => ({ useEffect: (effect: () => (() => void) | undefined) => { harness.cleanup = effect() ?? null } }))
vi.mock('../store/theme', () => {
  const patch = (value: object) => Object.assign(harness.theme, value)
  const store = Object.assign((select: (state: unknown) => unknown) => select({ ...harness.theme, _patch: patch }), { getState: () => ({ ...harness.theme, _patch: patch }) })
  return { useThemeStore: store }
})
const appearance = vi.hoisted(() => vi.fn())
vi.mock('../lib/themeAppearance', () => ({ applyDarkAppearance: appearance }))
import { useAutoTheme } from './useAutoTheme'
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  harness.theme = { themeMode: 'auto', effectiveDark: false }
  useFullyKioskStore.getState()._reset()
  vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query.includes('dark') || query.includes('coarse'), addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
})
afterEach(() => { harness.cleanup?.(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('one automatic appearance owner', () => {
  it('applies OS appearance immediately even when a sensor never produces a reading', () => {
    class Sensor { addEventListener() {} start() {} stop() {} }
    Object.assign(window, { AmbientLightSensor: Sensor })
    useAutoTheme()
    expect(appearance).toHaveBeenLastCalledWith(true)
    expect(harness.theme.source).toBe('prefers')
  })
  it('ignores NaN readings and gives Fully priority over browser lux without treating luma as lux', () => {
    let sensor!: Sensor
    class Sensor {
      illuminance = NaN
      listeners = new Map<string, () => void>()
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- retain the native sensor fixture for emitting readings.
      constructor() { sensor = this }
      addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback) }
      start() {} stop() {}
    }
    Object.assign(window, { AmbientLightSensor: Sensor })
    useAutoTheme()
    sensor.listeners.get('reading')!()
    expect(harness.theme.lastLux).toBeNull()
    useFullyKioskStore.getState()._patch({ availability: 'available', ambientLight: 10, ambientLightSource: 'average-luma' })
    sensor.illuminance = 500
    sensor.listeners.get('reading')!()
    vi.advanceTimersByTime(3000)
    expect(appearance).toHaveBeenLastCalledWith(true)
    expect(harness.theme.lastLux).toBeNull()
    expect(harness.theme.lastLuma).toBe(10)
  })
  it('stops a partially started sensor when native start throws', () => {
    const stop = vi.fn()
    class Sensor { addEventListener() {} start() { throw new Error('permission denied') } stop = stop }
    Object.assign(window, { AmbientLightSensor: Sensor })
    useAutoTheme()
    expect(stop).toHaveBeenCalledOnce()
    expect(harness.theme.source).toBe('prefers')
  })
  it('keeps manual appearance immune to Fully and browser readings', () => {
    harness.theme.themeMode = 'light'
    useAutoTheme()
    useFullyKioskStore.getState()._patch({ availability: 'available', ambientLight: 1, ambientLightSource: 'sensor-lux' })
    expect(appearance).toHaveBeenCalledTimes(1)
    expect(appearance).toHaveBeenLastCalledWith(false)
  })
})
