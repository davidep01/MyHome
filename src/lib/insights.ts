import type { ComposerEntity } from './composer'

/**
 * Suggerimenti (DOMINICA M6) — "automazioni invisibili" oneste: regole locali,
 * leggibili e testabili, che PROPONGONO un'azione. Mai auto-esecuzione: il tap
 * dell'utente sul bottone è la conferma.
 */

export interface InsightAction {
  label: string
  domain: string
  service: string
  /** entity_id passati alla service call (HA accetta liste). */
  entityIds: string[]
}

export interface Insight {
  id: string
  severity: 'warn' | 'info'
  label: string
  entityIds: string[]
  action?: InsightAction
}

const OPENING_CLASSES = new Set(['door', 'window', 'garage_door', 'opening', 'gate'])
const ACTIVE_HVAC = new Set(['heating', 'cooling'])
const AWAY_MIN_MS = 30 * 60 * 1000

function changedMs(e: ComposerEntity): number {
  const t = e.last_changed ? Date.parse(e.last_changed) : NaN
  return Number.isFinite(t) ? t : 0
}

export interface InsightOptions {
  /** entity_id → id area (per correlare finestra↔clima nella stessa area). */
  areaIdOf?: (entityId: string) => string | undefined
  nowMs: number
}

export function computeInsights(entities: ComposerEntity[], opts: InsightOptions): Insight[] {
  const { areaIdOf, nowMs } = opts
  const insights: Insight[] = []

  const persons = entities.filter((e) => e.entity_id.startsWith('person.'))
  const lightsOn = entities
    .filter((e) => e.entity_id.startsWith('light.') && e.state === 'on')
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id))

  // 1) Luci accese e casa vuota da ≥30 minuti → proponi "Spegni tutte".
  if (persons.length > 0 && lightsOn.length > 0) {
    const everyoneAway = persons.every((p) => p.state !== 'home')
    if (everyoneAway) {
      // "vuota da": dall'ultima variazione di presenza più recente
      const awaySince = Math.max(...persons.map(changedMs))
      if (awaySince > 0 && nowMs - awaySince >= AWAY_MIN_MS) {
        insights.push({
          id: 'lights-away',
          severity: 'warn',
          label: lightsOn.length === 1 ? 'Una luce accesa e casa vuota' : `${lightsOn.length} luci accese e casa vuota`,
          entityIds: lightsOn.map((e) => e.entity_id),
          action: {
            label: 'Spegni tutte',
            domain: 'light',
            service: 'turn_off',
            entityIds: lightsOn.map((e) => e.entity_id),
          },
        })
      }
    }
  }

  // 2) Apertura aperta con clima in azione nella stessa area → proponi spegnimento.
  const activeClimate = entities.filter((e) =>
    e.entity_id.startsWith('climate.') && ACTIVE_HVAC.has(String(e.attributes?.hvac_action ?? '')))
  const openOpenings = entities.filter((e) =>
    e.entity_id.startsWith('binary_sensor.')
    && e.state === 'on'
    && OPENING_CLASSES.has(String(e.attributes?.device_class ?? '')))

  if (activeClimate.length && openOpenings.length) {
    for (const climate of [...activeClimate].sort((a, b) => a.entity_id.localeCompare(b.entity_id))) {
      const climateArea = areaIdOf?.(climate.entity_id)
      const related = openOpenings.filter((o) => {
        const openingArea = areaIdOf?.(o.entity_id)
        // Senza aree correliamo comunque: una finestra aperta col clima acceso
        // è un'anomalia anche se non sappiamo in quale stanza.
        return !climateArea || !openingArea || climateArea === openingArea
      })
      if (related.length) {
        const heating = String(climate.attributes?.hvac_action) === 'heating'
        insights.push({
          id: `climate-opening:${climate.entity_id}`,
          severity: 'warn',
          label: heating ? 'Apertura aperta col riscaldamento acceso' : 'Apertura aperta col raffrescamento acceso',
          entityIds: [climate.entity_id, ...related.map((o) => o.entity_id)],
          action: {
            label: 'Spegni clima',
            domain: 'climate',
            service: 'turn_off',
            entityIds: [climate.entity_id],
          },
        })
        break // una sola chip per non affollare l'header
      }
    }
  }

  return insights
}
