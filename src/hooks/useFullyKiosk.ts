import { useEffect } from 'react'
import {
  adaptiveBrightnessFor,
  createFullyKioskBridge,
  ensureFullyEventBindings,
  FULLY_KIOSK_EVENT,
  fullyKioskAvailability,
  isFullyKioskEventName,
} from '../lib/fullyKiosk'
import { markKioskActivity, onKioskScreensaver } from '../lib/kioskActivity'
import { useFullyKioskStore } from '../store/fullyKiosk'
import { useThemeStore } from '../store/theme'

const DEFAULT_AMBIENT_BRIGHTNESS = 28
const LIGHT_POLL_MS = 4_000
const BRIGHTNESS_DEADBAND = 5
const DARK_LUX = 20
const LIGHT_LUX = 45
const DARK_LUMA = 34
const LIGHT_LUMA = 78

interface UseFullyKioskOptions {
  ambientBrightness?: number
}

function clampBrightness(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AMBIENT_BRIGHTNESS
  return Math.round(Math.min(255, Math.max(0, value)))
}

/**
 * Progressive integration for Fully Kiosk Browser. In Chrome/Safari it is a
 * no-op; on a trusted LAN origin it uses only the capabilities exposed by the
 * installed Fully version. No Remote Admin REST endpoint or password is used.
 */
export function useFullyKiosk(options: UseFullyKioskOptions = {}): void {
  const ambientBrightness = clampBrightness(options.ambientBrightness ?? DEFAULT_AMBIENT_BRIGHTNESS)

  useEffect(() => {
    const store = useFullyKioskStore.getState()
    const availability = fullyKioskAvailability(window.fully, window.location)
    const bridge = createFullyKioskBridge(window.fully, window.location)
    if (!bridge) {
      store._reset(availability)
      return () => useFullyKioskStore.getState()._reset(availability)
    }

    const originalBrightness = bridge.getBrightness()
    let normalBrightness = originalBrightness
    let lastAppliedBrightness = originalBrightness
    let appScreensaver = false
    let fullyScreensaver = false
    let appScreensaverBrightness = ambientBrightness
    let startedMotionHere = false

    store._patch({
      availability: 'available',
      capabilities: bridge.capabilities,
      screenBrightness: originalBrightness,
      normalBrightness,
      screenOn: bridge.getScreenOn(),
      motionRunning: bridge.isMotionRunning(),
    })

    const anyScreensaver = () => appScreensaver || fullyScreensaver
    const activeScreensaverBrightness = () => appScreensaver
      ? appScreensaverBrightness
      : ambientBrightness

    const applyBrightness = (level: number) => {
      const next = clampBrightness(level)
      if (lastAppliedBrightness === next) return true
      const applied = bridge.setBrightness(next)
      if (applied) {
        lastAppliedBrightness = next
        useFullyKioskStore.getState()._patch({ screenBrightness: next })
      }
      return applied
    }

    const restoreNormalBrightness = () => {
      if (normalBrightness !== null) applyBrightness(normalBrightness)
    }

    const syncScreensaverBrightness = (wasActive: boolean) => {
      const active = anyScreensaver()
      useFullyKioskStore.getState()._patch({ screensaverActive: active })
      if (active) {
        if (!wasActive) {
          const current = bridge.getBrightness()
          if (current !== null) normalBrightness = current
          useFullyKioskStore.getState()._patch({ normalBrightness })
        }
        // Do not dim when the current level cannot be read: without a known
        // baseline an old/partial Fully interface could not restore it safely.
        if (normalBrightness !== null) applyBrightness(activeScreensaverBrightness())
      } else if (wasActive) {
        restoreNormalBrightness()
      }
    }

    const removeScreensaverListener = onKioskScreensaver((detail) => {
      const wasActive = anyScreensaver()
      appScreensaver = detail.active
      appScreensaverBrightness = detail.brightness
      syncScreensaverBrightness(wasActive)
    })

    const handleFullyEvent = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail = event.detail as { name?: unknown } | null
      if (!isFullyKioskEventName(detail?.name)) return

      if (detail.name === 'onMotion') {
        const woke = bridge.turnScreenOn()
        useFullyKioskStore.getState()._patch({
          lastMotionAt: Date.now(),
          screenOn: woke ? true : bridge.getScreenOn(),
        })
        markKioskActivity()
        return
      }
      if (detail.name === 'screenOn') {
        useFullyKioskStore.getState()._patch({ screenOn: true })
        markKioskActivity()
        return
      }
      if (detail.name === 'screenOff') {
        useFullyKioskStore.getState()._patch({ screenOn: false })
        return
      }

      const wasActive = anyScreensaver()
      fullyScreensaver = detail.name === 'onScreensaverStart'
      syncScreensaverBrightness(wasActive)
      if (detail.name === 'onScreensaverStop') markKioskActivity()
    }

    window.addEventListener(FULLY_KIOSK_EVENT, handleFullyEvent)
    ensureFullyEventBindings(bridge)

    const motionBefore = bridge.isMotionRunning()
    if (motionBefore !== true && bridge.capabilities.motionStart) {
      startedMotionHere = bridge.startMotion()
    }
    const motionRunning = bridge.isMotionRunning()
      ?? (motionBefore === true || startedMotionHere ? true : null)
    useFullyKioskStore.getState()._patch({ motionRunning })

    const pollAmbientLight = () => {
      if (document.visibilityState === 'hidden') return
      const reading = bridge.readAmbientLight()
      if (!reading) return

      useFullyKioskStore.getState()._patch({
        ambientLight: reading.value,
        ambientLightSource: reading.source,
      })
      const theme = useThemeStore.getState()
      if (theme.themeMode === 'auto') {
        const darkThreshold = reading.source === 'average-luma' ? DARK_LUMA : DARK_LUX
        const lightThreshold = reading.source === 'average-luma' ? LIGHT_LUMA : LIGHT_LUX
        const target = reading.value < darkThreshold
          ? true
          : reading.value > lightThreshold
            ? false
            : theme.effectiveDark
        document.documentElement.classList.toggle('dark', target)
        theme._patch({
          lastLux: Math.round(reading.value),
          source: 'sensor',
          sensorState: 'active',
          effectiveDark: target,
        })
      } else {
        theme._patch({ lastLux: Math.round(reading.value) })
      }

      const target = adaptiveBrightnessFor(reading)
      normalBrightness = normalBrightness === null
        ? target
        : Math.round(normalBrightness * 0.65 + target * 0.35)
      useFullyKioskStore.getState()._patch({ normalBrightness })

      if (!anyScreensaver()
        && (lastAppliedBrightness === null || Math.abs(normalBrightness - lastAppliedBrightness) >= BRIGHTNESS_DEADBAND)) {
        applyBrightness(normalBrightness)
      }
    }

    pollAmbientLight()
    const pollTimer = window.setInterval(pollAmbientLight, LIGHT_POLL_MS)
    document.addEventListener('visibilitychange', pollAmbientLight)

    return () => {
      window.clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', pollAmbientLight)
      window.removeEventListener(FULLY_KIOSK_EVENT, handleFullyEvent)
      removeScreensaverListener()
      if (startedMotionHere && bridge.capabilities.motionStop) bridge.stopMotion()
      if (originalBrightness !== null) bridge.setBrightness(originalBrightness)
      useFullyKioskStore.getState()._reset()
    }
  }, [ambientBrightness])
}
