export function numericState(value: unknown): number | undefined {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function pct(value: unknown, fallback = 0): number {
  const n = numericState(value)
  return n === undefined ? fallback : Math.max(0, Math.min(100, n))
}

export function formatNumber(value: unknown, digits = 0): string {
  const n = numericState(value)
  return n === undefined ? '—' : new Intl.NumberFormat('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
}

export function formatPower(value: unknown): string {
  const n = numericState(value)
  if (n === undefined) return '—'
  return Math.abs(n) >= 1000 ? `${formatNumber(n / 1000, 1)} kW` : `${formatNumber(n)} W`
}

export function compactText(value?: string | null): string {
  if (!value) return '--'
  return value.replace(/_/g, ' ')
}
