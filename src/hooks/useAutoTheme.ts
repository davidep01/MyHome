import { useEffect } from 'react'
import { useThemeStore } from '../store/theme'
import { applyDarkAppearance } from '../lib/themeAppearance'

/** Minimal Generic Sensor API type (not in lib.dom). */
interface AmbientLightSensorLike {
  illuminance: number
  addEventListener: (type: string, cb: (e?: { error?: { name?: string } }) => void) => void
  start: () => void
  stop: () => void
}
type Ctor = new (opts?: { frequency?: number }) => AmbientLightSensorLike

const DARK_LUX = 20   // below → dark
const LIGHT_LUX = 45  // above → light (dead zone 20–45 = hysteresis, no change)
const DEBOUNCE_MS = 3000

/**
 * Resolves the active theme and applies a `dark` class on <html>.
 *
 *  - themeMode 'light'/'dark' → manual override, sensor never overrides it.
 *  - themeMode 'auto':
 *      • desktop (no coarse/no-hover) → ambient sensor DISABLED, follow prefers-color-scheme.
 *      • tablet → AmbientLightSensor when available (dark <20 lux / light >45 lux,
 *        3s debounce + hysteresis); otherwise fall back to prefers-color-scheme.
 *
 * Safe fallbacks for unsupported / permission-denied / blocked / error; full
 * sensor cleanup on unmount; no console noise. Call once (in AppShell).
 */
export function useAutoTheme() {
  const themeMode = useThemeStore((s) => s.themeMode)
  const patch = useThemeStore((s) => s._patch)

  useEffect(() => {
    // Manual override — sensor and prefers are ignored entirely.
    if (themeMode === 'light' || themeMode === 'dark') {
      const dark = themeMode === 'dark'
      applyDarkAppearance(dark)
      patch({ effectiveDark: dark, source: 'manual', sensorState: 'disabled', lastLux: null })
      return
    }

    const prefers = window.matchMedia('(prefers-color-scheme: dark)')
    const isTablet = window.matchMedia('(pointer: coarse) and (hover: none)').matches

    // Desktop, or tablet without sensor → follow the OS color scheme.
    const followPrefers = (state: 'disabled' | 'unsupported' | 'permission_denied' | 'error') => {
      const upd = () => {
        applyDarkAppearance(prefers.matches)
        patch({ effectiveDark: prefers.matches, source: 'prefers', sensorState: state })
      }
      upd()
      prefers.addEventListener('change', upd)
      return () => prefers.removeEventListener('change', upd)
    }

    if (!isTablet) return followPrefers('disabled')

    const SensorCtor = (window as unknown as { AmbientLightSensor?: Ctor }).AmbientLightSensor
    if (!SensorCtor) return followPrefers('unsupported')

    // Tablet + sensor available.
    let sensor: AmbientLightSensorLike | null = null
    let pendingTarget: 'dark' | 'light' | null = null
    let pendingSince = 0
    let fallbackCleanup: (() => void) | null = null

    try {
      sensor = new SensorCtor({ frequency: 1 })
      sensor.addEventListener('reading', () => {
        const lux = sensor?.illuminance ?? 100
        const cur = useThemeStore.getState().effectiveDark ? 'dark' : 'light'
        patch({ lastLux: Math.round(lux), source: 'sensor', sensorState: 'active' })

        const target = lux < DARK_LUX ? 'dark' : lux > LIGHT_LUX ? 'light' : null
        if (!target || target === cur) { pendingTarget = null; return }
        if (pendingTarget !== target) { pendingTarget = target; pendingSince = Date.now(); return }
        if (Date.now() - pendingSince >= DEBOUNCE_MS) {
          pendingTarget = null
          applyDarkAppearance(target === 'dark')
          patch({ effectiveDark: target === 'dark' })
        }
      })
      sensor.addEventListener('error', (e) => {
        const denied = e?.error?.name === 'NotAllowedError' || e?.error?.name === 'SecurityError'
        sensor?.stop()
        sensor = null
        fallbackCleanup = followPrefers(denied ? 'permission_denied' : 'error')
      })
      sensor.start()
    } catch {
      fallbackCleanup = followPrefers('error')
    }

    return () => {
      sensor?.stop()
      fallbackCleanup?.()
    }
  }, [themeMode, patch])
}
