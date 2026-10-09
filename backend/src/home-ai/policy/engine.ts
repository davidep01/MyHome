import type { HomeContext, PolicyDecision, Preference } from '../domain/contracts.js'
import { newId } from '../domain/ids.js'
import { inTimeWindow, localParts } from '../domain/time.js'
import type { CoreConfig } from '../config.js'
import type { Candidate } from '../agents/types.js'

/**
 * Policy engine deterministico (specifica §16). Unico punto che decide se un
 * candidato può essere mostrato. Precedenza fissa:
 *
 *  1. barriera della release: nessuna esecuzione fisica;
 *  2. consenso, scope privacy, cancellazioni;
 *  3. sicurezza, capacità escluse, validità dei dati;
 *  4. preferenze esplicite, `never_suggest`, ospiti, quiet hours;
 *  5. vincoli esterni confermati (es. finestra di esposizione);
 *  6. obiettivi e priorità (punteggio con pesi espliciti);
 *  7. abitudini inferite.
 *
 * Le regole utente sono DATI in un DSL limitato (all/any/not, uguaglianza,
 * appartenenza, intervalli con unità, finestre orarie): niente codice
 * eseguibile da utenti o fonti. Il clock è iniettato.
 */

export const BUILTIN_POLICY_VERSION = 1

export type Fact =
  | 'context.daypart' | 'context.occupancy' | 'context.guests' | 'context.quiet_hours' | 'context.weekday'
  | 'context.mode' | 'candidate.agent_key' | 'candidate.kind' | 'candidate.risk' | 'candidate.topic' | 'candidate.urgency'
  | 'candidate.utility'

const FACTS = new Set<Fact>([
  'context.daypart', 'context.occupancy', 'context.guests', 'context.quiet_hours', 'context.weekday',
  'context.mode', 'candidate.agent_key', 'candidate.kind', 'candidate.risk', 'candidate.topic', 'candidate.urgency',
  'candidate.utility',
])

type ScalarValue = string | number | boolean | null

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { eq: { fact: Fact; value: ScalarValue } }
  | { in: { fact: Fact; values: ScalarValue[] } }
  | { range: { fact: Fact; min?: number; max?: number; unit: 'ratio' | 'count' | 'weekday' } }
  | { time_window: { from: string; until: string } }

export interface UserPolicyRule {
  rule_id: string
  description: string
  when: Condition
  outcome: 'defer' | 'reject' | 'simulate_only'
  reason_code: string
}

const MAX_DEPTH = 4
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Validazione del DSL: struttura chiusa, profondità e dimensioni limitate. */
export function validateCondition(input: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) return 'condizione troppo annidata'
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'condizione non valida'
  const keys = Object.keys(input)
  if (keys.length !== 1) return 'una sola chiave per condizione'
  const [op] = keys
  const value = (input as Record<string, unknown>)[op]
  switch (op) {
    case 'all': case 'any': {
      if (!Array.isArray(value) || value.length === 0 || value.length > 10) return `${op}: da 1 a 10 condizioni`
      for (const child of value) { const err = validateCondition(child, depth + 1); if (err) return err }
      return null
    }
    case 'not': return validateCondition(value, depth + 1)
    case 'eq': case 'in': case 'range': {
      const v = value as Record<string, unknown>
      if (!v || typeof v !== 'object' || !FACTS.has(v.fact as Fact)) return `${op}: fatto non ammesso`
      const scalar = (x: unknown) => x === null || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)) || (typeof x === 'string' && x.length <= 64)
      if (op === 'eq') return Object.keys(v).length === 2 && scalar(v.value) ? null : 'eq: valore non valido'
      if (op === 'in') return Object.keys(v).length === 2 && Array.isArray(v.values) && v.values.length <= 20 && v.values.every(scalar) ? null : 'in: valori non validi'
      const okNum = (x: unknown) => x === undefined || (typeof x === 'number' && Number.isFinite(x))
      if (!okNum(v.min) || !okNum(v.max) || !['ratio', 'count', 'weekday'].includes(String(v.unit))) return 'range: limiti o unità non validi'
      return Object.keys(v).every((k) => ['fact', 'min', 'max', 'unit'].includes(k)) ? null : 'range: chiave non prevista'
    }
    case 'time_window': {
      const v = value as Record<string, unknown>
      return v && TIME.test(String(v.from)) && TIME.test(String(v.until)) && Object.keys(v).length === 2 ? null : 'time_window non valida'
    }
    default: return `operatore non ammesso: ${op.slice(0, 20)}`
  }
}

