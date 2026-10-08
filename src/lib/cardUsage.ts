/**
 * Uso delle card: la home impara cosa tocchi davvero.
 *
 * Ogni tocco (comando o apertura del dettaglio) vale 1 punto che decade con
 * un'emivita di 7 giorni: le abitudini recenti contano più di quelle vecchie,
 * e una card dimenticata scivola indietro da sola senza bisogno di "reset".
 * Il punteggio è uno solo per entità — `{ score, at }` — quindi il costo è
 * costante a prescindere da quante volte la tocchi.
 *
 * Conservato per tablet (`localStorage`): ogni tablet impara le abitudini di
 * chi gli sta davanti. Se lo storage non c'è, la home funziona uguale e
 * semplicemente non impara.
 */

export interface UsageEntry {
  score: number
  /** Epoch ms dell'ultimo tocco. */
  at: number
}

export type UsageMap = Record<string, UsageEntry>

const STORAGE_KEY = 'myhome.cardUsage'
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 300

/** Punteggio di un'entità all'istante `nowMs`, già decaduto. */
export function usageScore(entry: UsageEntry | undefined, nowMs: number): number {
  if (!entry || !(entry.score > 0)) return 0
  const age = Math.max(0, nowMs - entry.at)
  return entry.score * Math.pow(0.5, age / HALF_LIFE_MS)
}

/** Un tocco in più: decade il vecchio punteggio e aggiunge 1. Puro. */
export function recordUsage(map: UsageMap, entityId: string, nowMs: number): UsageMap {
  const next: UsageMap = { ...map, [entityId]: { score: usageScore(map[entityId], nowMs) + 1, at: nowMs } }
  const ids = Object.keys(next)
  if (ids.length <= MAX_ENTRIES) return next
  // Oltre il tetto si dimenticano le entità meno usate.
  ids.sort((a, b) => usageScore(next[a], nowMs) - usageScore(next[b], nowMs))
  for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) delete next[id]
  return next
}

function isUsageMap(value: unknown): value is UsageMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((entry) => entry && typeof entry === 'object'
    && Number.isFinite((entry as UsageEntry).score) && Number.isFinite((entry as UsageEntry).at))
}

let memory: UsageMap | null = null
let lastInteractionAt = 0

export function readUsage(): UsageMap {
  if (memory) return memory
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    memory = isUsageMap(parsed) ? parsed : {}
  } catch {
    memory = {}
  }
  return memory
}

/** Registra un tocco su una card. Chiamato dalle card stesse, mai in anteprima. */
export function noteCardUsage(entityId: string, nowMs = Date.now()): void {
  lastInteractionAt = nowMs
  memory = recordUsage(readUsage(), entityId, nowMs)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // Storage pieno o bloccato: si impara solo per questa sessione.
  }
}

/** Ultimo tocco su una card qualsiasi: la home non si riordina mentre la usi. */
export function lastCardInteractionAt(): number {
  return lastInteractionAt
}
