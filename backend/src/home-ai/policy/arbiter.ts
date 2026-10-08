import type { Candidate } from '../agents/types.js'
import { canonicalHash } from '../domain/ids.js'

/**
 * Arbitraggio fra candidati della stessa valutazione (specifica §16).
 *
 * - Stessa proposta da più agenti → una sola, con motivazioni aggregate (T33):
 *   stessa chiave di deduplica OPPURE stesso piano prospettico proposto da un
 *   agente diverso (ogni agente usa chiavi proprie, quindi la sola chiave non
 *   basterebbe mai a riconoscere due agenti che propongono la stessa azione).
 * - Proposte opposte sulla stessa risorsa → si tiene la più supportata e il
 *   conflitto viene ESPLICITATO nella spiegazione; l'altra è scartata con
 *   motivo, mai sommate entrambe (T34).
 * - Una preferenza esplicita prevale sempre su un pattern inferito (T35): è
 *   già applicata dal policy engine; qui si scarta il candidato appreso che
 *   contraddice una preferenza salvata sulla stessa risorsa.
 */

export interface ArbitrationOutcome {
  kept: Candidate[]
  dropped: { candidate: Candidate; reason: string }[]
}

function desiredOf(candidate: Candidate): Map<string, string> {
  const out = new Map<string, string>()
  for (const step of candidate.steps) {
    const action = String(step.desired.action ?? step.desired.state ?? '')
    for (const target of step.target_entity_ids) out.set(target, action)
  }
  return out
}

const OPPOSITE: Record<string, string> = { on: 'off', off: 'on', open: 'close', close: 'open', play: 'pause', pause: 'play' }

/** Identità del piano prospettico, indipendente dalle etichette dei passi. Null se non c'è un piano. */
function planKey(candidate: Candidate): string | null {
  if (!candidate.steps.length) return null
  return canonicalHash(candidate.steps.map((step) => ({
    capability_key: step.capability_key,
    targets: [...step.target_entity_ids].sort(),
    desired: step.desired,
    earliest_at: step.earliest_at,
    latest_at: step.latest_at,
    required_state: step.required_state,
  })))
}

export function arbitrate(candidates: Candidate[], preferredTargets: Map<string, string> = new Map()): ArbitrationOutcome {
  const dropped: ArbitrationOutcome['dropped'] = []
  const byKey = new Map<string, Candidate>()
  const byPlan = new Map<string, Candidate>()
  for (const candidate of candidates) {
    const plan = planKey(candidate)
    const samePlan = plan ? byPlan.get(plan) : undefined
    // Stessa chiave, oppure lo stesso piano proposto da un ALTRO agente.
    const existing = byKey.get(candidate.dedup_key) ?? (samePlan && samePlan.agent_key !== candidate.agent_key ? samePlan : undefined)
    if (!existing) {
      const copy = { ...candidate }
      byKey.set(candidate.dedup_key, copy)
      if (plan && !byPlan.has(plan)) byPlan.set(plan, copy)
      continue
    }
    // Duplicato: si fondono evidenze e motivazioni, una sola proposta.
    existing.evidence_ids = [...new Set([...existing.evidence_ids, ...candidate.evidence_ids])].slice(0, 200)
    existing.support = Math.max(existing.support, candidate.support)
    if (!existing.explanation.includes(candidate.explanation)) {
      existing.explanation = `${existing.explanation} Anche l’agente ${candidate.agent_key} arriva alla stessa conclusione.`.slice(0, 1_000)
    }
    dropped.push({ candidate, reason: 'MERGED_DUPLICATE' })
  }

  const kept: Candidate[] = []
  const sorted = [...byKey.values()].sort((a, b) => b.support - a.support || b.utility - a.utility || a.dedup_key.localeCompare(b.dedup_key))
  for (const candidate of sorted) {
    const desired = desiredOf(candidate)
    const preferenceConflict = [...desired].find(([target, action]) => preferredTargets.has(target) && OPPOSITE[preferredTargets.get(target)!] === action)
    if (preferenceConflict && candidate.learned) {
      dropped.push({ candidate, reason: 'EXPLICIT_PREFERENCE_PREVAILS' })
      continue
    }
    const conflict = kept.find((other) => {
      const otherDesired = desiredOf(other)
      return [...desired].some(([target, action]) => otherDesired.has(target) && OPPOSITE[otherDesired.get(target)!] === action)
    })
    if (conflict) {
      conflict.explanation = `${conflict.explanation} Nota: un’altra ipotesi suggeriva l’opposto sulla stessa risorsa; è stata scartata perché meno supportata.`.slice(0, 1_000)
      dropped.push({ candidate, reason: 'CONFLICT_LOWER_SUPPORT' })
      continue
    }
    kept.push(candidate)
  }
  return { kept, dropped }
}
