import { afterEach, describe, expect, it, vi } from 'vitest'
import { startRepeatingSound } from './SoundManager'

describe('startRepeatingSound', () => {
  afterEach(() => vi.useRealTimers())

  it('starts immediately, repeats on schedule and stops cleanly', () => {
    vi.useFakeTimers()
    const play = vi.fn()
    const stop = startRepeatingSound(play, 3_000)

    expect(play).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(9_000)
    expect(play).toHaveBeenCalledTimes(4)

    stop()
    vi.advanceTimersByTime(9_000)
    expect(play).toHaveBeenCalledTimes(4)
  })
})

describe('notification preferences', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

  it.each([
    [null, 0.7], ['0', 0], ['0.4', 0.4], ['', 0.7], ['invalid', 0.7], ['2', 0.7],
  ])('initializes volume from %s as %s', async (raw, expected) => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { getItem: (key: string) => key.endsWith('volume') ? raw : null })
    const { soundManager } = await import('./SoundManager')
    expect(soundManager.getVolume()).toBe(expected)
  })

  it('keeps audio usable when storage reads and writes are denied', async () => {
    vi.resetModules()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
    })
    const { soundManager } = await import('./SoundManager')
    expect(soundManager.getVolume()).toBe(0.7)
    expect(() => { soundManager.setMuted(true); soundManager.setVolume(0.3) }).not.toThrow()
    expect(soundManager.isMuted()).toBe(true)
    expect(soundManager.getVolume()).toBe(0.3)
    soundManager.setVolume(NaN)
    expect(soundManager.getVolume()).toBe(0.3)
  })
  it('notifies all mounted consumers and attaches autoplay listeners only once', async () => {
    vi.resetModules()
    const addEventListener = vi.fn()
    vi.stubGlobal('window', { addEventListener })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
    const { soundManager } = await import('./SoundManager')
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe = soundManager.subscribe(first)
    soundManager.subscribe(second)
    soundManager.init()
    soundManager.init()
    expect(addEventListener).toHaveBeenCalledTimes(2)
    soundManager.setMuted(true)
    soundManager.setVolume(0.2)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    unsubscribe()
    soundManager.setMuted(false)
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(3)
  })

})
