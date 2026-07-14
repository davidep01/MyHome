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
  motionStart: false,
  motionStop: false,
  motionState: false,
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
  }
}

export const useFullyKioskStore = create<FullyKioskStore>((set) => ({
  ...initialSnapshot(),
  _patch: (patch) => set(patch),
  _reset: (availability) => set(initialSnapshot(availability)),
}))
