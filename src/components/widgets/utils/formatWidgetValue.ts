export function numericState(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function pct(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback
}

export function formatNumber(value: unknown, digits = 0): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  return n.toFixed(digits)
}

export function formatPower(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)} kW`
  return `${Math.round(n)} W`
}

export function compactText(value?: string | null): string {
  if (!value) return '--'
  return value.replace(/_/g, ' ')
}
