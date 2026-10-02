import type { HAHistoryPoint } from '../api/backend'
import { powerValueInKw } from './statusBarEnergy'

export interface ConsumptionInsight {
  id: string
  severity: 'info' | 'warn'
  text: string
}

interface EntityLike {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
}

export const WATER_FLOW_WINDOW_MINUTES = 30
export const WATER_FLOW_THRESHOLD_L_PER_MIN = 2
const MIN_WATER_SAMPLES = 3

const WATER_KEYWORDS = /water|acqua|flow|portata/i
/** Solo unità di PORTATA (litri/ora al minuto o all'ora): un contatore cumulativo
 * (L, m³) va deliberatamente ignorato — una perdita "a delta" su un contatore
 * cumulativo non è verificabile qui contro hardware reale, e un falso allarme
 * "possibile perdita" è peggio del silenzio. */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' ? Number.isFinite(value)
    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
}

function numberOf(value: unknown): number {
  return typeof value === 'number' ? value : Number.parseFloat(String(value))
}

/**
 * Trova un sensore di FLUSSO d'acqua (non un contatore cumulativo): device_class
 * `water` oppure nome/id che richiama acqua/portata, con unità di misura a
 * portata (`L/min`, `m³/h`, …). Nessun candidato → nessun avviso, mai un falso
 * "forse perdita" per un sensore che in realtà misura litri totali.
 */
export function findWaterFlowSensor(entities: EntityLike[]): { entityId: string; name: string; unit: string } | null {
  const candidate = entities.find((entity) => {
    if (entity.state === 'unavailable' || !isFiniteNumber(entity.state)) return false
    const deviceClass = String(entity.attributes?.device_class ?? '')
    const unit = String(entity.attributes?.unit_of_measurement ?? '')
    if (toLitersPerMinute(0, unit) === null) return false
    return deviceClass === 'water' || WATER_KEYWORDS.test(entity.entity_id)
  })
  if (!candidate) return null
  const name = String(candidate.attributes?.friendly_name ?? candidate.entity_id)
  const unit = String(candidate.attributes?.unit_of_measurement ?? '')
  return { entityId: candidate.entity_id, name, unit }
}

function toLitersPerMinute(value: number, unit: string): number | null {
  const normalized = unit.toLowerCase().replace(/\s+/g, '')
  const factors: Record<string, number> = {
    'l/min': 1, 'l/h': 1 / 60,
    'm³/min': 1000, 'm3/min': 1000, 'm³/h': 1000 / 60, 'm3/h': 1000 / 60,
  }
  const factor = factors[normalized]
  return factor === undefined ? null : value * factor
}

/**
 * Un flusso costante e sostenuto (mai sceso sotto soglia) nell'ultima
 * WATER_FLOW_WINDOW_MINUTES suggerisce una perdita, non un uso normale
 * (intermittente per natura). Serve un minimo di campioni per essere onesti
 * sul "sostenuto": pochi punti non bastano a dirlo.
 */
export function detectSustainedWaterFlow(points: HAHistoryPoint[], unit: string, nowMs: number): ConsumptionInsight | null {
  const windowStart = nowMs - WATER_FLOW_WINDOW_MINUTES * 60_000
  // HA history consists of state transitions, not regularly sampled telemetry.
  // A state at/before the boundary is necessary to establish the full duration.
  const ordered = points.map((point) => ({ point, at: Date.parse(point.last_updated) }))
    .filter(({ at }) => Number.isFinite(at) && at <= nowMs)
    .sort((a, b) => a.at - b.at)
  const baseline = ordered.findLastIndex(({ at }) => at <= windowStart)
  if (baseline < 0) return null
  const recent = ordered.slice(baseline).map(({ point }) => point)
  if (recent.length < MIN_WATER_SAMPLES) return null
  // Do not discard unavailable/invalid states: they break evidence of continuity.
  if (recent.some((point) => !isFiniteNumber(point.state))) return null

  const litersPerMinute = recent.map((point) => toLitersPerMinute(numberOf(point.state), unit))
  if (litersPerMinute.some((value) => value === null)) return null

  const allAboveThreshold = (litersPerMinute as number[]).every((value) => value > WATER_FLOW_THRESHOLD_L_PER_MIN)
  if (!allAboveThreshold) return null

  return {
    id: 'water-sustained-flow',
    severity: 'warn',
    text: `Flusso d'acqua costante da almeno ${WATER_FLOW_WINDOW_MINUTES} minuti: possibile perdita.`,
  }
}

/** Never infer production from names: the user selects the actual HA sensor. */
export function findSolarProductionSensor(entities: EntityLike[], selectedId?: string): { entityId: string; kw: number } | null {
  if (!selectedId) return null
  const entity = entities.find((candidate) => candidate.entity_id === selectedId)
  if (!entity || entity.attributes?.device_class !== 'power') return null
  const kw = powerValueInKw(entity.state, entity.attributes?.unit_of_measurement)
  return kw !== null && kw >= 0 ? { entityId: entity.entity_id, kw } : null
}

/** Confronto onesto: un solo sensore di produzione contro un solo sensore di consumo, mai una somma arbitraria. */
export function detectSolarSelfSufficiency(consumptionKw: number, solarKw: number): ConsumptionInsight | null {
  if (!Number.isFinite(consumptionKw) || !Number.isFinite(solarKw) || consumptionKw <= 0.05 || solarKw < 0) return null
  if (solarKw < consumptionKw) return null
  return {
    id: 'solar-self-sufficiency',
    severity: 'info',
    text: 'Produzione solare copre il consumo attuale.',
  }
}

/** HA state transitions are held until the next transition; invalid spans make
 * a full-window baseline unknowable. Units are validated on every point. */
export function timeWeightedPowerKw(points: HAHistoryPoint[], unit: string, start: number, end: number): number | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null
  const ordered = points.map((point) => ({ point, at: Date.parse(point.last_updated) }))
    .filter(({ at }) => Number.isFinite(at) && at <= end).sort((a, b) => a.at - b.at)
  const baseline = ordered.findLastIndex(({ at }) => at <= start)
  if (baseline < 0) return null
  let total = 0
  for (let i = baseline; i < ordered.length; i++) {
    const from = Math.max(start, ordered[i].at)
    const to = i + 1 < ordered.length ? ordered[i + 1].at : end
    if (to <= from) continue
    const pointUnit = ordered[i].point.attributes?.unit_of_measurement ?? unit
    const kw = powerValueInKw(ordered[i].point.state, pointUnit)
    if (kw === null || kw < 0) return null
    total += kw * (to - from)
  }
  return total / (end - start)
}