export function validateRules(input: unknown): UserPolicyRule[] {
  if (!Array.isArray(input) || input.length > 50) throw new Error('massimo 50 regole')
  return input.map((raw, index) => {
    const rule = raw as Record<string, unknown>
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error(`regola ${index}: non valida`)
    const extra = Object.keys(rule).filter((k) => !['rule_id', 'description', 'when', 'outcome', 'reason_code'].includes(k))
    if (extra.length) throw new Error(`regola ${index}: chiave non prevista ${extra[0]}`)
    if (typeof rule.rule_id !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(rule.rule_id)) throw new Error(`regola ${index}: rule_id non valido`)
    if (typeof rule.description !== 'string' || rule.description.length > 200) throw new Error(`regola ${index}: descrizione non valida`)
    if (!['defer', 'reject', 'simulate_only'].includes(String(rule.outcome))) throw new Error(`regola ${index}: esito non ammesso`)
    if (typeof rule.reason_code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(rule.reason_code)) throw new Error(`regola ${index}: reason_code non valido`)
    const err = validateCondition(rule.when)
    if (err) throw new Error(`regola ${index}: ${err}`)
    return rule as unknown as UserPolicyRule
  })
}

function factValue(fact: Fact, context: HomeContext, candidate: Candidate): ScalarValue {
  switch (fact) {
    case 'context.daypart': return context.daypart
    case 'context.occupancy': return context.occupancy
    case 'context.guests': return context.guests
    case 'context.quiet_hours': return context.quiet_hours
    case 'context.weekday': return context.weekday
    case 'context.mode': return context.mode
    case 'candidate.agent_key': return candidate.agent_key
    case 'candidate.kind': return candidate.kind
    case 'candidate.risk': return candidate.risk
    case 'candidate.topic': return candidate.topic
    case 'candidate.urgency': return candidate.urgency
    case 'candidate.utility': return candidate.utility
  }
}

export function evaluateCondition(condition: Condition, context: HomeContext, candidate: Candidate): boolean {
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, context, candidate))
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(c, context, candidate))
  if ('not' in condition) return !evaluateCondition(condition.not, context, candidate)
  if ('eq' in condition) return factValue(condition.eq.fact, context, candidate) === condition.eq.value
  if ('in' in condition) return condition.in.values.includes(factValue(condition.in.fact, context, candidate))
  if ('range' in condition) {
    const value = factValue(condition.range.fact, context, candidate)
    if (typeof value !== 'number') return false
    return (condition.range.min === undefined || value >= condition.range.min) && (condition.range.max === undefined || value <= condition.range.max)
  }
  return inTimeWindow(context.local_time, condition.time_window.from, condition.time_window.until)
}

export interface PolicyState {
  config: CoreConfig
  now: Date
  learningConsent: boolean
  personalConsent: boolean
  preferences: Preference[]
  /** Proposte proattive già rese visibili oggi (per destinatario/scope del nucleo). */
  proactiveToday: number
  /** Ultima comparsa visibile per tema. */
  lastShownForTopic: (topic: string) => string | null
  /** Fatto richiesto → valido e non obsoleto? */
  factIsValid: (fact: string) => boolean
  userRules: UserPolicyRule[]
  policyVersion: number
}

const PROACTIVE = new Set(['preference', 'contextual_suggestion'])

