import { dateKeyForLocalDate, isWasteCollectionSensor, wastePickups } from './wasteCollection'

/**
 * Composer di rilevanza — il cuore della home a strati (DOMINICA M1).
 *
 * Funzione PURA e deterministica: dato lo stato delle entità, decide cosa
 * merita la zona "Adesso" e quali anomalie mostrare nell'header. Il punteggio
 * contestuale resta spiegabile (sicurezza, urgenza, presenza, recency,
 * azionabilità e preferenze) e il tie-break stabile garantisce che due kiosk
 * con gli stessi dati compongano la stessa identica home.
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
export type HeroVisualSize = 'S' | 'M' | 'L' | 'XL'

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
  /** Punteggio contestuale usato nell'ordinamento, utile anche al debug UI. */
  score?: number
  /** Ingombro consigliato per il canvas 11\"; il renderer può adattarlo. */
  visualSize?: HeroVisualSize
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
const ACTIVE_AUXILIARY_STATES = new Set(['on', 'active', 'running'])
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

interface RankedCandidate extends HeroSlot {
  changed: number
  score: number
  visualSize: HeroVisualSize
}

const SCORE_BASE: Record<HeroPriority, number> = {
  0: 10_000,
  1: 760,
  2: 620,
  3: 460,
  4: 300,
}

const ACTIONABLE_DOMAINS = new Set([
  'alarm_control_panel', 'siren', 'lock', 'cover', 'valve', 'light', 'switch',
  'input_boolean', 'climate', 'media_player', 'vacuum', 'lawn_mower', 'fan',
  'humidifier', 'water_heater',
])

const AREA_DEDUPE_DOMAINS = new Set(['media_player', 'climate', 'vacuum', 'lawn_mower', 'fan', 'humidifier'])

function visualSizeFor(slot: HeroSlot): HeroVisualSize {
  if (slot.priority === 0) return 'L'
  if (slot.group) return 'M'
  const domain = slot.entityId ? domainOf(slot.entityId) : ''
  if (domain === 'camera' || domain === 'media_player' || domain === 'climate' || domain === 'alarm_control_panel') return 'L'
  if (domain === 'light' || domain === 'switch' || domain === 'input_boolean' || domain === 'scene' || domain === 'button') return 'S'
  return 'M'
}

function recencyScore(changed: number, nowMs: number): number {
  if (changed <= 0) return 0
  const ageMinutes = Math.max(0, (nowMs - changed) / 60_000)
  if (ageMinutes <= 5) return 110
  if (ageMinutes <= 30) return 80
  if (ageMinutes <= 120) return 45
  if (ageMinutes <= 360) return 20
  return 0
}

function contextualScore(
  slot: HeroSlot & { changed: number },
  opts: { now: Date; areaNameOf?: (entityId: string) => string | undefined; occupiedAreas: Set<string>; pinned: boolean },
): number {
  if (slot.priority === 0) return SCORE_BASE[0] + recencyScore(slot.changed, opts.now.getTime())
  const domain = slot.entityId ? domainOf(slot.entityId) : slot.group ? 'light' : ''
  const area = slot.entityId ? opts.areaNameOf?.(slot.entityId) : undefined
  const hour = opts.now.getHours()
  const ageMinutes = slot.changed > 0 ? Math.max(0, (opts.now.getTime() - slot.changed) / 60_000) : 0
  let score = SCORE_BASE[slot.priority] + recencyScore(slot.changed, opts.now.getTime())

  if (ACTIONABLE_DOMAINS.has(domain)) score += 45
  if (area && opts.occupiedAreas.has(area)) score += 70
  if (domain === 'climate') score += 45
  if (domain === 'media_player' && (hour >= 17 || hour < 1)) score += 55
  if (slot.reason.includes('Apertura aperta')) score += Math.min(100, Math.round(ageMinutes / 5))
  if (slot.reason.includes('oggi')) score += 120
  else if (slot.reason.includes('domani')) score += 70
  else if (slot.reason.includes('2 giorni')) score += 30
  if (opts.pinned) score += 5_000

  return score
}

/** Ordinamento deterministico: sicurezza, score contestuale, recency, entity_id. */
function bySlotOrder(a: RankedCandidate, b: RankedCandidate): number {
  if (a.priority !== b.priority) return a.priority - b.priority
  if (a.score !== b.score) return b.score - a.score
  if (a.changed !== b.changed) return b.changed - a.changed
  return a.key.localeCompare(b.key)
}

