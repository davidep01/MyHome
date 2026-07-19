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
export interface InsightOptions {
  /** entity_id → id area (per correlare finestra↔clima nella stessa area). */
  areaIdOf?: (entityId: string) => string | undefined
  nowMs: number
}

export function computeInsights(entities: ComposerEntity[], opts: InsightOptions): Insight[] {
  const { areaIdOf } = opts
  const insights: Insight[] = []

  // Apertura aperta con clima in azione nella stessa area → proponi spegnimento.
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
