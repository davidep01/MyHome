import { createHash } from 'node:crypto'
import type { ObservedEvent, StateValue } from '../domain/contracts.js'
import type { Clock } from '../domain/time.js'
import { attributeHaChange, makeEvent, minimizeState, quality, type HaContext, type HaEntityLike } from '../ingestion/normalize.js'

/**
 * Adapter di lettura dal ponte HA già esistente in MyHome (specifica §2, §6).
 *
 * Il backend tiene già UNA connessione autenticata a HA e la distribuisce via
 * `subscribeHaStream`: il core vi si iscrive come lettore, senza aprire un
 * secondo canale e senza alcun accesso al percorso comandi. Le entità non
 * selezionate vengono scartate qui, prima di qualunque persistenza.
 *
 * Snapshot e riconnessioni producono eventi `delivery: 'snapshot'` per le
 * sole differenze: non sono click, non sono rientri (T12).
 */

export type BridgeEvent =
  | { type: 'snapshot'; entities: HaEntityLike[] }
  | { type: 'delta'; changed: HaEntityLike[]; removed: string[] }
  | { type: 'status'; connected: boolean; message?: string }
  | { type: 'error'; message: string }
  | { type: string }

export interface FeedDeps {
  clock: Clock
  selected: () => Set<string>
  presenceEntities: () => Set<string>
  personalProfiles: () => boolean
  currentState: (entityId: string) => StateValue | null
  operationForContext: (contextId: string | null) => { operation_id: string } | null
  emit: (event: ObservedEvent) => void
}

const SOURCE = { id: 'ha', kind: 'ha' as const }

export function pseudonymousSubject(entityId: string): string {
  return `subj-${createHash('sha256').update(`home-ai:${entityId}`).digest('hex').slice(0, 12)}`
}

function toContext(raw: unknown): HaContext | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  return {
    id: typeof c.id === 'string' ? c.id.slice(0, 64) : null,
    parent_id: typeof c.parent_id === 'string' ? c.parent_id.slice(0, 64) : null,
    user_id: typeof c.user_id === 'string' ? c.user_id.slice(0, 64) : null,
  }
}

function presenceStatus(value: StateValue | null): 'home' | 'away' | 'unknown' {
  if (!value || value.availability !== 'available') return 'unknown'
  if (value.state === 'home' || value.state === 'on') return 'home'
  return 'away'
}

function sameValue(a: StateValue | null, b: StateValue | null): boolean {
  if (!a || !b) return a === b
  return a.state === b.state && a.availability === b.availability && JSON.stringify(a.attributes) === JSON.stringify(b.attributes)
}

export class BridgeFeedAdapter {
  private gapOpen = false
  constructor(private readonly deps: FeedDeps) {}

  handle(event: BridgeEvent): void {
    const nowIso = this.deps.clock.now().toISOString()
    if (event.type === 'status' && 'connected' in event && !event.connected) return this.openGap(nowIso, 'HA_DISCONNECTED')
    if (event.type === 'error') return this.openGap(nowIso, 'HA_UNREACHABLE')
    if (event.type === 'snapshot' && 'entities' in event) {
      this.closeGap(nowIso)
      for (const entity of event.entities) this.change(entity, 'snapshot', nowIso)
      return
    }
    if (event.type === 'delta' && 'changed' in event) {
      this.closeGap(nowIso)
      for (const entity of event.changed) this.change(entity, 'live', nowIso)
      for (const id of event.removed) this.remove(id, nowIso)
    }
  }

  private change(entity: HaEntityLike, delivery: 'live' | 'snapshot', nowIso: string): void {
    if (!this.deps.selected().has(entity.entity_id)) return
    const before = this.deps.currentState(entity.entity_id)
    const after = minimizeState(entity)
    if (delivery === 'snapshot' && sameValue(before, after)) return
    const context = toContext(entity.context)
    const occurred = after?.source_updated_at ?? nowIso
    const attribution = delivery === 'snapshot'
      ? { quality: quality('system', 1, ['SNAPSHOT_RECONCILE'], 'partial'), effectOf: null }
      : attributeHaChange(entity.entity_id, context, this.deps.operationForContext(context?.id ?? null))

    this.deps.emit(makeEvent({
      kind: 'state.changed',
      source: { ...SOURCE, native_id: context?.id ? `${context.id}:${entity.entity_id}` : null },
      occurred_at: occurred > nowIso ? nowIso : occurred,
      received_at: nowIso,
      delivery,
      quality: attribution.quality,
      context: { id: context?.id ?? null, parent_id: context?.parent_id ?? null },
      payload: { entity_id: entity.entity_id, before, after, effect_of_operation_id: attribution.effectOf },
    }))

    if (this.deps.presenceEntities().has(entity.entity_id) && presenceStatus(before) !== presenceStatus(after)) {
      const subject = this.deps.personalProfiles() ? pseudonymousSubject(entity.entity_id) : null
      this.deps.emit(makeEvent({
        kind: 'presence.signal',
        source: { ...SOURCE, native_id: context?.id ? `presence:${context.id}:${entity.entity_id}` : null },
        occurred_at: occurred > nowIso ? nowIso : occurred,
        received_at: nowIso,
        delivery,
        quality: quality('system', 1, ['PRESENCE_ENTITY']),
        scope: subject ? { kind: 'person', subject_id: subject } : { kind: 'household', subject_id: null },
        payload: { presence_source_id: pseudonymousSubject(entity.entity_id), status: presenceStatus(after), subject_id: subject },
      }))
    }
  }

  private remove(entityId: string, nowIso: string): void {
    if (!this.deps.selected().has(entityId)) return
    this.deps.emit(makeEvent({
      kind: 'state.changed',
      source: { ...SOURCE, native_id: null },
      occurred_at: nowIso,
      received_at: nowIso,
      delivery: 'live',
      quality: quality('system', 1, ['ENTITY_REMOVED']),
      payload: { entity_id: entityId, before: this.deps.currentState(entityId), after: null, effect_of_operation_id: null },
    }))
  }

  private openGap(nowIso: string, reason: string): void {
    if (this.gapOpen) return
    this.gapOpen = true
    this.deps.emit(makeEvent({
      kind: 'coverage.gap',
      source: { ...SOURCE, native_id: null },
      occurred_at: nowIso,
      received_at: nowIso,
      delivery: 'live',
      quality: quality('system', 1, [reason], 'partial'),
      payload: { source_id: 'ha', from: nowIso, until: null, reason_code: reason },
    }))
  }

  private closeGap(nowIso: string): void {
    if (!this.gapOpen) return
    this.gapOpen = false
    this.deps.emit(makeEvent({
      kind: 'coverage.gap',
      source: { ...SOURCE, native_id: null },
      occurred_at: nowIso,
      received_at: nowIso,
      delivery: 'live',
      quality: quality('system', 1, ['HA_RECONNECTED'], 'partial'),
      payload: { source_id: 'ha', from: nowIso, until: nowIso, reason_code: 'HA_RECONNECTED' },
    }))
  }
}
