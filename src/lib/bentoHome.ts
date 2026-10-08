import type { HeroVisualSize } from './composer'

/**
 * Home bento: TUTTI i dispositivi scelti nel wizard, sempre a schermo pieno.
 *
 * Il composer di rilevanza mostrava solo ciò che "stava succedendo" (max 4):
 * una casa tranquilla diventava una home con una card sola e tanto vuoto.
 * Qui l'insieme è fisso (il configurato) e cambia solo la geometria: meno
 * dispositivi → card più grandi, più dispositivi → card più piccole, e la
 * griglia è sempre satura (nessun buco).
 *
 * Ordine stabile (categoria, poi nome): una card non deve saltare di posto
 * quando la tocchi. I primi della lista — le categorie più importanti —
 * ricevono le tessere doppie quando servono a chiudere la griglia.
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

/** Ordine stabile: categoria, poi nome visibile, poi entity_id. */
export function orderBentoEntities(ids: string[], nameOf: (id: string) => string): string[] {
  return [...ids].sort((a, b) =>
    domainRank(a) - domainRank(b)
    || nameOf(a).localeCompare(nameOf(b), 'it')
    || a.localeCompare(b))
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
 * card, così la griglia (con `grid-auto-flow: dense`) non lascia buchi.
 */
export function bentoLayout(n: number): BentoLayout {
  if (n <= 0) return { cols: 1, rows: 0, spans: [] }
  const { cols, rows } = gridFor(n)
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