export function composeHome(entities: ComposerEntity[], opts: ComposeOptions): ComposedHome {
  const { areaNameOf, heroOf, now } = opts
  const maxHero = opts.maxHero ?? 6
  const night = isNight(now)
  const heroPref = (id: string) => heroOf?.(id)
  const todayKey = dateKeyForLocalDate(now)

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
  const occupiedAreas = new Set<string>()
  for (const [area, sensors] of occupancyByArea) {
    if (sensors.some((sensor) => sensor.state === 'on')) occupiedAreas.add(area)
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
      case 'siren': {
        if (e.state === 'on') {
          candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 0, reason: 'Sirena attiva', changed: changedMs(e) })
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
          candidates.push({
            key: e.entity_id,
            entityId: e.entity_id,
            priority: night ? 0 : 3,
            reason: night ? 'Apertura aperta di notte' : 'Apertura aperta',
            changed: changedMs(e),
          })
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
      case 'fan':
      case 'humidifier':
      case 'water_heater': {
        if (ACTIVE_AUXILIARY_STATES.has(e.state)) {
          candidates.push({
            key: e.entity_id,
            entityId: e.entity_id,
            priority: 3,
            reason: domain === 'fan' ? 'Ventilazione attiva'
              : domain === 'humidifier' ? 'Trattamento aria attivo'
                : 'Acqua calda attiva',
            changed: changedMs(e),
          })
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
      case 'switch':
      case 'input_boolean': {
        if (e.state === 'on') {
          candidates.push({ key: e.entity_id, entityId: e.entity_id, priority: 4, reason: 'Dispositivo attivo', changed: changedMs(e) })
        }
        break
      }
      case 'sensor': {
        if (isWasteCollectionSensor(e)) {
          const next = wastePickups(e.attributes, todayKey, 1)[0]
          if (next && next.daysUntil <= 2) {
            candidates.push({
              key: e.entity_id,
              entityId: e.entity_id,
              priority: 3,
              reason: next.daysUntil === 0
                ? 'Ritiro rifiuti oggi'
                : next.daysUntil === 1
                  ? 'Ritiro rifiuti domani'
                  : 'Ritiro rifiuti tra 2 giorni',
              changed: changedMs(e),
            })
          }
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

  const ranked: RankedCandidate[] = candidates.map((candidate) => ({
    ...candidate,
    score: contextualScore(candidate, {
      now,
      areaNameOf,
      occupiedAreas,
      pinned: Boolean(candidate.entityId && heroPref(candidate.entityId) === 'always'),
    }),
    visualSize: visualSizeFor(candidate),
  }))

  const sorted = ranked
    .filter((c) => !(c.entityId && banned.has(c.entityId)))
    .sort(bySlotOrder)
  const isPinned = (c: { entityId?: string }) => Boolean(c.entityId && heroPref(c.entityId) === 'always')
  // P0 sempre davanti; poi i pinned (presenza garantita); poi il resto.
  const orderedWithRedundancy = [
    ...sorted.filter((c) => c.priority === 0),
    ...sorted.filter((c) => c.priority !== 0 && isPinned(c)),
    ...sorted.filter((c) => c.priority !== 0 && !isPinned(c)),
  ]
  // Evita card quasi duplicate nella stessa stanza (per esempio due player o
  // due climate): conserva quella più rilevante. P0 e card fissate non vengono
  // mai eliminate dal dedupe.
  const seenAreaDomains = new Set<string>()
  const ordered = orderedWithRedundancy.filter((candidate) => {
    if (candidate.priority === 0 || isPinned(candidate) || !candidate.entityId) return true
    const domain = domainOf(candidate.entityId)
    const area = areaNameOf?.(candidate.entityId)
    if (!area || !AREA_DEDUPE_DOMAINS.has(domain)) return true
    const bucket = `${area}:${domain}`
    if (seenAreaDomains.has(bucket)) return false
    seenAreaDomains.add(bucket)
    return true
  })
  const selected = ordered.slice(0, maxHero)
  const hero = selected
    .map((c): HeroSlot => ({
      key: c.key,
      priority: c.priority,
      entityId: c.entityId,
      group: c.group,
      reason: c.reason,
      score: c.score,
      visualSize: selected.length === 1 ? 'XL' : c.visualSize,
    }))

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
