import type { AttentionItem } from './attention'

export interface AttentionSnooze {
  /** Posticipa fino a un istante preciso (1h / stasera / domani). */
  until?: number
  /** Ignora finché la condizione (fingerprint) non cambia. */
  fingerprint?: string
}

export type AttentionSnoozeMap = Record<string, AttentionSnooze>

type SnoozableItem = Pick<AttentionItem, 'id' | 'fingerprint'>

export function isSnoozed(item: SnoozableItem, snoozes: AttentionSnoozeMap, nowMs: number): boolean {
  const entry = snoozes[item.id]
  if (!entry) return false
  if (entry.until !== undefined) return entry.until > nowMs
  if (entry.fingerprint !== undefined) return entry.fingerprint === item.fingerprint
  return false
}

/**
 * Rimuove le pause scadute e quelle il cui fingerprint non corrisponde più
 * (la condizione sottostante è cambiata: il posticipo "finché non cambia" si
 * auto-consuma invece di restare silenziosamente attaccato a un nuovo evento).
 */
export function pruneExpired(snoozes: AttentionSnoozeMap, items: SnoozableItem[], nowMs: number): AttentionSnoozeMap {
  const byId = new Map(items.map((item) => [item.id, item]))
  const next: AttentionSnoozeMap = {}
  for (const [id, entry] of Object.entries(snoozes)) {
    if (entry.until !== undefined && entry.until <= nowMs) continue
    if (entry.fingerprint !== undefined) {
      const item = byId.get(id)
      if (item && item.fingerprint !== entry.fingerprint) continue
    }
    next[id] = entry
  }
  return next
}
