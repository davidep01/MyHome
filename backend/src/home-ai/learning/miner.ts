import type { HabitPattern, ProspectiveStep } from '../domain/contracts.js'
import { canonicalHash } from '../domain/ids.js'
import type { CoreConfig } from '../config.js'
import type { StoredEpisode } from '../episodes/arrival.js'

/**
 * Pattern mining locale, riproducibile, senza LLM (specifica §11).
 *
 * - Un'OPPORTUNITÀ è un rientro stabile con copertura completa: il
 *   denominatore include anche i rientri in cui l'azione NON è avvenuta
 *   (controesempi). Una finestra con gap non è né successo né insuccesso
 *   certo: abbassa la copertura dichiarata (T17, T18).
 * - Si contano solo azioni `manual_confirmed`, una per operazione e una per
 *   episodio: dieci click ripetuti nello stesso rientro non gonfiano il
 *   supporto (T16). Effetti di automazioni esistenti sono esclusi (T08).
 * - La scoperta avviene sui rientri più vecchi; la verifica su quelli
 *   successivi tenuti fuori (validazione temporale), mai sullo stesso episodio.
 * - Frequenza e Wilson al 95% sono statistiche del campione, non probabilità
 *   di correttezza universale.
 */

export const MINER_ALGORITHM = { name: 'ordered-subsequence-support', version: '1.0.0' }

/** Vantaggio minimo sul contesto di confronto per un'affermazione "dopo il rientro". */
export const MIN_CONTEXT_ADVANTAGE = 0.2
const MAX_TOKENS_PER_EPISODE = 8
const MAX_CANDIDATES_PER_CONTEXT = 10
const HOLDOUT_SHARE = 0.3
const MIN_HOLDOUT = 3

export interface MinerInput {
  episodes: StoredEpisode[]
  config: CoreConfig['learning']
  now: Date
  /** Giorni (data civile) in cui il primo passo è avvenuto fuori dai rientri, nella stessa fascia. */
  baselineDays: (token: string, daypart: string) => Set<string>
  /** Giorni osservati con copertura (denominatore della baseline). */
  observedDays: Set<string>
  suppressedPatternIds: Set<string>
  acceptedPatternIds: Set<string>
  previous: Map<string, HabitPattern>
  demo: boolean
}

export interface MinedPattern extends HabitPattern {
  demo: boolean
  evidence: { episode_id: string; role: 'success' | 'counterexample' | 'uncovered' }[]
  tokens: string[]
  labels: string[]
}

export function wilsonLower(successes: number, n: number, z = 1.96): number | null {
  if (n === 0) return null
  const p = successes / n
  const z2 = z * z
  const centre = p + z2 / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return Math.max(0, (centre - margin) / (1 + z2 / n))
}

function decayWeight(at: string, now: Date, halfLifeDays: number): number {
  const ageDays = Math.max(0, (now.getTime() - Date.parse(at)) / 86_400_000)
  return Math.pow(0.5, ageDays / halfLifeDays)
}

/** true se `seq` compare in ordine (anche non contiguo) dentro `tokens`. */
export function containsInOrder(tokens: string[], seq: string[]): boolean {
  let i = 0
  for (const token of tokens) {
    if (token === seq[i]) i += 1
    if (i === seq.length) return true
  }
  return seq.length === 0
}

function distinctTokens(episode: StoredEpisode): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const action of episode.actions) {
    if (seen.has(action.token)) continue
    seen.add(action.token)
    out.push(action.token)
    if (out.length >= MAX_TOKENS_PER_EPISODE) break
  }
  return out
}

function subsequences(tokens: string[], maxLen: number): string[][] {
  const out: string[][] = []
  const walk = (start: number, acc: string[]) => {
    if (acc.length) out.push([...acc])
    if (acc.length === maxLen) return
    for (let i = start; i < tokens.length; i += 1) {
      acc.push(tokens[i])
      walk(i + 1, acc)
      acc.pop()
    }
  }
  walk(0, [])
  return out
}

const CAPABILITY: Record<string, ProspectiveStep['capability_key']> = {
  lighting: 'lighting.set', switch: 'switch.set', climate: 'climate.set_mode', cover: 'cover.set',
  media: 'media.set', fan: 'fan.set', scene: 'scene.activate', script: 'scene.activate', vacuum: 'vacuum.set', humidifier: 'humidifier.set',
}

