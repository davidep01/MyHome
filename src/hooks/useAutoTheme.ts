import { useEffect } from 'react'
import { useThemeStore } from '../store/theme'
import { useFullyKioskStore } from '../store/fullyKiosk'
import { applyDarkAppearance } from '../lib/themeAppearance'

interface AmbientLightSensorLike {
  illuminance: number
  addEventListener: (type: string, cb: (e?: { error?: { name?: string } }) => void) => void
  start: () => void
  stop: () => void
}
type Ctor = new (opts?: { frequency?: number }) => AmbientLightSensorLike

/** Single appearance owner: manual > Fully reading > browser lux > OS. */
export function useAutoTheme() {
  const themeMode = useThemeStore((s) => s.themeMode)
  const patch = useThemeStore((s) => s._patch)
  useEffect(() => {
    if (themeMode !== 'auto') {
      applyDarkAppearance(themeMode === 'dark')
      patch({ effectiveDark: themeMode === 'dark', source: 'manual', sensorState: 'disabled', lastLux: null, lastLuma: null, lightSource: null })
      return
    }
    const prefers = window.matchMedia('(prefers-color-scheme: dark)')
    const tablet = window.matchMedia('(pointer: coarse) and (hover: none)').matches
    let browserLux: number | null = null
    let sensorState: 'disabled' | 'unsupported' | 'active' | 'permission_denied' | 'error' = tablet ? 'unsupported' : 'disabled'
    let pendingTarget: boolean | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const clearPending = () => { if (timer) clearTimeout(timer); timer = null; pendingTarget = null }
    const resolve = () => {
      const fully = useFullyKioskStore.getState()
      const fullyValue = fully.availability === 'available' && fully.ambientLight !== null
        && Number.isFinite(fully.ambientLight) && fully.ambientLight >= 0 ? fully.ambientLight : null
      const value = fullyValue ?? browserLux
      const luma = fullyValue !== null && fully.ambientLightSource === 'average-luma'
      const current = useThemeStore.getState().effectiveDark
      if (value === null) {
        clearPending()
        applyDarkAppearance(prefers.matches)
        patch({ effectiveDark: prefers.matches, source: 'prefers', sensorState, lastLux: null, lastLuma: null, lightSource: null })
        return
      }
      patch({ source: 'sensor', sensorState: 'active', lastLux: luma ? null : Math.round(value),
        lastLuma: luma ? Math.round(value) : null,
        lightSource: fullyValue !== null ? luma ? 'average-luma' : 'hardware-lux' : 'browser-lux' })
      const target = value < (luma ? 34 : 20) ? true : value > (luma ? 78 : 45) ? false : current
      if (target === current) { clearPending(); return }
      if (pendingTarget === target) return
      clearPending()
      pendingTarget = target
      timer = setTimeout(() => {
        timer = null; pendingTarget = null
        applyDarkAppearance(target)
        patch({ effectiveDark: target })
      }, 3000)
    }
    resolve() // OS is applied immediately while a sensor starts or waits for permission.
    prefers.addEventListener('change', resolve)
    const unsubscribe = useFullyKioskStore.subscribe((state, previous) => {
      if (state.ambientLight !== previous.ambientLight || state.ambientLightSource !== previous.ambientLightSource
        || state.availability !== previous.availability) resolve()
    })
    let sensor: AmbientLightSensorLike | null = null
    const Sensor = (window as unknown as { AmbientLightSensor?: Ctor }).AmbientLightSensor
    if (tablet && Sensor) {
      try {
        sensor = new Sensor({ frequency: 1 })
        sensor.addEventListener('reading', () => {
          const value = sensor?.illuminance
          browserLux = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
          sensorState = browserLux === null ? 'error' : 'active'
          resolve()
        })
        sensor.addEventListener('error', (event) => {
          try { sensor?.stop() } catch { /* faulty native sensor */ }
          sensor = null; browserLux = null
          sensorState = ['NotAllowedError', 'SecurityError'].includes(event?.error?.name ?? '') ? 'permission_denied' : 'error'
          resolve()
        })
        sensor.start()
      } catch {
        try { sensor?.stop() } catch { /* partial initialization */ }
        sensor = null; sensorState = 'error'; resolve()
      }
    }
    return () => {
      clearPending(); unsubscribe()
      prefers.removeEventListener('change', resolve)
      try { sensor?.stop() } catch { /* best effort native cleanup */ }
    }
  }, [themeMode, patch])
}
