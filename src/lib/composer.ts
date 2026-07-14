/**
 * Composer di rilevanza — il cuore della home a strati (DOMINICA M1).
 *
 * Funzione PURA e deterministica: dato lo stato delle entità, decide cosa
 * merita la zona "Adesso" e quali anomalie mostrare nell'header. Niente ML:
 * regole di classe spiegabili, tie-break stabile per entity_id (due schermi
 * compongono la stessa identica home).
 *
 * L'isteresi (dwell minimo, max swap rate) è separata in `applyHysteresis`,
 * anch'essa pura: il chiamante conserva lo stato tra i tick.
 */

export interface ComposerEntity {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
  last_changed?: string
}

export type HeroPriority = 0 | 1 | 2 | 3 | 4

export interface HeroSlot {
  /** Identità stabile per l'isteresi (entity_id o chiave sintetica di gruppo). */
  key: string
  priority: HeroPriority
  /** Card singola… */
  entityId?: string
  /** …oppure gruppo sintetico (luci accese di una stanza). */
  group?: { label: string; entityIds: string[] }
  /** Spiegabilità: perché questa card è qui. */
  reason: string
}

export interface AlertChip {
  id: string
  severity: 'danger' | 'warn' | 'info'
  label: string
  entityIds: string[]
}

export interface ComposedHome {
  hero: HeroSlot[]
  alerts: AlertChip[]
  /** true = non succede niente: la home mostra Momenti + meteo. */
  quiet: boolean
}

export interface ComposeOptions {
  /** entity_id → nome area (dal registry HA); undefined = senza area. */
  areaNameOf?: (entityId: string) => string | undefined
  /** Override utente dal workbench: 'always' = sempre nell'Adesso, 'never' = mai. */
  heroOf?: (entityId: string) => 'always' | 'never' | undefined
  now: Date
  maxHero?: number
}

const OPENING_CLASSES = new Set(['door', 'window', 'garage_door', 'opening', 'gate'])
const DANGER_CLASSES = new Set(['smoke', 'gas', 'carbon_monoxide', 'moisture', 'safety'])
const OCCUPANCY_CLASSES = new Set(['motion', 'occupancy', 'presence'])
const ACTIVE_HVAC = new Set(['heating', 'cooling', 'drying'])
const BUSY_STATES = new Set(['cleaning', 'returning', 'mowing', 'opening', 'closing'])
const UNOCCUPIED_ROOM_MS = 2 * 60 * 1000

function domainOf(id: string): string {
  return id.split('.')[0]
}

function deviceClass(e: ComposerEntity): string {
  return String(e.attributes?.device_class ?? '')
}

function changedMs(e: ComposerEntity): number {
  const t = e.last_changed ? Date.parse(e.last_changed) : NaN
  return Number.isFinite(t) ? t : 0
}

function isNight(now: Date): boolean {
  const h = now.getHours()
  return h >= 22 || h < 6
}

/** Ordinamento deterministico: priorità, poi recency, poi entity_id. */
function bySlotOrder(a: { priority: number; changed: number; key: string }, b: typeof a): number {
  if (a.priority !== b.priority) return a.priority - b.priority
  if (a.changed !== b.changed) return b.changed - a.changed
  return a.key.localeCompare(b.key)
}

