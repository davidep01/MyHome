export function useHaptic() {
  const light = () => navigator.vibrate?.(10)
  const medium = () => navigator.vibrate?.(20)
  const heavy = () => navigator.vibrate?.([30, 10, 30])
  /** Crisp single click — used per-step while turning the temperature wheel. */
  const tick = () => navigator.vibrate?.(6)
  return { light, medium, heavy, tick }
}
