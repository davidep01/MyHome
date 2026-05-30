import { useEffect, useState } from 'react'

/** Minimal type for the Generic Sensor API (not in lib.dom). */
interface AmbientLightSensorLike {
  illuminance: number
  addEventListener: (type: string, cb: () => void) => void
  start: () => void
  stop: () => void
}
type AmbientLightSensorCtor = new (opts?: { frequency?: number }) => AmbientLightSensorLike

const LUX_NIGHT_THRESHOLD = 10 // dim room
const LUX_DAY_THRESHOLD = 25 // hysteresis to avoid flicker

function isNightByClock() {
  const h = new Date().getHours()
  return h >= 21 || h < 7
}

/**
 * Night mode for wall-mounted Android tablets. Uses the ambient light sensor when
 * available (low lux → night) with hysteresis; falls back to a clock-based schedule
 * when the sensor is unsupported or permission is denied.
 */
export function useAmbientNightMode(): boolean {
  const [night, setNight] = useState(isNightByClock)

  useEffect(() => {
    const Ctor = (window as unknown as { AmbientLightSensor?: AmbientLightSensorCtor }).AmbientLightSensor
    let sensor: AmbientLightSensorLike | null = null
    let clockTimer: ReturnType<typeof setInterval> | null = null

    // Clock-based fallback (state is already lazy-initialised, so only the interval is needed).
    const runClockMode = () => {
      clockTimer = setInterval(() => setNight(isNightByClock()), 60_000)
    }

    if (Ctor) {
      try {
        sensor = new Ctor({ frequency: 1 })
        sensor.addEventListener('reading', () => {
          const lux = sensor?.illuminance ?? 100
          setNight((prev) => (prev ? lux < LUX_DAY_THRESHOLD : lux < LUX_NIGHT_THRESHOLD))
        })
        sensor.addEventListener('error', () => {
          sensor = null
          runClockMode()
        })
        sensor.start()
      } catch {
        runClockMode()
      }
    } else {
      runClockMode()
    }

    return () => {
      sensor?.stop()
      if (clockTimer) clearInterval(clockTimer)
    }
  }, [])

  return night
}
