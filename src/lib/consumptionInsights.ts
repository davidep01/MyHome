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
const RATE_UNIT = /\/\s*(min|h)\b/i
const SOLAR_KEYWORDS = /solar|solare|fotovoltaic|pv\b/i

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && Number.isFinite(Number.parseFloat(value))
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
    if (!RATE_UNIT.test(unit)) return false
    return deviceClass === 'water' || WATER_KEYWORDS.test(entity.entity_id)
  })
  if (!candidate) return null
  const name = String(candidate.attributes?.friendly_name ?? candidate.entity_id)
  const unit = String(candidate.attributes?.unit_of_measurement ?? '')
  return { entityId: candidate.entity_id, name, unit }
}

function toLitersPerMinute(value: number, unit: string): number | null {
  const normalized = unit.toLowerCase().replace(/\s+/g, '')
  const isCubicMeters = normalized.includes('m³') || normalized.includes('m3')
  const liters = isCubicMeters ? value * 1000 : value
  if (normalized.includes('/min')) return liters
  if (normalized.includes('/h')) return liters / 60
  return null
}

/**
 * Un flusso costante e sostenuto (mai sceso sotto soglia) nell'ultima
 * WATER_FLOW_WINDOW_MINUTES suggerisce una perdita, non un uso normale
 * (intermittente per natura). Serve un minimo di campioni per essere onesti
 * sul "sostenuto": pochi punti non bastano a dirlo.
 */
export function detectSustainedWaterFlow(points: HAHistoryPoint[], unit: string, nowMs: number): ConsumptionInsight | null {
  const windowStart = nowMs - WATER_FLOW_WINDOW_MINUTES * 60_000
  const recent = points.filter((point) => Date.parse(point.last_updated) >= windowStart && isFiniteNumber(point.state))
  if (recent.length < MIN_WATER_SAMPLES) return null

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

/** Sensore di produzione solare più attivo (device_class power, nome/id "solare"). */
export function findSolarProductionSensor(entities: EntityLike[]): { entityId: string; kw: number } | null {
  const candidates = entities.filter((entity) => (
    entity.attributes?.device_class === 'power'
    && SOLAR_KEYWORDS.test(entity.entity_id)
    && entity.state !== 'unavailable'
    && isFiniteNumber(entity.state)
  ))
  if (candidates.length === 0) return null
  const best = [...candidates].sort((a, b) => numberOf(b.state) - numberOf(a.state))[0]
  const kw = powerValueInKw(best.state, best.attributes?.unit_of_measurement)
  if (kw === null) return null
  return { entityId: best.entity_id, kw }
}

/** Confronto onesto: un solo sensore di produzione contro un solo sensore di consumo, mai una somma arbitraria. */
export function detectSolarSelfSufficiency(consumptionKw: number, solarKw: number): ConsumptionInsight | null {
  if (consumptionKw <= 0.05) return null
  if (solarKw < consumptionKw * 0.95) return null
  return {
    id: 'solar-self-sufficiency',
    severity: 'info',
    text: 'Produzione solare copre il consumo attuale.',
  }
}
