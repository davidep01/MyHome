import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CriticalAlert } from '../lib/criticalAlerts'
const harness = vi.hoisted(() => ({ cleanups: [] as Array<() => void>, upload: vi.fn(), image: vi.fn(), patch: vi.fn() }))
vi.mock('react', () => ({ useRef: (current: unknown) => ({ current }), useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) harness.cleanups.push(cleanup) } }))
vi.mock('../api/backend', () => ({ alarmApi: { uploadPhoto: harness.upload } }))
vi.mock('../store/fullyKiosk', () => ({ useFullyKioskStore: { getState: () => ({ _patch: harness.patch }) } }))
vi.mock('../lib/fullyKiosk', () => ({ createFullyKioskBridge: () => ({ getCamshotDataUrl: harness.image, getDeviceId: () => 'tablet' }) }))
import { useEmergencyMode } from './useEmergencyMode'
const alert = { id: 'smoke:sensor', changedAt: '2026-10-02T07:00:00Z' } as CriticalAlert
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  harness.upload.mockResolvedValue({ ok: true })
  const storage = new Map<string, string>()
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: {}, localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } }))
})
afterEach(() => { harness.cleanups.splice(0).forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('emergency capture lifecycle', () => {
  it('retries a failed capture and uploads exactly once after a valid image', async () => {
    harness.image.mockReturnValueOnce(null).mockReturnValue('data:image/jpeg;base64,photo')
    useEmergencyMode([alert], true)
    expect(harness.upload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(harness.upload).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(harness.upload).toHaveBeenCalledOnce()
  })
  it('stops retries after cleanup and never captures a simulation', async () => {
    harness.image.mockReturnValue(null)
    useEmergencyMode([alert], true)
    harness.cleanups.splice(0).forEach((cleanup) => cleanup())
    await vi.advanceTimersByTimeAsync(10_000)
    expect(harness.image).toHaveBeenCalledOnce()
    vi.clearAllMocks()
    useEmergencyMode([{ ...alert, test: true }], true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(harness.image).not.toHaveBeenCalled()
    expect(harness.upload).not.toHaveBeenCalled()
  })
})
