import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFullyKioskStore, EMPTY_FULLY_KIOSK_CAPABILITIES } from '../store/fullyKiosk'
import { useFullyKiosk } from './useFullyKiosk'

const harness = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }))
const bridge = vi.hoisted(() => ({
  capabilities: { motionStart: false, motionStop: false, soundPlayback: false },
  getBrightness: vi.fn(() => 80),
  getScreenOn: vi.fn(() => false),
  isMotionRunning: vi.fn(() => false),
  readAmbientLight: vi.fn(() => null),
  turnScreenOn: vi.fn(() => true),
  setBrightness: vi.fn(() => true),
}))
vi.mock('react', () => ({ useEffect: (effect: () => (() => void) | undefined) => {
  const cleanup = effect()
  if (cleanup) harness.cleanups.push(cleanup)
} }))
vi.mock('../lib/fullyKiosk', () => ({
  adaptiveBrightnessFor: vi.fn(),
  createFullyKioskBridge: () => bridge,
  fullyKioskAvailability: () => 'available',
  ensureFullyAlarmAudioSetting: vi.fn(),
  ensureFullyEventBindings: vi.fn(),
  isFullyKioskEventName: () => false,
  FULLY_KIOSK_EVENT: 'myhome:fully-event',
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    location: { hostname: '192.168.1.10' },
    setInterval, clearInterval,
  }))
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  bridge.capabilities = { ...EMPTY_FULLY_KIOSK_CAPABILITIES }
  useFullyKioskStore.getState()._patch({ emergencyActive: false })
  useFullyKioskStore.getState()._reset()
})
afterEach(() => {
  for (const cleanup of harness.cleanups.splice(0)) cleanup()
  useFullyKioskStore.getState()._patch({ emergencyActive: false })
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Fully bridge emergency lifecycle', () => {
  it('wakes and applies full brightness when the emergency was already active at mount', () => {
    useFullyKioskStore.getState()._patch({ emergencyActive: true })
    useFullyKiosk()
    expect(bridge.turnScreenOn).toHaveBeenCalledOnce()
    expect(bridge.setBrightness).toHaveBeenCalledWith(255)
    useFullyKioskStore.getState()._patch({ emergencyActive: false })
    expect(bridge.setBrightness).toHaveBeenLastCalledWith(80)
  })

  it('preserves emergency intent and reapplies it when settings recreate the bridge', () => {
    useFullyKioskStore.getState()._patch({ emergencyActive: true })
    useFullyKiosk({ ambientBrightness: 28 })
    harness.cleanups.pop()!()
    expect(useFullyKioskStore.getState().emergencyActive).toBe(true)
    useFullyKiosk({ ambientBrightness: 40 })
    expect(bridge.turnScreenOn).toHaveBeenCalledTimes(2)
    expect(bridge.setBrightness).toHaveBeenLastCalledWith(255)
  })

  it('does not enter emergency for an ordinary initial state', () => {
    useFullyKiosk()
    expect(bridge.turnScreenOn).not.toHaveBeenCalled()
    expect(bridge.setBrightness).not.toHaveBeenCalledWith(255)
  })
})
