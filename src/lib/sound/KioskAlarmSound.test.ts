import { afterEach, describe, expect, it, vi } from 'vitest'
import { startKioskAlarmSound } from './KioskAlarmSound'

const location = { protocol: 'http:', hostname: '192.168.1.40', origin: 'http://192.168.1.40:3001' }

describe('Fully Kiosk emergency audio', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('wakes the kiosk and loops the native siren on the Android media stream', () => {
    const setAudioVolume = vi.fn<(level: number, stream: number) => void>()
    const playSound = vi.fn<(url: string, loop: boolean, stream?: number) => void>()
    const stopSound = vi.fn<() => void>()
    const turnScreenOn = vi.fn<() => void>()
    const stop = startKioskAlarmSound({
      getAudioVolume: (stream) => stream === 4 ? 45 : stream === 3 ? 35 : 60,
      setAudioVolume,
      playSound,
      stopSound,
      turnScreenOn,
      isMusicActive: () => true,
      stopTextToSpeech: vi.fn(),
    }, location, 'intrusion')

    expect(turnScreenOn).toHaveBeenCalledOnce()
    expect(setAudioVolume).toHaveBeenCalledWith(100, 4)
    expect(setAudioVolume).toHaveBeenCalledWith(100, 3)
    expect(setAudioVolume).toHaveBeenCalledWith(100, 9)
    expect(playSound).toHaveBeenCalledWith('http://192.168.1.40:3001/alarm-siren.wav?v=3', true, 3)

    stop()
    // Una pulizia preventiva elimina player nativi rimasti attivi; la seconda
    // chiamata è il cleanup della simulazione corrente.
    expect(stopSound).toHaveBeenCalledTimes(2)
    expect(setAudioVolume).toHaveBeenCalledWith(45, 4)
    expect(setAudioVolume).toHaveBeenCalledWith(35, 3)
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

  it('retries and announces when native playback cannot be verified', () => {
    vi.useFakeTimers()
    const playSound = vi.fn<(url: string, loop: boolean, stream?: number) => void>()
    const textToSpeech = vi.fn<(text: string) => void>()
    const stop = startKioskAlarmSound({
      setAudioVolume: vi.fn(),
      playSound,
      stopSound: vi.fn(),
      isMusicActive: () => false,
      textToSpeech,
      stopTextToSpeech: vi.fn(),
    }, location, 'siren')

    expect(playSound).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1_500)
    expect(playSound).toHaveBeenCalledTimes(2)
    expect(textToSpeech).toHaveBeenCalledWith('Attenzione. Sirena di emergenza attiva.')
    stop()
  })

  it('falls back to native TTS when the siren asset is not reachable', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const textToSpeech = vi.fn<(text: string) => void>()
    const stopSound = vi.fn<() => void>()
    const stop = startKioskAlarmSound({
      setAudioVolume: vi.fn(),
      playSound: vi.fn(),
      stopSound,
      textToSpeech,
      stopTextToSpeech: vi.fn(),
    }, location, 'intrusion')

    await Promise.resolve()
    expect(stopSound).toHaveBeenCalled()
    expect(textToSpeech).toHaveBeenCalledTimes(1)
    stop()
  })
})
