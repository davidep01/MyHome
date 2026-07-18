import { useKioskAudioStore } from '../../store/kioskAudio'

const STANDBY_VOLUME = 0.0001
const TEST_DURATION_MS = 5_000

export interface AlarmAudioElement {
  loop: boolean
  muted: boolean
  paused: boolean
  preload: string
  volume: number
  play: () => Promise<void>
  pause: () => void
}

let channel: AlarmAudioElement | null = null
let emergencyActive = false
let testActive = false
let testTimer: ReturnType<typeof setTimeout> | null = null

function loud(): boolean {
  return emergencyActive || testActive
}

function applyVolume(): void {
  if (!channel) return
  channel.muted = false
  channel.volume = loud() ? 1 : STANDBY_VOLUME
}

/**
 * Arms the static HTML5 audio element. Once playback starts, the same element
 * remains alive at an inaudible volume and an alarm only raises its volume:
 * no new autoplay decision is needed while the kiosk is unattended.
 */
export async function armKioskAlarmChannel(): Promise<boolean> {
  const audio = channel
  if (!audio) {
    useKioskAudioStore.getState()._patch({ status: 'error', playing: false })
    return false
  }
  applyVolume()
  try {
    await audio.play()
    useKioskAudioStore.getState()._patch({ status: 'ready', playing: true })
    return true
  } catch {
    useKioskAudioStore.getState()._patch({ status: 'needs-interaction', playing: false })
    return false
  }
}

export function registerKioskAlarmChannel(audio: AlarmAudioElement): () => void {
  channel = audio
  audio.loop = true
  audio.preload = 'auto'
  applyVolume()
  void armKioskAlarmChannel()
  return () => {
    if (channel !== audio) return
    if (testTimer) clearTimeout(testTimer)
    testTimer = null
    emergencyActive = false
    testActive = false
    audio.pause()
    channel = null
    useKioskAudioStore.getState()._patch({ status: 'initializing', playing: false })
  }
}

export function setKioskAlarmChannelActive(active: boolean): void {
  emergencyActive = active
  applyVolume()
  if (active || channel?.paused) void armKioskAlarmChannel()
}

/** Direct five-second channel test used by the kiosk fleet panel. */
export function testKioskAlarmChannel(durationMs = TEST_DURATION_MS): void {
  testActive = true
  applyVolume()
  void armKioskAlarmChannel()
  if (testTimer) clearTimeout(testTimer)
  testTimer = setTimeout(() => {
    testTimer = null
    testActive = false
    applyVolume()
  }, Math.max(250, durationMs))
}
