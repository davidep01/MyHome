import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useKioskAudioStore } from '../../store/kioskAudio'
import {
  armKioskAlarmChannel,
  registerKioskAlarmChannel,
  setKioskAlarmChannelActive,
  testKioskAlarmChannel,
  type AlarmAudioElement,
} from './KioskAlarmChannel'

function audioElement(blocked = false): AlarmAudioElement {
  const audio: AlarmAudioElement = {
    loop: false,
    muted: true,
    paused: true,
    preload: 'none',
    volume: 0,
    play: vi.fn(async () => {
      if (blocked) throw new Error('NotAllowedError')
      audio.paused = false
    }),
    pause: vi.fn(() => { audio.paused = true }),
  }
  return audio
}

beforeEach(() => {
  vi.useRealTimers()
  useKioskAudioStore.getState()._patch({ status: 'initializing', playing: false })
})

describe('persistent kiosk alarm channel', () => {
  it('keeps one authorized element alive and raises only its volume for emergencies', async () => {
    const audio = audioElement()
    const unregister = registerKioskAlarmChannel(audio)
    await Promise.resolve()

    expect(audio.loop).toBe(true)
    expect(audio.volume).toBeLessThan(0.001)
    expect(useKioskAudioStore.getState()).toMatchObject({ status: 'ready', playing: true })

    setKioskAlarmChannelActive(true)
    expect(audio.volume).toBe(1)
    setKioskAlarmChannelActive(false)
    expect(audio.volume).toBeLessThan(0.001)
    unregister()
  })

  it('reports that a physical interaction is required when autoplay is blocked', async () => {
    const audio = audioElement(true)
    const unregister = registerKioskAlarmChannel(audio)
    await Promise.resolve()
    await Promise.resolve()

    expect(useKioskAudioStore.getState().status).toBe('needs-interaction')
    await expect(armKioskAlarmChannel()).resolves.toBe(false)
    unregister()
  })

  it('supports a direct timed test without stopping a concurrent emergency', async () => {
    vi.useFakeTimers()
    const audio = audioElement()
    const unregister = registerKioskAlarmChannel(audio)
    await Promise.resolve()

    testKioskAlarmChannel(500)
    expect(audio.volume).toBe(1)
    setKioskAlarmChannelActive(true)
    vi.advanceTimersByTime(500)
    expect(audio.volume).toBe(1)
    setKioskAlarmChannelActive(false)
    expect(audio.volume).toBeLessThan(0.001)
    unregister()
  })
})
