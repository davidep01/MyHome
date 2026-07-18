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
