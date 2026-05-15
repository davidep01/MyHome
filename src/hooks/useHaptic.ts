export function useHaptic() {
  const light = () => navigator.vibrate?.(10)
  const medium = () => navigator.vibrate?.(20)
  const heavy = () => navigator.vibrate?.([30, 10, 30])
  return { light, medium, heavy }
}
