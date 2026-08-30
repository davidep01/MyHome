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

/**
 * Durata compatta in italiano per un "attivo da" ("3 g 4 h", "18 min").
 * Restituisce stringa vuota su input non valido: l'assenza di dato non deve
 * diventare uno "0 min" che sembra un fatto.
 */
export function durationSince(iso?: string | null, nowMs = Date.now()): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then) || then > nowMs) return ''
  const minutes = Math.floor((nowMs - then) / 60_000)
  if (minutes < 1) return 'meno di un minuto'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest ? `${hours} h ${rest} min` : `${hours} h`
  }
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours ? `${days} g ${restHours} h` : `${days} g`
}

/** Confronta due versioni `x.y.z`; >0 se `a` è più recente di `b`. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => value.split('.').map((part) => Number.parseInt(part, 10))
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (!Number.isFinite(l) || !Number.isFinite(r)) return 0
    if (l !== r) return l - r
  }
  return 0
}