function stepFor(token: string, index: number, offsets: number[]): ProspectiveStep {
  const [actionKey, targetList] = token.split('|')
  const [family, verb] = actionKey.split('.')
  const capability = actionKey === 'climate.temperature' ? 'climate.set_temperature' : CAPABILITY[family] ?? 'switch.set'
  const sorted = [...offsets].sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  return {
    step_id: `s${index + 1}`,
    capability_key: capability,
    target_entity_ids: targetList ? targetList.split(',') : [],
    desired: { action: verb ?? actionKey, after_arrival_s: median },
    after_step_id: index > 0 ? `s${index}` : null,
    earliest_at: null,
    latest_at: null,
    required_state: {},
  }
}

export function mineArrivalPatterns(input: MinerInput): MinedPattern[] {
  const { config, now } = input
  const relevant = input.episodes
    // Rientri con ospiti: non contaminano il profilo ordinario, né come successi né come controesempi (§11).
    .filter((episode) => episode.demo === input.demo && episode.finalized_at && episode.scope.kind === 'household' && !episode.guests)
    .sort((a, b) => a.arrived_at.localeCompare(b.arrived_at))
  const byDaypart = new Map<string, StoredEpisode[]>()
  for (const episode of relevant) {
    if (episode.state !== 'present_stable') continue
    const list = byDaypart.get(episode.daypart) ?? []
    list.push(episode)
    byDaypart.set(episode.daypart, list)
  }

  const results: MinedPattern[] = []
  for (const [daypart, group] of byDaypart) {
    const eligible = group.filter((episode) => episode.coverage === 'complete')
    const uncovered = group.filter((episode) => episode.coverage !== 'complete')
    if (eligible.length < 2) continue
    const contextRule = `arrival.household.${daypart}`
    const holdoutSize = eligible.length >= 10 ? Math.max(MIN_HOLDOUT, Math.round(eligible.length * HOLDOUT_SHARE)) : 0
    const train = holdoutSize ? eligible.slice(0, eligible.length - holdoutSize) : eligible
    const holdout = holdoutSize ? eligible.slice(eligible.length - holdoutSize) : []

    const tokensOf = new Map(eligible.map((episode) => [episode.episode_id, distinctTokens(episode)]))
    const support = new Map<string, { seq: string[]; episodes: Set<string> }>()
    for (const episode of train) {
      for (const seq of subsequences(tokensOf.get(episode.episode_id) ?? [], config.max_sequence_steps)) {
        const key = seq.join('>')
        const entry = support.get(key) ?? { seq, episodes: new Set<string>() }
        entry.episodes.add(episode.episode_id)
        support.set(key, entry)
      }
    }
    const minTrainSupport = Math.max(2, Math.ceil(train.length * Math.max(0, config.min_frequency - 0.1)))
    let candidates = [...support.values()].filter((entry) => entry.episodes.size >= minTrainSupport)
    // Solo pattern "chiusi": una sottosequenza con lo stesso supporto di una più lunga è ridondante.
    candidates = candidates.filter((c) => !candidates.some((other) =>
      other !== c && other.seq.length > c.seq.length && other.episodes.size >= c.episodes.size && containsInOrder(other.seq, c.seq)))
    candidates.sort((a, b) => b.seq.length - a.seq.length || b.episodes.size - a.episodes.size || a.seq.join().localeCompare(b.seq.join()))
    candidates = candidates.slice(0, MAX_CANDIDATES_PER_CONTEXT)

    const firstAt = eligible[0].arrived_at
    const lastAt = eligible[eligible.length - 1].arrived_at
    const observationDays = (now.getTime() - Date.parse(firstAt)) / 86_400_000

    for (const candidate of candidates) {
      const successes = eligible.filter((episode) => containsInOrder(tokensOf.get(episode.episode_id) ?? [], candidate.seq))
      const successIds = new Set(successes.map((episode) => episode.episode_id))
      const n = eligible.length
      const s = successes.length
      const distinctDays = new Set(successes.map((episode) => episode.local_date)).size
      const confidence = n ? s / n : null
      const wilson = wilsonLower(s, n)
      const coverage = group.length ? eligible.length / group.length : 0
      const weightedNumerator = successes.reduce((sum, episode) => sum + decayWeight(episode.arrived_at, now, config.decay_half_life_days), 0)
      const weightedDenominator = eligible.reduce((sum, episode) => sum + decayWeight(episode.arrived_at, now, config.decay_half_life_days), 0)
      const weighted = weightedDenominator ? weightedNumerator / weightedDenominator : 0

      const baselineHits = input.baselineDays(candidate.seq[0], daypart)
      const baseline = input.observedDays.size ? Math.min(1, baselineHits.size / input.observedDays.size) : null

      const holdoutHits = holdout.filter((episode) => containsInOrder(tokensOf.get(episode.episode_id) ?? [], candidate.seq)).length
      const temporal: HabitPattern['temporal_validation'] = holdout.length < MIN_HOLDOUT
        ? 'pending'
        : holdoutHits / holdout.length >= config.min_frequency - 0.15 ? 'passed' : 'failed'

      const patternId = `pat-${canonicalHash({ scope: 'household', rule: contextRule, seq: candidate.seq, demo: input.demo }).slice(0, 16)}`
      const failing: string[] = []
      if (observationDays < config.min_observation_days) failing.push('COLD_START')
      if (n < config.min_opportunities) failing.push('FEW_OPPORTUNITIES')
      if (s < config.min_successes) failing.push('FEW_SUCCESSES')
      if (distinctDays < config.min_distinct_days) failing.push('FEW_DISTINCT_DAYS')
      if (coverage < config.min_coverage) failing.push('LOW_COVERAGE')
      if ((confidence ?? 0) < config.min_frequency) failing.push('LOW_FREQUENCY')
      if ((wilson ?? 0) < config.min_wilson_lower) failing.push('LOW_WILSON')
      if (baseline !== null && (confidence ?? 0) - baseline < MIN_CONTEXT_ADVANTAGE) failing.push('NO_CONTEXT_ADVANTAGE')
      if (temporal === 'failed') failing.push('TEMPORAL_VALIDATION_FAILED')
      const decayed = weighted < config.min_frequency && (confidence ?? 0) >= config.min_frequency

      const previous = input.previous.get(patternId)
      let state: HabitPattern['state']
      let reasons: string[]
      if (input.suppressedPatternIds.has(patternId)) { state = 'suppressed'; reasons = ['USER_SUPPRESSED'] }
      else if (input.acceptedPatternIds.has(patternId)) { state = 'accepted'; reasons = ['USER_ACCEPTED'] }
      else if (decayed && (previous?.state === 'supported' || previous?.state === 'accepted' || previous?.state === 'retired')) {
        state = 'retired'; reasons = ['DECAYED']
      } else if (!failing.length && !decayed) { state = 'supported'; reasons = temporal === 'passed' ? ['THRESHOLDS_MET', 'TEMPORAL_VALIDATION_PASSED'] : ['THRESHOLDS_MET', 'NOT_YET_VERIFIED_IN_TIME'] }
      // Un ritiro resta tale (con i motivi aggiornati) finché l'abitudine non torna sopra le soglie.
      else if ((previous?.state === 'supported' || previous?.state === 'retired') && failing.length) { state = 'retired'; reasons = failing }
      else { state = 'candidate'; reasons = decayed ? [...failing, 'DECAYED'] : failing }

      const offsets = candidate.seq.map((token) => successes
        .map((episode) => episode.actions.find((action) => action.token === token)?.offset_s)
        .filter((value): value is number => value !== undefined))

      const evidence: MinedPattern['evidence'] = [
        ...eligible.map((episode) => ({ episode_id: episode.episode_id, role: successIds.has(episode.episode_id) ? 'success' as const : 'counterexample' as const })),
        ...uncovered.map((episode) => ({ episode_id: episode.episode_id, role: 'uncovered' as const })),
      ]
      const counts = { eligible_opportunities: n, successes: s, counterexamples: n - s, distinct_days: distinctDays }
      const changed = !previous || JSON.stringify(previous.counts) !== JSON.stringify(counts) || previous.state !== state
      results.push({
        schema_version: 1,
        pattern_id: patternId,
        revision: previous ? previous.revision + (changed ? 1 : 0) : 1,
        scope: { kind: 'household', subject_id: null },
        state,
        context_rule_id: contextRule,
        steps: candidate.seq.map((token, index) => stepFor(token, index, offsets[index])),
        period: { from: firstAt, until: lastAt },
        counts,
        confidence,
        wilson_lower: wilson,
        coverage: Math.round(coverage * 1_000) / 1_000,
        weighted_score: Math.round(weighted * 1_000) / 1_000,
        baseline_frequency: baseline === null ? null : Math.round(baseline * 1_000) / 1_000,
        temporal_validation: temporal,
        evidence_episode_ids: evidence.map((entry) => entry.episode_id).slice(0, 500),
        algorithm: MINER_ALGORITHM,
        reviewed_at: previous?.reviewed_at ?? null,
        expires_at: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        privacy_scope_version: 1,
        status_reason: reasons.slice(0, 20),
        demo: input.demo,
        evidence,
        tokens: candidate.seq,
        labels: candidate.seq,
      })
    }
  }
  return results
}
