import { create } from 'zustand'
import type {
  FullyAmbientSource,
  FullyKioskAvailability,
  FullyKioskCapabilities,
} from '../lib/fullyKiosk'

export const EMPTY_FULLY_KIOSK_CAPABILITIES: FullyKioskCapabilities = {
  bindEvents: false,
  averageLuma: false,
  hardwareLux: false,
  brightnessRead: false,
  brightnessWrite: false,
  screenState: false,
  screenWake: false,
  screenOff: false,
  motionStart: false,
  motionStop: false,
  motionState: false,
  battery: false,
  plugged: false,
  tts: false,
  ttsStop: false,
  audioVolumeRead: false,
  audioVolumeWrite: false,
  soundPlayback: false,
  soundStop: false,
  camshot: false,
  screensaverControl: false,
  restart: false,
  deviceId: false,
}

interface FullyKioskSnapshot {
  availability: FullyKioskAvailability
  capabilities: FullyKioskCapabilities
  ambientLight: number | null
  ambientLightSource: FullyAmbientSource | null
  screenBrightness: number | null
  normalBrightness: number | null
  screenOn: boolean | null
  motionRunning: boolean | null
  screensaverActive: boolean
  lastMotionAt: number | null
  /** Emergenza in corso (§11): schermo acceso e luminosità al massimo. */
  emergencyActive: boolean
}

interface FullyKioskStore extends FullyKioskSnapshot {
  _patch: (patch: Partial<FullyKioskSnapshot>) => void
  _reset: (availability?: FullyKioskAvailability) => void
}

function initialSnapshot(availability: FullyKioskAvailability = 'unavailable'): FullyKioskSnapshot {
  return {
    availability,
    capabilities: { ...EMPTY_FULLY_KIOSK_CAPABILITIES },
    ambientLight: null,
    ambientLightSource: null,
    screenBrightness: null,
    normalBrightness: null,
    screenOn: null,
    motionRunning: null,
    screensaverActive: false,
    lastMotionAt: null,
    emergencyActive: false,
  }
}

export const useFullyKioskStore = create<FullyKioskStore>((set) => ({
  ...initialSnapshot(),
  _patch: (patch) => set(patch),
  _reset: (availability) => set(initialSnapshot(availability)),
}))
