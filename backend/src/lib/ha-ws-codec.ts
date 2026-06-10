import type { HaEntityLike } from './ha-stream.js'

/**
 * Codec for Home Assistant's `subscribe_entities` compressed entity format.
 * Pure logic (no I/O): kept separate from the socket so it can be unit-tested.
 */

export interface CompressedEntity {
  /** state */
  s?: string
  /** attributes (full on add, only changed keys in a "+" diff) */
  a?: Record<string, unknown>
  /** context: bare id string or full object */
  c?: string | { id?: string; parent_id?: string | null; user_id?: string | null }
  /** last_changed, epoch seconds */
  lc?: number
  /** last_updated, epoch seconds — omitted when equal to lc */
  lu?: number
}

export interface CompressedStatesEvent {
  /** added entities (the first event after subscribing carries the full set) */
  a?: Record<string, CompressedEntity>
  /** changed entities: "+" merges fields, "-".a lists removed attribute keys */
  c?: Record<string, { '+'?: CompressedEntity; '-'?: { a?: string[] } }>
  /** removed entity ids */
  r?: string[]
}

function toIso(epochSeconds: number | undefined): string | undefined {
  if (epochSeconds === undefined || !Number.isFinite(epochSeconds)) return undefined
  return new Date(epochSeconds * 1000).toISOString()
}

function toContext(c: CompressedEntity['c']): unknown {
  if (c === undefined) return undefined
  return typeof c === 'string' ? { id: c } : c
}

function fromCompressed(entityId: string, comp: CompressedEntity): HaEntityLike {
  const lc = toIso(comp.lc)
  return {
    entity_id: entityId,
    state: comp.s ?? '',
    attributes: comp.a ?? {},
    last_changed: lc,
    last_updated: comp.lu !== undefined ? toIso(comp.lu) : lc,
    context: toContext(comp.c),
  }
}

/**
 * Applies one compressed subscribe_entities event to the accumulated entity
 * map, mutating it, and returns the delta in plain entity form.
 */
export function applyCompressedEvent(
  map: Map<string, HaEntityLike>,
  event: CompressedStatesEvent,
): { changed: HaEntityLike[]; removed: string[] } {
  const changed: HaEntityLike[] = []
  const removed: string[] = []

  for (const [id, comp] of Object.entries(event.a ?? {})) {
    const entity = fromCompressed(id, comp)
    map.set(id, entity)
    changed.push(entity)
  }

  for (const [id, diff] of Object.entries(event.c ?? {})) {
    const prev = map.get(id)
    if (!prev) continue // diff for an unknown entity; the next snapshot heals it
    const plus = diff['+']
    const attributes = { ...(prev.attributes ?? {}) }
    if (plus?.a) Object.assign(attributes, plus.a)
    for (const key of diff['-']?.a ?? []) delete attributes[key]
    const lastChanged = plus?.lc !== undefined ? toIso(plus.lc) : prev.last_changed
    const next: HaEntityLike = {
      entity_id: id,
      state: plus?.s !== undefined ? plus.s : prev.state,
      attributes,
      last_changed: lastChanged,
      last_updated: plus?.lu !== undefined
        ? toIso(plus.lu)
        : plus?.lc !== undefined ? lastChanged : prev.last_updated,
      context: plus?.c !== undefined ? toContext(plus.c) : prev.context,
    }
    map.set(id, next)
    changed.push(next)
  }

  for (const id of event.r ?? []) {
    if (map.delete(id)) removed.push(id)
  }

  return { changed, removed }
}
