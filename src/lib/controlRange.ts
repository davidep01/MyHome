/** Finite, ordered bounds shared by touch wheels and climate setpoints. */
export function controlRange(min: number, max: number, step: number) {
  const low = Number.isFinite(min) ? min : 0
  const high = Number.isFinite(max) && max > low ? max : low
  return { min: low, max: high, step: Number.isFinite(step) && step > 0 ? step : 1 }
}

export function snapControlValue(value: number, min: number, max: number, step: number) {
  const range = controlRange(min, max, step)
  const finite = Number.isFinite(value) ? value : range.min
  const bounded = Math.min(range.max, Math.max(range.min, finite))
  const snapped = range.min + Math.round((bounded - range.min) / range.step) * range.step
  return Math.min(range.max, Math.max(range.min, Number(snapped.toFixed(6))))
}


/** Freeze the last endpoint across the bottom gap; crossing 180° must not jump min↔max. */
export function dialControlValue(angle: number, previous: number, min: number, max: number, step: number) {
  if (angle < -135 || angle > 135) return previous < (min + max) / 2 ? min : max
  return snapControlValue(min + (angle + 135) / 270 * (max - min), min, max, step)
}