export function composeHome(entities: ComposerEntity[], opts: ComposeOptions): ComposedHome {
  const { areaNameOf, heroOf, now } = opts
  const maxHero = opts.maxHero ?? 6
  const night = isNight(now)
  const heroPref = (id: string) => heroOf?.(id)

  const candidates: (HeroSlot & { changed: number })[] = []
  const alerts: AlertChip[] = []

  const openOpenings: ComposerEntity[] = []
  const unlockedLocks: ComposerEntity[] = []
  const litByArea = new Map<string, ComposerEntity[]>()
  let unavailable = 0

  // Se un'area dispone davvero di sensori presenza e tutti risultano inattivi
  // da almeno due minuti, i controlli luce non occupano lo strato "Adesso".
  // Le luci restano comunque raggiungibili in Stanze e un override "always"
  // continua a vincere: niente sparizioni basate su una semplice assenza dati.
  const occupancyByArea = new Map<string, ComposerEntity[]>()
  for (const entity of entities) {
    if (domainOf(entity.entity_id) !== 'binary_sensor' || !OCCUPANCY_CLASSES.has(deviceClass(entity))) continue
    const area = areaNameOf?.(entity.entity_id)
    if (!area) continue
    const sensors = occupancyByArea.get(area) ?? []
    sensors.push(entity)
    occupancyByArea.set(area, sensors)
  }
  const quietAreas = new Set<string>()
  for (const [area, sensors] of occupancyByArea) {
    if (sensors.every((sensor) => {
      const changed = changedMs(sensor)
      return sensor.state === 'off' && changed > 0 && now.getTime() - changed >= UNOCCUPIED_ROOM_MS
    })) quietAreas.add(area)
  }

  const banned = new Set<string>()
  for (const e of entities) if (heroPref(e.entity_id) === 'never') banned.add(e.entity_id)

  for (const e of entities) {
    const domain = domainOf(e.entity_id)
    if (e.state === 'unavailable') { unavailable += 1; continue }
    if (e.state === 'unknown') continue

    switch (domain) {
      case 'alarm_control_panel': {
        if (e.state === 'triggered') {
          candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 0, reason: 'Allarme in corso', changed: changedMs(e) })
        }
        break
      }
      case 'lock': {
        if (e.state === 'unlocked') {
          unlockedLocks.push(e)
          if (night) {
            candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 0, reason: 'Serratura aperta di notte', changed: changedMs(e) })
          }
        }
        break
      }
      case 'binary_sensor': {
        const cls = deviceClass(e)
        if (e.state === 'on' && DANGER_CLASSES.has(cls)) {
          candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 0, reason: 'Sensore di sicurezza attivo', changed: changedMs(e) })
        } else if (e.state === 'on' && OPENING_CLASSES.has(cls)) {
          openOpenings.push(e)
        }
        break
      }
      case 'media_player': {
        if (e.state === 'playing') {
          candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 1, reason: 'In riproduzione', changed: changedMs(e) })
        }
        break
      }
      case 'climate': {
        const action = String(e.attributes?.hvac_action ?? '')
        if (ACTIVE_HVAC.has(action)) {
          candidates.push({
            key: e.entity_id,
            entityId: e.entity_id,
            priority: 2,
            reason: action === 'cooling' ? 'Raffrescamento attivo' : action === 'drying' ? 'Deumidifica attiva' : 'Riscaldamento attivo',
            changed: changedMs(e),
          })
        }
        break
      }
      case 'vacuum':
      case 'lawn_mower': {
        if (BUSY_STATES.has(e.state)) {
          candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 3, reason: 'In funzione', changed: changedMs(e) })
        }
        break
      }
      case 'cover':
      case 'valve': {
        if (e.state === 'opening' || e.state === 'closing') {
          candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 3, reason: 'In movimento', changed: changedMs(e) })
        }
        break
      }
      case 'light': {
        if (e.state === 'on' && !banned.has(e.entity_id)) {
          const area = areaNameOf?.(e.entity_id) ?? 'Casa'
          if (quietAreas.has(area) && heroPref(e.entity_id) !== 'always') break
          const list = litByArea.get(area) ?? []
          list.push(e)
          litByArea.set(area, list)
        }
        break
      }
    }
  }

  // Luci accese: una card-gruppo per area (priorità 4). Una sola luce → card singola.
  for (const [area, lights] of litByArea) {
    const changed = Math.max(...lights.map(changedMs))
    if (lights.length === 1) {
      candidates.push({ key: lights[0].entity_id, entityId: lights[0].entity_id, priority: 4, reason: 'Luce accesa', changed })
    } else {
      candidates.push({
        key: `lights:${area}`,
        group: { label: `Luci ${area}`, entityIds: lights.map((l) => l.entity_id).sort() },
        priority: 4,
        reason: `${lights.length} luci accese`,
        changed,
      })
    }
  }

  // ── Chip anomalie (header) ─────────────────────────────────────────────────
  const triggered = candidates.filter((c) => c.priority === 0 && c.reason === 'Allarme in corso')
  if (triggered.length) {
    alerts.push({ id: 'alarm', severity: 'danger', label: 'ALLARME', entityIds: triggered.map((c) => c.entityId!) })
  }
  const danger = candidates.filter((c) => c.reason === 'Sensore di sicurezza attivo')
  if (danger.length) {
    alerts.push({ id: 'safety', severity: 'danger', label: danger.length === 1 ? 'Sensore di sicurezza attivo' : `${danger.length} sensori di sicurezza attivi`, entityIds: danger.map((c) => c.entityId!) })
  }
  if (openOpenings.length) {
    alerts.push({
      id: 'openings',
      severity: 'warn',
      label: openOpenings.length === 1 ? '1 apertura aperta' : `${openOpenings.length} aperture aperte`,
      entityIds: openOpenings.map((e) => e.entity_id).sort(),
    })
  }
  if (unlockedLocks.length) {
    alerts.push({
      id: 'locks',
      severity: night ? 'danger' : 'warn',
      label: unlockedLocks.length === 1 ? 'Serratura sbloccata' : `${unlockedLocks.length} serrature sbloccate`,
      entityIds: unlockedLocks.map((e) => e.entity_id).sort(),
    })
  }
  if (unavailable >= 5) {
    alerts.push({ id: 'unavailable', severity: 'info', label: `${unavailable} entità non disponibili`, entityIds: [] })
  }

  // Pinned: gli 'always' non ancora candidati entrano come "In evidenza".
  const candidateKeys = new Set(candidates.map((c) => c.key))
  for (const e of entities) {
    if (heroPref(e.entity_id) !== 'always' || candidateKeys.has(e.entity_id)) continue
    if (e.state === 'unavailable' || e.state === 'unknown') continue
    candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 4, reason: 'In evidenza', changed: changedMs(e) })
  }

  const sorted = candidates
    .filter((c) => !(c.entityId && banned.has(c.entityId)))
    .sort(bySlotOrder)
  const isPinned = (c: { entityId?: string }) => Boolean(c.entityId && heroPref(c.entityId) === 'always')
  // P0 sempre davanti; poi i pinned (presenza garantita); poi il resto.
  const ordered = [
    ...sorted.filter((c) => c.priority === 0),
    ...sorted.filter((c) => c.priority !== 0 && isPinned(c)),
    ...sorted.filter((c) => c.priority !== 0 && !isPinned(c)),
  ]
  const hero = ordered
    .slice(0, maxHero)
    .map((c): HeroSlot => ({ key: c.key, priority: c.priority, entityId: c.entityId, group: c.group, reason: c.reason }))

  return { hero, alerts, quiet: hero.length === 0 }
}

