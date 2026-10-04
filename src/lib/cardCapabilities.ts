/** HA supported_features is authoritative; legacy snapshots may omit it. */
export function supportsCardFeature(attrs: Record<string, unknown>, flag: number, fallback = false): boolean {
  return typeof attrs.supported_features === 'number' && Number.isFinite(attrs.supported_features)
    ? (attrs.supported_features & flag) !== 0 : fallback
}
export function cardOptions(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())))] : []
}
export function lightCanDim(attrs: Record<string, unknown>): boolean {
  const modes = cardOptions(attrs.supported_color_modes)
  return modes.length ? modes.some(mode => !['onoff', 'unknown'].includes(mode)) : typeof attrs.brightness === 'number'
}
