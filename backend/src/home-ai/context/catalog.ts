import { CoreStore } from '../storage/db.js'

/**
 * Registro delle entità selezionate e grafo delle relazioni (specifica §9).
 *
 * Solo entità esplicitamente selezionate (opt-in) entrano nel catalogo. I
 * legami noti vengono dalla configurazione (`origin: 'config'`); quelli
 * inferiti portano confidenza e restano ipotesi. Nessuna relazione causale
 * inventata.
 */

export type EntityRole = 'presence' | 'door' | 'window' | 'light' | 'climate' | 'switch' | 'cover' | 'media' | 'sensor' | 'other'
export type Relation = 'located_in' | 'measures' | 'controls' | 'belongs_to' | 'associated_with' | 'supports_goal' | 'conflicts_with' | 'derived_from'

export interface CatalogEntry {
  entity_id: string
  domain: string
  label: string
  area_id: string | null
  role: EntityRole
  capabilities: string[]
}

const CAPABILITY_BY_DOMAIN: Record<string, string[]> = {
  light: ['lighting.set'],
  switch: ['switch.set'],
  input_boolean: ['switch.set'],
  climate: ['climate.set_mode', 'climate.set_temperature'],
  cover: ['cover.set'],
  media_player: ['media.set'],
  fan: ['fan.set'],
}

export function roleOf(entityId: string, roles: { presence: string[]; door: string[]; window: string[] }): EntityRole {
  if (roles.presence.includes(entityId)) return 'presence'
  if (roles.door.includes(entityId)) return 'door'
  if (roles.window.includes(entityId)) return 'window'
  const domain = entityId.split('.')[0]
  if (domain === 'light') return 'light'
  if (domain === 'climate') return 'climate'
  if (domain === 'switch' || domain === 'input_boolean') return 'switch'
  if (domain === 'cover') return 'cover'
  if (domain === 'media_player') return 'media'
  if (domain === 'sensor' || domain === 'binary_sensor') return 'sensor'
  return 'other'
}

export class EntityCatalog {
  constructor(private readonly store: CoreStore) {}

  /** Sostituisce il catalogo con le sole entità selezionate. */
  replace(entries: CatalogEntry[], now: string): void {
    this.store.tx(() => {
      this.store.run('DELETE FROM entity_catalog')
      this.store.run("DELETE FROM entity_relations WHERE origin = 'config'")
      for (const entry of entries) {
        this.store.run(
          'INSERT INTO entity_catalog (entity_id, domain, label, area_id, capabilities, role, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          entry.entity_id, entry.domain, entry.label.slice(0, 80), entry.area_id, JSON.stringify(entry.capabilities), entry.role, now,
        )
        if (entry.area_id) this.relate(entry.entity_id, 'located_in', `area:${entry.area_id}`, 'config', 1)
      }
    })
  }

  relate(from: string, relation: Relation, to: string, origin: 'config' | 'inferred', confidence: number): void {
    this.store.run(
      `INSERT INTO entity_relations (from_id, relation, to_id, origin, confidence) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(from_id, relation, to_id) DO UPDATE SET origin = excluded.origin, confidence = excluded.confidence`,
      from, relation, to, origin, Math.max(0, Math.min(1, confidence)),
    )
  }

  list(): CatalogEntry[] {
    return this.store.all('SELECT * FROM entity_catalog ORDER BY entity_id').map((row) => ({
      entity_id: String(row.entity_id),
      domain: String(row.domain),
      label: String(row.label),
      area_id: row.area_id === null ? null : String(row.area_id),
      role: String(row.role) as EntityRole,
      capabilities: JSON.parse(String(row.capabilities)) as string[],
    }))
  }

  get(entityId: string): CatalogEntry | null {
    return this.list().find((entry) => entry.entity_id === entityId) ?? null
  }

  byRole(role: EntityRole): CatalogEntry[] {
    return this.list().filter((entry) => entry.role === role)
  }

  relations(): { from_id: string; relation: Relation; to_id: string; origin: string; confidence: number }[] {
    return this.store.all('SELECT * FROM entity_relations ORDER BY from_id').map((row) => ({
      from_id: String(row.from_id),
      relation: String(row.relation) as Relation,
      to_id: String(row.to_id),
      origin: String(row.origin),
      confidence: Number(row.confidence),
    }))
  }

  selectedIds(): Set<string> {
    return new Set(this.store.all('SELECT entity_id FROM entity_catalog').map((row) => String(row.entity_id)))
  }
}

export function catalogEntryFor(
  entityId: string,
  label: string,
  areaId: string | null,
  roles: { presence: string[]; door: string[]; window: string[] },
): CatalogEntry {
  const domain = entityId.split('.')[0]
  return {
    entity_id: entityId,
    domain,
    label,
    area_id: areaId,
    role: roleOf(entityId, roles),
    capabilities: CAPABILITY_BY_DOMAIN[domain] ?? [],
  }
}
