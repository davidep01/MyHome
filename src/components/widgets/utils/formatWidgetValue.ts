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

const MAX_EXACT_DECIMALS = 4

/** Cifre decimali della sorgente; null quando sono più di 4 (rumore float) o in notazione esponenziale. */
function sourceDecimals(source: unknown, value: number): number | null {
  const text = typeof source === 'string' && source.trim() ? source.trim() : String(value)
  if (/e/i.test(text)) return null
  const dot = text.indexOf('.')
  const digits = dot === -1 ? 0 : text.length - dot - 1
  return digits > MAX_EXACT_DECIMALS ? null : digits
}

/**
 * Il valore così come lo riporta Home Assistant: 0.99 → "0,99", "21.50" →
 * "21,50", 20 → "20". Nessun arrotondamento di comodo; oltre la quarta cifra
 * si taglia soltanto il rumore di calcolo in virgola mobile (0.30000000000000004).
 */
export function formatExact(value: unknown, source: unknown = value): string {
  const n = numericState(value)
  if (n === undefined) return '—'
  const digits = sourceDecimals(source, n)
  return new Intl.NumberFormat('it-IT', digits === null
    ? { maximumFractionDigits: MAX_EXACT_DECIMALS }
    : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
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
