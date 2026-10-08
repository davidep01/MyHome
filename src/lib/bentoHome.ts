import type { HeroVisualSize } from './composer'

/**
 * Home bento dinamica: TUTTI i dispositivi scelti nel wizard, sempre a
 * schermo pieno, ordinati da un punteggio che ragiona su tre segnali:
 *
 * 1. **uso** — quante volte tocchi quella card (decadimento a 7 giorni, vedi
 *    `cardUsage.ts`): ciò che usi di più sale e diventa più grande;
 * 2. **attività** — ciò che sta funzionando adesso (luce accesa, musica,
 *    clima che scalda) vale come un paio di tocchi recenti;
 * 3. **categoria** — a parità, sicurezza e clima prima dei sensori.
 *
 * Le prime card ricevono le tessere doppie: "più usata" = "più disponibile".
 * Il riordino lo decide il chiamante (`useComposedHome`), mai mentre tocchi.
 */

const DOMAIN_ORDER = [
  'alarm_control_panel', 'siren', 'lock', 'climate', 'water_heater', 'media_player',
  'light', 'cover', 'valve', 'fan', 'humidifier', 'vacuum', 'lawn_mower',
  'switch', 'input_boolean', 'scene', 'script', 'button', 'input_button',
  'select', 'input_select', 'number', 'input_number', 'binary_sensor', 'sensor',
  'weather', 'person', 'update',
]

function domainRank(entityId: string): number {
  const index = DOMAIN_ORDER.indexOf(entityId.split('.')[0])
  return index === -1 ? DOMAIN_ORDER.length : index
}

export interface RankSignals {
  nameOf: (id: string) => string
  /** Punteggio d'uso già decaduto (0 = mai toccata). */
  usageOf?: (id: string) => number
  /** true se il dispositivo sta facendo qualcosa adesso. */
  activeOf?: (id: string) => boolean
}

const ACTIVITY_WEIGHT = 2

/** Peso a priori della categoria: sempre < 1, così non supera mai un tocco reale. */
function categoryPrior(entityId: string): number {
  return (DOMAIN_ORDER.length - domainRank(entityId)) / (DOMAIN_ORDER.length + 1)
}

export function bentoWeight(id: string, signals: RankSignals): number {
  return (signals.usageOf?.(id) ?? 0)
    + (signals.activeOf?.(id) ? ACTIVITY_WEIGHT : 0)
    + categoryPrior(id)
}

/** Ordine per peso (uso + attività + categoria), poi nome: deterministico. */
export function rankBentoEntities(ids: string[], signals: RankSignals): string[] {
  const weight = new Map(ids.map((id) => [id, bentoWeight(id, signals)]))
  return [...ids].sort((a, b) =>
    weight.get(b)! - weight.get(a)!
    || signals.nameOf(a).localeCompare(signals.nameOf(b), 'it')
    || a.localeCompare(b))
}

const ACTIVE_STATES = new Set(['on', 'playing', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'auto', 'open', 'opening', 'closing', 'cleaning', 'mowing', 'returning', 'unlocked', 'triggered', 'arming', 'pending'])
const IDLE_HVAC = new Set(['idle', 'off'])

/** "Sta facendo qualcosa": vale per la card, non per i sensori passivi. */
export function isEntityActive(entity: { entity_id: string; state: string; attributes?: Record<string, unknown> } | undefined): boolean {
  if (!entity) return false
  const domain = entity.entity_id.split('.')[0]
  if (domain === 'sensor' || domain === 'binary_sensor' || domain === 'weather') return false
  if (domain === 'climate') {
    const action = String(entity.attributes?.hvac_action ?? '')
    return action ? !IDLE_HVAC.has(action) : entity.state !== 'off' && ACTIVE_STATES.has(entity.state)
  }
  if (domain === 'cover') return entity.state === 'opening' || entity.state === 'closing'
  return ACTIVE_STATES.has(entity.state)
}

/**
 * Applica il nuovo ordine solo quando è il momento: mentre la stai usando la
 * home non si rimescola (le card restano dove le hai lasciate, le nuove si
 * accodano, le rimosse spariscono). Quando torna ferma, riprende l'ordine
 * calcolato.
 */
export function settleBentoOrder(previous: string[], ranked: string[], canReorder: boolean): string[] {
  if (canReorder || previous.length === 0) return ranked
  const present = new Set(ranked)
  const kept = previous.filter((id) => present.has(id))
  const keptSet = new Set(kept)
  return [...kept, ...ranked.filter((id) => !keptSet.has(id))]
}

export interface BentoLayout {
  cols: number
  rows: number
  /** Colonne occupate da ciascuna tessera, nello stesso ordine delle card. */
  spans: number[]
}

const MAX_COLS = 4

function gridFor(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 }
  if (n === 2) return { cols: 1, rows: 2 }
  if (n <= 4) return { cols: 2, rows: 2 }
  if (n <= 6) return { cols: 3, rows: 2 }
  if (n <= 9) return { cols: 3, rows: 3 }
  if (n <= 12) return { cols: 4, rows: 3 }
  return { cols: MAX_COLS, rows: Math.ceil(n / MAX_COLS) }
}

/**
 * Geometria per `n` card: colonne × righe con area esattamente uguale a
 * `cols * rows` — le celle in eccesso diventano tessere doppie per le prime
 * card (le più pesanti), così la griglia (`grid-auto-flow: dense`) non lascia
 * buchi.
 */
export function bentoLayout(n: number): BentoLayout {
  if (n <= 0) return { cols: 1, rows: 0, spans: [] }
  // Da 3 card in su c'è sempre almeno una tessera doppia: la card più usata
  // deve risultare più grande delle altre, anche quando il numero "torna pari".
  const { cols, rows } = gridFor(n >= 3 ? n + 1 : n)
  let extra = cols * rows - n
  const spans = Array.from({ length: n }, () => {
    if (extra > 0 && cols > 1) {
      extra -= 1
      return 2
    }
    return 1
  })
  return { cols, rows, spans }
}

/** Taglia visiva della card per la tessera assegnata. */
export function bentoCardSize(span: number, layout: BentoLayout): HeroVisualSize {
  if (layout.cols === 1) return layout.rows === 1 ? 'L' : 'XL'
  if (span >= layout.cols) return 'XL'
  if (span * 2 >= layout.cols) return 'M'
  return 'S'
}
