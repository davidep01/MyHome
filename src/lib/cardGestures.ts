/** Navigation and protected actions never share the same gesture threshold. */
export function swipePage(deltaX: number, deltaY: number, width: number): -1 | 0 | 1 {
  if (!Number.isFinite(width) || width <= 0 || Math.abs(deltaY) >= Math.abs(deltaX)) return 0
  const threshold = Math.min(80, Math.max(36, width * .18))
  return Math.abs(deltaX) < threshold ? 0 : deltaX < 0 ? 1 : -1
}
export function unlockProgress(delta: number, travel: number): number {
  return travel > 0 && Number.isFinite(delta) ? Math.max(0, Math.min(1, delta / travel)) : 0
}
