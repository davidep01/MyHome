import { afterEach, describe, expect, it, vi } from 'vitest'
import { startKioskAlarmSound } from './KioskAlarmSound'

const location = { protocol: 'http:', hostname: '192.168.1.40', origin: 'http://192.168.1.40:3001' }

describe('Fully Kiosk emergency audio', () => {
  afterEach(() => vi.useRealTimers())

  it('loops the native siren on the Android alarm stream and restores volume', () => {
    const setAudioVolume = vi.fn<(level: number, stream: number) => void>()
    const playSound = vi.fn<(url: string, loop: boolean, stream?: number) => void>()
    const stopSound = vi.fn<() => void>()
    const stop = startKioskAlarmSound({
      getAudioVolume: (stream) => stream === 4 ? 45 : 60,
      setAudioVolume,
      playSound,
      stopSound,
      stopTextToSpeech: vi.fn(),
    }, location, 'intrusion')

    expect(setAudioVolume).toHaveBeenCalledWith(100, 4)
    expect(playSound).toHaveBeenCalledWith('http://192.168.1.40:3001/alarm-siren.wav', true, 4)

    stop()
    expect(stopSound).toHaveBeenCalledOnce()
    expect(setAudioVolume).toHaveBeenCalledWith(45, 4)
    expect(setAudioVolume).toHaveBeenCalledWith(60, 9)
  })

  it('repeats native TTS when playSound is unavailable', () => {
    vi.useFakeTimers()
    const textToSpeech = vi.fn<(text: string) => void>()
    const stop = startKioskAlarmSound({
      setAudioVolume: vi.fn(),
      textToSpeech,
      stopTextToSpeech: vi.fn(),
    }, location, 'smoke')

    expect(textToSpeech).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(12_000)
    expect(textToSpeech).toHaveBeenCalledTimes(3)
    stop()
  })
})
