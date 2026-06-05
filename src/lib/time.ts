/** Compact Italian "time ago" (e.g. "ora", "12 min fa", "3 h fa", "ieri"). */
export function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const s = Math.floor((Date.now() - then) / 1000)
  if (s < 45) return 'ora'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min fa`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h fa`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ieri'
  return `${d} g fa`
}