// ── Isteresi ──────────────────────────────────────────────────────────────────

export interface HysteresisState {
  /** key → epoch ms d'ingresso nello strato Adesso. */
  enteredAt: Record<string, number>
  lastSwapAt: number
}

export const EMPTY_HYSTERESIS: HysteresisState = { enteredAt: {}, lastSwapAt: 0 }

const MIN_DWELL_MS = 45_000
const MIN_SWAP_INTERVAL_MS = 30_000

/**
 * Stabilizza la composizione tra un tick e l'altro:
 * - una card entrata resta visibile almeno 45s (vedi la luce che hai appena
 *   spento spegnersi, invece di vederla sparire);
 * - al massimo uno scambio ogni 30s (niente lavagna che sfarfalla);
 * - la priorità 0 (sicurezza) bypassa tutto.
 */
export function applyHysteresis(
  prev: HeroSlot[],
  next: HeroSlot[],
  state: HysteresisState,
  nowMs: number,
  maxHero = 6,
): { hero: HeroSlot[]; state: HysteresisState } {
  const nextByKey = new Map(next.map((s) => [s.key, s]))
  const prevKeys = new Set(prev.map((s) => s.key))

  // 1. Le card correnti ancora valide restano (posizione stabile); quelle
  //    scadute restano finché non maturano il dwell minimo.
  const kept: HeroSlot[] = []
  for (const slot of prev) {
    const fresh = nextByKey.get(slot.key)
    if (fresh) {
      kept.push(fresh) // aggiorna reason/membri, mantiene posto
    } else {
      const entered = state.enteredAt[slot.key] ?? 0
      if (nowMs - entered < MIN_DWELL_MS && slot.priority !== 0) kept.push(slot)
    }
  }

  // 2. Ingressi: P0 sempre e subito; gli altri rispettano lo swap budget.
  const incoming = next
    .filter((s) => !prevKeys.has(s.key) && !kept.some((k) => k.key === s.key))
  const p0 = incoming.filter((s) => s.priority === 0)
  const rest = incoming.filter((s) => s.priority !== 0)

  let hero = [...p0, ...kept]
  let swapped = p0.length > 0

  const budgetOk = nowMs - state.lastSwapAt >= MIN_SWAP_INTERVAL_MS
  if (rest.length && (budgetOk || hero.length < Math.min(3, maxHero))) {
    // spazio libero (home semivuota) o budget maturato → un ingresso
    hero = [...hero, rest[0]]
    swapped = true
  }

  hero = hero.slice(0, maxHero)

  const enteredAt: Record<string, number> = {}
  for (const slot of hero) {
    enteredAt[slot.key] = state.enteredAt[slot.key] ?? nowMs
  }

  return {
    hero,
    state: { enteredAt, lastSwapAt: swapped ? nowMs : state.lastSwapAt },
  }
}