export function decide(candidate: Candidate, context: HomeContext, state: PolicyState): PolicyDecision {
  const reasons: string[] = []
  const constraints: string[] = []
  const missing: string[] = []
  const { config } = state
  const result = (outcome: PolicyDecision['outcome']): PolicyDecision => ({
    decision_id: newId('pol'),
    candidate_key: candidate.dedup_key.slice(0, 200),
    outcome,
    reason_codes: reasons.slice(0, 20),
    constraints: constraints.slice(0, 20),
    missing_data: missing.slice(0, 20),
    policy_version: state.policyVersion,
    evaluated_at: state.now.toISOString(),
    context_snapshot_id: context.snapshot_id,
  })

  // 1. Barriera: un candidato può solo informare o proporre; mai eseguire.
  if (config.runtime.physical_execution !== 'disabled') { reasons.push('PHYSICAL_EXECUTION_DISABLED'); return result('reject') }
  constraints.push('Questa versione non controlla i dispositivi.')

  // 2. Consenso e scope.
  if (candidate.learned && !candidate.demo && !state.learningConsent) { reasons.push('LEARNING_CONSENT_MISSING'); return result('reject') }
  if (candidate.scope.kind === 'person' && !state.personalConsent) { reasons.push('PERSONAL_SCOPE_NOT_ALLOWED'); return result('reject') }

  // 3. Validità dei dati richiesti.
  for (const fact of candidate.requires) if (!state.factIsValid(fact)) missing.push(fact)
  if (missing.length) { reasons.push('STALE_OR_MISSING_DATA'); return result('reject') }
  if (Date.parse(candidate.expires_at) <= state.now.getTime()) { reasons.push('EXPIRED'); return result('reject') }

  // 4. Preferenze esplicite, ospiti, quiet hours.
  const active = state.preferences.filter((p) => !p.revoked_at)
  if (active.some((p) => p.kind === 'never_suggest' && (p.topic === candidate.topic || (candidate.pattern_id && p.pattern_id === candidate.pattern_id)))) {
    reasons.push('NEVER_SUGGEST'); return result('reject')
  }
  if (context.guests && candidate.learned) { reasons.push('GUEST_MODE'); return result('reject') }
  if (candidate.kind !== 'reminder' && candidate.pattern_id && active.some((p) => p.kind === 'routine' && p.pattern_id === candidate.pattern_id)) {
    reasons.push('ALREADY_SAVED_AS_PREFERENCE'); return result('reject')
  }
  const local = localParts(state.now, config.runtime.timezone)
  const quiet = inTimeWindow(local.time, config.attention.quiet_hours.from, config.attention.quiet_hours.until)
  if (quiet && candidate.urgency !== 'high') { reasons.push('QUIET_HOURS'); constraints.push(`Fascia di quiete ${config.attention.quiet_hours.from}–${config.attention.quiet_hours.until}`) ; return result('defer') }

  // Regole utente (dati, DSL limitato), dopo le precedenze inderogabili.
  for (const rule of state.userRules) {
    if (evaluateCondition(rule.when, context, candidate)) { reasons.push(rule.reason_code); constraints.push(rule.description); return result(rule.outcome) }
  }

  // 5–6. Budget di attenzione e cooldown per tema (i promemoria hanno budget distinto).
  if (PROACTIVE.has(candidate.kind)) {
    if (state.proactiveToday >= config.attention.proactive_daily_budget) { reasons.push('ATTENTION_BUDGET_EXHAUSTED'); return result('defer') }
    const last = state.lastShownForTopic(candidate.topic)
    if (last && state.now.getTime() - Date.parse(last) < config.attention.topic_cooldown_hours * 3_600_000) {
      reasons.push('TOPIC_COOLDOWN'); return result('defer')
    }
  }
  const w = config.policy.weights
  const imminence = candidate.urgency === 'high' ? 1 : candidate.urgency === 'normal' ? 0.6 : 0.3
  const score = w.utility * candidate.utility + w.imminence * imminence + w.support * candidate.support
    - w.attention_cost * candidate.attention_cost - w.uncertainty * candidate.uncertainty
  if (score < config.policy.min_score) { reasons.push('LOW_UTILITY'); return result('reject') }

  // 7. Modalità operativa.
  if (config.runtime.mode === 'observe') { reasons.push('MODE_OBSERVE'); return result('reject') }
  if (config.runtime.mode === 'shadow') { reasons.push('MODE_SHADOW'); return result('simulate_only') }
  reasons.push(candidate.kind === 'reminder' ? 'REMINDER_ALLOWED' : 'SUGGESTION_ALLOWED')
  return result('allow_local')
}

/** Rischio prospettico del piano: documenta, NON autorizza (tutti i livelli restano ineseguibili). */
export function riskOfCapability(capability: string): 'information' | 'low' | 'medium' | 'high' {
  if (capability === 'reminder.show' || capability === 'preference.save') return 'information'
  if (capability === 'lighting.set' || capability === 'switch.set' || capability === 'media.set' || capability === 'scene.activate') return 'low'
  if (capability.startsWith('climate') || capability === 'cover.set' || capability === 'fan.set' || capability === 'vacuum.set' || capability === 'humidifier.set') return 'medium'
  return 'high'
}
