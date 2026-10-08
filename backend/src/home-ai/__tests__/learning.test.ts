import { describe, expect, it } from 'vitest'
import { HomeAiCore } from '../core.js'
import { defaultCoreConfig, type CoreConfig } from '../config.js'
import type { HabitPattern, ObservedEvent } from '../domain/contracts.js'
import { addDays, weekdayOf, zonedInstant, type ManualClock } from '../domain/time.js'
import { actionToken, type StoredEpisode } from '../episodes/arrival.js'
import { makeEvent, quality } from '../ingestion/normalize.js'
import { containsInOrder, MIN_CONTEXT_ADVANTAGE, mineArrivalPatterns, wilsonLower, type MinedPattern } from '../learning/miner.js'
import { createHomeAiRouter } from '../api/routes.js'
import { newCore, seededDemo } from './helpers.js'

/**
 * Pattern mining e abitudini d'arrivo (specifica §11, §12, matrice §26 T15–T21).
 *
 * Due livelli: test puri sul miner (episodi sintetici, nessuno storage) e
 * test end-to-end sul core (node:sqlite in memoria, ManualClock, replay di
 * eventi sintetici). Nessuna rete, nessun Home Assistant, nessun comando.
 */

const TZ = 'Europe/Rome'
const INGRESSO = actionToken('lighting.on', ['light.demo_ingresso'])
const SOGGIORNO = actionToken('lighting.on', ['light.demo_soggiorno'])
const CLIMA = actionToken('climate.mode', ['climate.demo_soggiorno'])
const ROUTINE = [INGRESSO, SOGGIORNO, CLIMA]
const DEMO_PRESENCE = ['demo-presence-1', 'demo-presence-2']

// ── Episodi sintetici per i test puri ─────────────────────────────────────────

interface EpisodeSpec {
  date: string
  tokens?: string[]
  coverage?: StoredEpisode['coverage']
  guests?: boolean
  state?: StoredEpisode['state']
}

let episodeSeq = 0

function episode(spec: EpisodeSpec): StoredEpisode {
  episodeSeq += 1
  const id = `ep-${String(episodeSeq).padStart(4, '0')}`
  const arrived = zonedInstant(spec.date, '18:30', TZ).instant
  const at = (s: number) => new Date(arrived.getTime() + s * 1_000).toISOString()
  const actions = (spec.tokens ?? []).map((token, i) => {
    const [actionKey, targets] = token.split('|')
    return {
      operation_id: `${id}-op-${i}`,
      action_key: actionKey,
      targets: targets.split(','),
      token,
      at: at(60 + i * 60),
      offset_s: 60 + i * 60,
      session_updates: 1,
    }
  })
  return {
    schema_version: 1,
    episode_id: id,
    state: spec.state ?? 'present_stable',
    scope: { kind: 'household', subject_id: null },
    subject_id: null,
    absent_since: new Date(arrived.getTime() - 8 * 3_600_000).toISOString(),
    arrived_at: arrived.toISOString(),
    stable_at: at(60),
    window_from: at(-120),
    window_until: at(1_200),
    local_date: spec.date,
    weekday: weekdayOf(spec.date),
    daypart: 'evening',
    coverage: spec.coverage ?? 'complete',
    others_present: false,
    guests: spec.guests ?? false,
    door_evidence: false,
    action_operation_ids: actions.map((a) => a.operation_id),
    automation_effects: [],
    late_corrected: false,
    actions,
    demo: false,
    finalized_at: at(1_200),
  }
}

/** Date civili consecutive ogni `step` giorni. */
function dates(count: number, from: string, step = 1): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i * step))
}

interface MineOpts {
  now?: string
  /** Giorni con il primo passo fuori dai rientri (numeratore della baseline). */
  baselineHits?: number
  /** Giorni osservati (denominatore della baseline); default: date degli episodi. */
  observed?: number
  previous?: HabitPattern[]
  suppressed?: string[]
  accepted?: string[]
  learning?: Partial<CoreConfig['learning']>
}

function mine(episodes: StoredEpisode[], opts: MineOpts = {}): MinedPattern[] {
  const last = episodes.map((e) => e.arrived_at).sort().at(-1) ?? '2026-10-01T00:00:00Z'
  const observed = opts.observed !== undefined
    ? new Set(Array.from({ length: opts.observed }, (_, i) => `obs-${i}`))
    : new Set(episodes.map((e) => e.local_date))
  return mineArrivalPatterns({
    episodes,
    config: { ...defaultCoreConfig().learning, ...opts.learning },
    now: new Date(opts.now ?? new Date(Date.parse(last) + 86_400_000).toISOString()),
    baselineDays: () => new Set(Array.from({ length: opts.baselineHits ?? 0 }, (_, i) => `hit-${i}`)),
    observedDays: observed,
    suppressedPatternIds: new Set(opts.suppressed ?? []),
    acceptedPatternIds: new Set(opts.accepted ?? []),
    previous: new Map((opts.previous ?? []).map((p) => [p.pattern_id, p])),
    demo: false,
  })
}

const routineOf = (patterns: MinedPattern[]) => patterns.find((p) => p.tokens.join('>') === ROUTINE.join('>'))

/** 10 rientri coperti in 19 giorni, 8 con la sequenza (controesempi in 4ª e 9ª posizione, come nella demo). */
function eightOfTen(from = '2026-09-01', step = 2): StoredEpisode[] {
  return dates(10, from, step).map((date, i) => episode({ date, tokens: i === 3 || i === 8 ? [] : ROUTINE }))
}

// ── Scenari end-to-end: eventi sintetici riprodotti nel core ─────────────────

interface StepSpec { key: string; target: string; afterS: number; repeat?: number; everyS?: number }
interface DaySpec {
  date: string
  arrival?: string
  steps?: StepSpec[]
  gap?: boolean
  automation?: string[]
  likely?: string[]
  /** Intenzioni manuali fuori dalla finestra del rientro (stessa sera). */
  later?: { key: string; target: string; at: string }[]
}

class Scenario {
  readonly events: ObservedEvent[] = []
  private seq = 0
  private op = 0

  constructor(private readonly tag: string, private readonly presence: string[] = ['test-presence-1']) {}

  private id(kind: string): string { return `${this.tag}-${kind}-${String(++this.seq).padStart(5, '0')}` }
  private source(native: string) { return { id: `${this.tag}-fixture`, kind: 'fixture' as const, native_id: native } }

  presenceSignal(source: string, status: 'home' | 'away', at: Date): void {
    const id = this.id('evt')
    this.events.push(makeEvent({
      event_id: id,
      kind: 'presence.signal',
      source: this.source(id),
      occurred_at: at.toISOString(),
      received_at: new Date(at.getTime() + 500).toISOString(),
      delivery: 'replay',
      quality: quality('system', 1, ['SYNTHETIC_PRESENCE']),
      payload: { presence_source_id: source, status, subject_id: null },
    }))
  }

  intent(actionKey: string, target: string, at: Date, attribution: 'manual_confirmed' | 'manual_likely' = 'manual_confirmed'): string {
    const op = `${this.tag}-op-${String(++this.op).padStart(5, '0')}`
    this.events.push(makeEvent({
      event_id: this.id('evt'),
      kind: 'manual.intent',
      source: this.source(`${op}:intent`),
      occurred_at: at.toISOString(),
      received_at: new Date(at.getTime() + 120).toISOString(),
      delivery: 'replay',
      actor_id: 'device-kiosk',
      quality: quality(attribution, attribution === 'manual_confirmed' ? 1 : 0.5, ['SYNTHETIC_GESTURE']),
      payload: { operation_id: op, interaction_id: `${op}-tap`, control: 'button', action_key: actionKey, target_entity_ids: [target], requested: {} },
    }))
    return op
  }

  stateChange(entityId: string, state: string, at: Date, attribution: 'automation' | 'manual_likely' | 'system'): void {
    const id = this.id('evt')
    this.events.push(makeEvent({
      event_id: id,
      kind: 'state.changed',
      source: this.source(id),
      occurred_at: at.toISOString(),
      received_at: new Date(at.getTime() + 300).toISOString(),
      delivery: 'replay',
      quality: quality(attribution, attribution === 'automation' ? 0.8 : 0.5, [attribution === 'automation' ? 'HA_PARENT_CONTEXT' : 'HA_USER_ID_ONLY']),
      context: { id: null, parent_id: attribution === 'automation' ? `${id}-parent` : null },
      payload: {
        entity_id: entityId,
        before: null,
        after: { state, attributes: {}, source_updated_at: at.toISOString(), availability: 'available' },
        effect_of_operation_id: null,
      },
    }))
  }

  gap(from: Date, until: Date): void {
    for (const [at, end] of [[from, null], [until, until]] as const) {
      const id = this.id('evt')
      this.events.push(makeEvent({
        event_id: id,
        kind: 'coverage.gap',
        source: this.source(id),
        occurred_at: at.toISOString(),
        received_at: at.toISOString(),
        delivery: 'replay',
        quality: quality('system', 1, ['SYNTHETIC_DISCONNECTION'], 'partial'),
        payload: { source_id: 'ha', from: from.toISOString(), until: end ? end.toISOString() : null, reason_code: end ? 'HA_RECONNECTED' : 'HA_DISCONNECTED' },
      }))
    }
  }

  /** Una giornata: tutti escono al mattino, il primo abitante rientra, gli altri dopo la finestra. */
  day(spec: DaySpec): this {
    const local = (time: string, extraS = 0) => new Date(zonedInstant(spec.date, time, TZ).instant.getTime() + extraS * 1_000)
    this.presence.forEach((source, i) => this.presenceSignal(source, 'away', local('08:00', i * 600)))
    const arrival = local(spec.arrival ?? '18:30')
    const after = (s: number) => new Date(arrival.getTime() + s * 1_000)
    if (spec.gap) this.gap(after(-15 * 60), after(40 * 60))
    this.presenceSignal(this.presence[0], 'home', arrival)
    for (const entity of spec.automation ?? []) this.stateChange(entity, 'on', after(5), 'automation')
    for (const entity of spec.likely ?? []) this.stateChange(entity, 'on', after(100), 'manual_likely')
    for (const step of spec.steps ?? []) {
      for (let r = 0; r < (step.repeat ?? 1); r += 1) this.intent(step.key, step.target, after(step.afterS + r * (step.everyS ?? 0)))
    }
    for (const later of spec.later ?? []) this.intent(later.key, later.target, local(later.at))
    this.presence.slice(1).forEach((source, i) => this.presenceSignal(source, 'home', after(70 * 60 + i * 60)))
    return this
  }
}

const ROUTINE_STEPS: StepSpec[] = [
  { key: 'lighting.on', target: 'light.demo_ingresso', afterS: 80 },
  { key: 'lighting.on', target: 'light.demo_soggiorno', afterS: 130 },
  { key: 'climate.mode', target: 'climate.demo_soggiorno', afterS: 360 },
]

/** Giorni feriali (lun–ven) a partire da `from`, `count` in tutto. */
function weekdaysFrom(from: string, count: number): string[] {
  const out: string[] = []
  for (let d = from; out.length < count; d = addDays(d, 1)) if (weekdayOf(d) <= 5) out.push(d)
  return out
}

/** Riproduce gli eventi nell'ordine di ricezione con orologio controllato, poi esegue il miner. */
async function replay(core: HomeAiCore, clock: ManualClock, events: ObservedEvent[], until: string): Promise<void> {
  const sorted = [...events].sort((a, b) => a.received_at.localeCompare(b.received_at) || a.event_id.localeCompare(b.event_id))
  for (const event of sorted) {
    clock.set(event.received_at)
    await core.tick({ allowMining: false, agents: false, light: true })
    expect(core.ingest(event, { demo: true }).status).toBe('stored')
    core.process()
  }
  clock.set(until)
  await core.tick({ allowMining: false, agents: false, light: true })
  core.refreshPatterns()
}

const OPEN_STATES = ['candidate', 'policy_checked', 'visible', 'snoozed']

function openProposalsFor(core: HomeAiCore, patternId: string) {
  return core.proposals.list({ states: OPEN_STATES, includePersonal: true, limit: 200 }).filter((p) => p.pattern_id === patternId)
}

function demoRoutine(core: HomeAiCore) {
  const pattern = core.patterns.list({ demo: true, includeRetired: true }).find((p) => p.tokens.join('>') === ROUTINE.join('>'))
  if (!pattern) throw new Error('pattern serale della demo non trovato')
  return pattern
}

function adminRouter(core: HomeAiCore) {
  return createHomeAiRouter({
    core: () => core,
    disabledReason: () => null,
    role: () => 'admin',
    authMode: () => 'disabled',
    haReachable: () => null,
    backups: {
      list: () => [],
      create: async () => ({ id: 'none', created_at: core.clock.now().toISOString() }),
      restore: async () => ({ restored_from: 'none', tombstones_reapplied: 0 }),
      lastRestoreVerifiedAt: () => null,
    },
    candidateEntities: () => [],
    dashboardEntities: () => [],
    onConfigChanged: () => {},
  })
}

let idempotency = 0
async function patternFeedback(core: HomeAiCore, patternId: string, kind: string) {
  const res = await adminRouter(core).request(`/patterns/${patternId}/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Idempotency-Key': `learning-test-${++idempotency}` },
    body: JSON.stringify({ kind }),
  })
  expect(res.status).toBe(200)
}

// ── Statistiche del miner ─────────────────────────────────────────────────────

describe('miner: statistiche del campione', () => {
  it('T15 limite inferiore di Wilson al 95%: valori noti, campione vuoto e monotonia', () => {
    expect(wilsonLower(0, 0)).toBeNull()
    expect(wilsonLower(8, 10)).toBeCloseTo(0.4902, 4)
    expect(wilsonLower(10, 10)).toBeCloseTo(0.7225, 4)
    expect(wilsonLower(0, 10)).toBe(0)
    // Stessa frequenza, campione più grande → limite più alto (meno incertezza).
    expect(wilsonLower(80, 100)!).toBeGreaterThan(wilsonLower(8, 10)!)
    // Il limite sta sempre sotto la frequenza osservata e dentro [0, 1].
    for (const [s, n] of [[1, 3], [7, 10], [8, 10], [9, 10], [3, 50]] as const) {
      const lower = wilsonLower(s, n)!
      expect(lower).toBeGreaterThanOrEqual(0)
      expect(lower).toBeLessThan(s / n)
    }
    // Con le soglie iniziali: 8/10 supera 0,45, 7/10 no (campione ridotto, non certezza).
    const { min_wilson_lower } = defaultCoreConfig().learning
    expect(wilsonLower(8, 10)!).toBeGreaterThanOrEqual(min_wilson_lower)
    expect(wilsonLower(7, 10)!).toBeLessThan(min_wilson_lower)
  })

  it('T15 la sequenza è riconosciuta in ordine anche non contiguo, mai in ordine inverso', () => {
    expect(containsInOrder([INGRESSO, 'media.play|media_player.tv', SOGGIORNO, CLIMA], ROUTINE)).toBe(true)
    expect(containsInOrder([SOGGIORNO, INGRESSO, CLIMA], ROUTINE)).toBe(false)
    expect(containsInOrder([INGRESSO, SOGGIORNO], ROUTINE)).toBe(false)
  })
})

describe('miner: opportunità, successi e controesempi', () => {
  it('T15 8 successi su 10 rientri coperti in oltre 14 giorni → candidato proponibile con conteggi 8/10', () => {
    const episodes = eightOfTen()
    const patterns = mine(episodes)
    const routine = routineOf(patterns)!
    expect(routine).toBeDefined()
    expect(routine.counts).toEqual({ eligible_opportunities: 10, successes: 8, counterexamples: 2, distinct_days: 8 })
    expect(routine.confidence).toBeCloseTo(0.8, 10)
    expect(routine.wilson_lower).toBeCloseTo(0.4902, 4)
    expect(routine.coverage).toBe(1)
    expect(routine.state).toBe('supported')
    expect(routine.status_reason).toEqual(['THRESHOLDS_MET', 'TEMPORAL_VALIDATION_PASSED'])
    expect(routine.algorithm.name).toBeTruthy()
    // Evidenze coerenti: ogni successo contiene la sequenza, ogni controesempio no.
    const byId = new Map(episodes.map((e) => [e.episode_id, e]))
    for (const entry of routine.evidence) {
      const tokens = byId.get(entry.episode_id)!.actions.map((a) => a.token)
      expect(entry.role).toBe(containsInOrder(tokens, ROUTINE) ? 'success' : 'counterexample')
    }
    expect(routine.evidence.filter((e) => e.role === 'success')).toHaveLength(8)
    expect(routine.evidence_episode_ids).toEqual(routine.evidence.map((e) => e.episode_id))
    // Piano ordinato con intervalli osservati (mediana dei successi).
    expect(routine.steps.map((s) => s.capability_key)).toEqual(['lighting.set', 'lighting.set', 'climate.set_mode'])
    expect(routine.steps.map((s) => s.after_step_id)).toEqual([null, 's1', 's2'])
    expect(routine.steps.map((s) => s.desired.after_arrival_s)).toEqual([60, 120, 180])
    // Le sottosequenze con lo stesso supporto sono ridondanti: si propone solo la sequenza chiusa.
    expect(patterns).toHaveLength(1)
  })

  it('T16 dieci click in un solo minuto valgono un solo gesto del rientro, non dieci campioni', () => {
    const toggle = actionToken('lighting.toggle', ['light.demo_soggiorno'])
    const burst = episode({ date: '2026-09-05', tokens: Array.from({ length: 10 }, () => toggle) })
    expect(burst.actions).toHaveLength(10)
    const quiet = dates(11, '2026-09-06').map((date) => episode({ date }))
    const patterns = mine([burst, ...quiet])
    expect(patterns.some((p) => p.tokens.includes(toggle))).toBe(false)
    // Anche abbassando le soglie, un solo episodio non sostiene nulla: supporto per episodio, non per click.
    const relaxed = mine([burst, episode({ date: '2026-09-06', tokens: [toggle] }), ...quiet], { learning: { min_opportunities: 3, min_successes: 2, min_distinct_days: 1, min_observation_days: 1, min_frequency: 0.1, min_wilson_lower: 0 } })
    const toggled = relaxed.find((p) => p.tokens.join() === toggle)!
    expect(toggled.counts.successes).toBe(2)
    expect(toggled.counts.eligible_opportunities).toBe(13)
  })

  it('T17 un rientro coperto senza l’azione prevista entra nel denominatore come controesempio', () => {
    const successes = dates(8, '2026-09-01', 2).map((date) => episode({ date, tokens: ROUTINE }))
    const onlySuccesses = routineOf(mine(successes))!
    expect(onlySuccesses.counts).toMatchObject({ eligible_opportunities: 8, successes: 8, counterexamples: 0 })

    // Un rientro senza azioni e uno con solo i primi due passi: entrambi controesempi della sequenza intera.
    const skipped = episode({ date: '2026-09-17' })
    const partial = episode({ date: '2026-09-18', tokens: [INGRESSO, SOGGIORNO] })
    const withCounter = routineOf(mine([...successes, skipped, partial]))!
    expect(withCounter.counts).toEqual({ eligible_opportunities: 10, successes: 8, counterexamples: 2, distinct_days: 8 })
    expect(withCounter.confidence).toBeCloseTo(0.8, 10)
    expect(withCounter.evidence.filter((e) => e.role === 'counterexample').map((e) => e.episode_id).sort())
      .toEqual([skipped.episode_id, partial.episode_id].sort())
  })

  it('T17 un rientro con ospiti non contamina il profilo ordinario (né successo né controesempio)', () => {
    const ordinary = eightOfTen()
    const withGuests = [...ordinary, ...dates(3, '2026-09-21').map((date) => episode({ date, guests: true }))]
    const routine = routineOf(mine(withGuests, { now: '2026-09-25T00:00:00Z' }))!
    expect(routine.counts).toEqual({ eligible_opportunities: 10, successes: 8, counterexamples: 2, distinct_days: 8 })
    expect(routine.state).toBe('supported')
  })

  it('T18 una finestra non coperta non è né successo né insuccesso certo: abbassa la copertura', () => {
    const base = eightOfTen()
    const uncoveredWithRoutine = episode({ date: '2026-09-02', tokens: ROUTINE, coverage: 'partial' })
    const routine = routineOf(mine([...base, uncoveredWithRoutine]))!
    expect(routine.counts).toEqual({ eligible_opportunities: 10, successes: 8, counterexamples: 2, distinct_days: 8 })
    expect(routine.coverage).toBeCloseTo(10 / 11, 3)
    expect(routine.evidence.find((e) => e.episode_id === uncoveredWithRoutine.episode_id)?.role).toBe('uncovered')
    expect(routine.state).toBe('supported')

    // Due finestre scoperte (anche senza azioni) non diventano controesempi, ma la copertura scende sotto 0,90.
    const uncoveredEmpty = episode({ date: '2026-09-04', coverage: 'partial' })
    const lowCoverage = routineOf(mine([...base, uncoveredWithRoutine, uncoveredEmpty]))!
    expect(lowCoverage.counts.counterexamples).toBe(2)
    expect(lowCoverage.counts.successes).toBe(8)
    expect(lowCoverage.coverage).toBeCloseTo(10 / 12, 3)
    expect(lowCoverage.status_reason).toContain('LOW_COVERAGE')
    expect(lowCoverage.state).toBe('candidate')
  })

  it('T18 rientri ambigui o annullati non sono opportunità', () => {
    const base = eightOfTen()
    const ambiguous = episode({ date: '2026-09-03', state: 'ambiguous' })
    const cancelled = episode({ date: '2026-09-05', state: 'cancelled' })
    const routine = routineOf(mine([...base, ambiguous, cancelled]))!
    expect(routine.counts.eligible_opportunities).toBe(10)
    expect(routine.coverage).toBe(1)
    expect(routine.evidence.map((e) => e.episode_id)).not.toContain(ambiguous.episode_id)
    expect(routine.evidence.map((e) => e.episode_id)).not.toContain(cancelled.episode_id)
  })

  it('T19 cold start: la stessa evidenza compressa in meno di 14 giorni resta un’ipotesi (COLD_START)', () => {
    // 11 rientri quotidiani tutti con la sequenza: soglie numeriche superate, finestra osservata troppo corta.
    const episodes = dates(11, '2026-09-01').map((date) => episode({ date, tokens: ROUTINE }))
    const routine = routineOf(mine(episodes))!
    expect(routine.counts).toMatchObject({ eligible_opportunities: 11, successes: 11 })
    expect(routine.status_reason).toEqual(['COLD_START'])
    expect(routine.state).toBe('candidate')
    // Pochi rientri: ancora meno.
    const few = routineOf(mine(episodes.slice(0, 3)))!
    expect(few.state).toBe('candidate')
    expect(few.status_reason).toEqual(expect.arrayContaining(['COLD_START', 'FEW_OPPORTUNITIES', 'FEW_SUCCESSES']))
    expect(few.temporal_validation).toBe('pending')
  })
})

describe('miner: baseline e validazione temporale', () => {
  it('T15 vantaggio sulla baseline: senza vantaggio contestuale il candidato non viene promosso', () => {
    const episodes = eightOfTen()
    // Il primo passo accade comunque in 7 sere osservate su 10, anche senza rientro.
    const noAdvantage = routineOf(mine(episodes, { baselineHits: 7, observed: 10 }))!
    expect(noAdvantage.baseline_frequency).toBeCloseTo(0.7, 3)
    expect(noAdvantage.confidence! - noAdvantage.baseline_frequency!).toBeLessThan(MIN_CONTEXT_ADVANTAGE)
    expect(noAdvantage.status_reason).toContain('NO_CONTEXT_ADVANTAGE')
    expect(noAdvantage.state).toBe('candidate')

    const advantage = routineOf(mine(episodes, { baselineHits: 5, observed: 10 }))!
    expect(advantage.baseline_frequency).toBeCloseTo(0.5, 3)
    expect(advantage.status_reason).not.toContain('NO_CONTEXT_ADVANTAGE')
    expect(advantage.state).toBe('supported')

    // Senza giorni osservati la baseline è ignota (null), non zero inventato.
    const unknown = routineOf(mine(episodes, { observed: 0 }))!
    expect(unknown.baseline_frequency).toBeNull()
  })

  it('T15 validazione temporale superata sui rientri successivi tenuti fuori', () => {
    const routine = routineOf(mine(eightOfTen()))!
    expect(routine.temporal_validation).toBe('passed')
  })

  it('T21 validazione temporale fallita: l’abitudine non si conferma nei rientri più recenti', () => {
    // 20 rientri: i primi 14 con la sequenza, poi 2 su 6 (frequenza totale 16/20 = 0,80).
    const episodes = dates(20, '2026-09-01').map((date, i) => episode({ date, tokens: i < 14 || i === 15 || i === 18 ? ROUTINE : [] }))
    const routine = routineOf(mine(episodes))!
    expect(routine.counts).toMatchObject({ eligible_opportunities: 20, successes: 16 })
    expect(routine.confidence).toBeCloseTo(0.8, 10)
    expect(routine.temporal_validation).toBe('failed')
    expect(routine.status_reason).toContain('TEMPORAL_VALIDATION_FAILED')
    expect(routine.state).not.toBe('supported')
  })

  it('T15 la scoperta usa solo i rientri meno recenti: una sequenza vista solo nel campione di verifica non è un candidato', () => {
    const episodes = dates(10, '2026-09-01', 2).map((date, i) => episode({ date, tokens: i >= 7 ? ROUTINE : [] }))
    expect(mine(episodes)).toHaveLength(0)
  })

  it('T15 senza campione di verifica: “ipotesi non ancora verificata nel tempo”', () => {
    const episodes = dates(8, '2026-09-01', 2).map((date) => episode({ date, tokens: ROUTINE }))
    const routine = routineOf(mine(episodes, { learning: { min_opportunities: 5, min_successes: 5 } }))!
    expect(routine.temporal_validation).toBe('pending')
    expect(routine.state).toBe('supported')
    expect(routine.status_reason).toEqual(['THRESHOLDS_MET', 'NOT_YET_VERIFIED_IN_TIME'])
  })
})

describe('miner: decadimento, ritiro e preferenze esplicite', () => {
  it('T21 decadimento: frequenza intera alta ma score pesato basso → ritiro motivato (DECAYED)', () => {
    // 16 successi fra 88 e 58 giorni fa, poi 4 rientri recenti senza la sequenza.
    const now = '2026-12-01T12:00:00Z'
    const old = dates(16, addDays('2026-12-01', -88), 2).map((date) => episode({ date, tokens: ROUTINE }))
    const recent = [-6, -4, -2, -1].map((d) => episode({ date: addDays('2026-12-01', d) }))
    const fresh = routineOf(mine([...old, ...recent], { now }))!
    expect(fresh.counts).toMatchObject({ eligible_opportunities: 20, successes: 16 })
    expect(fresh.confidence).toBeCloseTo(0.8, 10)
    // Conteggi interi e score pesato sono pubblicati separatamente.
    expect(fresh.weighted_score).toBeLessThan(defaultCoreConfig().learning.min_frequency)
    expect(fresh.weighted_score).toBeLessThan(fresh.confidence!)
    // Mai stato supportato: resta ipotesi, con il decadimento fra i motivi.
    expect(fresh.state).toBe('candidate')
    expect(fresh.status_reason).toContain('DECAYED')

    // Era supportato: ora si ritira, con motivo.
    const retired = routineOf(mine([...old, ...recent], { now, previous: [{ ...fresh, state: 'supported', status_reason: ['THRESHOLDS_MET'] }] }))!
    expect(retired.state).toBe('retired')
    expect(retired.status_reason).toEqual(['DECAYED'])
    expect(retired.revision).toBe(fresh.revision + 1)
  })

  it('T21 un’abitudine supportata che smette di ripetersi si ritira con i motivi, e resta ritirata', () => {
    const before = eightOfTen()
    const supported = routineOf(mine(before))!
    expect(supported.state).toBe('supported')

    const misses = dates(3, '2026-09-21').map((date) => episode({ date }))
    const retired = routineOf(mine([...before, ...misses], { previous: [supported] }))!
    expect(retired.counts).toMatchObject({ eligible_opportunities: 13, successes: 8, counterexamples: 5 })
    expect(retired.state).toBe('retired')
    expect(retired.status_reason).toEqual(expect.arrayContaining(['LOW_FREQUENCY', 'TEMPORAL_VALIDATION_FAILED']))

    // Al ciclo successivo, senza nuove conferme, non torna “ipotesi in apprendimento”: resta ritirata e motivata.
    const oneMore = episode({ date: '2026-09-24' })
    const again = routineOf(mine([...before, ...misses, oneMore], { previous: [retired] }))!
    expect(again.counts).toMatchObject({ eligible_opportunities: 14, successes: 8 })
    expect(again.state).toBe('retired')
    expect(again.status_reason).toEqual(expect.arrayContaining(['LOW_FREQUENCY']))

    // Se l'abitudine riprende davvero e torna sopra le soglie, può essere di nuovo supportata.
    const resumed = dates(12, '2026-09-25', 2).map((date) => episode({ date, tokens: ROUTINE }))
    const back = routineOf(mine([...before, ...misses, oneMore, ...resumed], { previous: [again] }))!
    expect(back.state).toBe('supported')
  })

  it('T20 soppressione e accettazione esplicite prevalgono sulle soglie del miner', () => {
    const episodes = eightOfTen()
    const id = routineOf(mine(episodes))!.pattern_id
    const suppressed = routineOf(mine(episodes, { suppressed: [id] }))!
    expect(suppressed.state).toBe('suppressed')
    expect(suppressed.status_reason).toEqual(['USER_SUPPRESSED'])
    // Anche se i dati diventerebbero più forti, la soppressione resta.
    const stronger = [...episodes, ...dates(6, '2026-09-21').map((date) => episode({ date, tokens: ROUTINE }))]
    expect(routineOf(mine(stronger, { suppressed: [id] }))!.state).toBe('suppressed')
    // L'identità del pattern non dipende da conteggi o revisione: la soppressione la ritrova.
    expect(routineOf(mine(stronger))!.pattern_id).toBe(id)
  })
})

// ── End-to-end sul core ───────────────────────────────────────────────────────

describe('core: abitudine serale della demo', () => {
  it('T15 demo: 8 rientri su 10 coperti in 3 settimane → abitudine supportata, conteggi 8/10, evidenze spiegabili', async () => {
    const { core } = await seededDemo()
    const routine = demoRoutine(core)
    expect(routine.context_rule_id).toBe('arrival.household.evening')
    expect(routine.state).toBe('supported')
    expect(routine.counts).toEqual({ eligible_opportunities: 10, successes: 8, counterexamples: 2, distinct_days: 8 })
    expect(routine.confidence).toBeCloseTo(0.8, 10)
    expect(routine.wilson_lower!).toBeGreaterThanOrEqual(core.config().learning.min_wilson_lower)
    expect(routine.coverage).toBeGreaterThanOrEqual(core.config().learning.min_coverage)
    expect(routine.coverage).toBeLessThan(1)
    expect(routine.baseline_frequency).toBe(0)
    expect(routine.temporal_validation).toBe('passed')
    const spanDays = (Date.parse(routine.period.until) - Date.parse(routine.period.from)) / 86_400_000
    expect(spanDays).toBeGreaterThanOrEqual(14)
    expect(routine.steps.map((s) => s.target_entity_ids[0])).toEqual(['light.demo_ingresso', 'light.demo_soggiorno', 'climate.demo_soggiorno'])
    expect(routine.steps.map((s) => s.desired.after_arrival_s)).toEqual([80, 130, 360])

    // “Perché me lo proponi?”: ogni episodio citato è consultabile e coerente con il suo ruolo.
    const explained = core.patterns.explain(routine.pattern_id)!
    const roles = explained.episodes.map((e) => e.role)
    expect(roles.filter((r) => r === 'success')).toHaveLength(8)
    expect(roles.filter((r) => r === 'counterexample')).toHaveLength(2)
    expect(roles.filter((r) => r === 'uncovered')).toHaveLength(1)
    for (const ep of explained.episodes) {
      expect(ep.daypart).toBe('evening')
      expect(ep.state).toBe('present_stable')
      const tokens = ep.actions.map((a) => a.token)
      if (ep.role === 'success') expect(containsInOrder(tokens, ROUTINE)).toBe(true)
      if (ep.role === 'counterexample') expect(containsInOrder(tokens, ROUTINE)).toBe(false)
      expect(ep.coverage).toBe(ep.role === 'uncovered' ? 'partial' : 'complete')
    }
    expect(new Set(explained.episodes.filter((e) => e.role === 'success').map((e) => e.local_date)).size).toBe(8)
    expect(new Set(explained.episodes.map((e) => e.episode_id))).toEqual(new Set(routine.evidence_episode_ids))

    // La proposta racconta gli stessi numeri, non una “intelligenza 92%”.
    const proposal = core.proposals.list({ includePersonal: true, limit: 50 }).find((p) => p.pattern_id === routine.pattern_id)!
    expect(proposal.explanation).toContain('in 8 dei 10 rientri serali osservabili')
    expect(proposal.explanation).toContain('In 2 rientri non è successo')
    expect(proposal.evidence_ids.every((id) => routine.evidence_episode_ids.includes(id))).toBe(true)
    expect(proposal.physical_execution).toBe('disabled')
  }, 60_000)

  it('T16 demo: i dieci click in un minuto restano intenzioni, ma nessuna abitudine né promozione automatica', async () => {
    const { core } = await seededDemo()
    const toggles = core.store.all("SELECT operation_id FROM observed_events WHERE kind = 'manual.intent' AND json_extract(body, '$.payload.action_key') = 'lighting.toggle'")
    expect(new Set(toggles.map((r) => String(r.operation_id))).size).toBe(10)
    const patterns = core.patterns.list({ demo: true, includeRetired: true })
    expect(patterns.some((p) => p.tokens.some((t) => t.startsWith('lighting.toggle')))).toBe(false)
    // Nessun pattern diventa “accettato” e nessuna routine viene salvata senza un gesto dell'utente.
    expect(patterns.some((p) => p.state === 'accepted')).toBe(false)
    expect(core.proposals.preferences().filter((p) => p.kind === 'routine')).toHaveLength(0)
  }, 60_000)

  it('T17 demo: i due rientri senza la sequenza sono controesempi nel denominatore', async () => {
    const { core } = await seededDemo()
    const routine = demoRoutine(core)
    expect(routine.counts.eligible_opportunities).toBe(routine.counts.successes + routine.counts.counterexamples)
    const counter = core.patterns.explain(routine.pattern_id)!.episodes.filter((e) => e.role === 'counterexample')
    expect(counter).toHaveLength(2)
    // Uno senza azioni, uno con un'altra azione (TV): entrambi rientri coperti.
    expect(counter.map((e) => e.actions.map((a) => a.action_key).join(',')).sort()).toEqual(['', 'media.play'])
  }, 60_000)

  it('T18 demo: il rientro durante la disconnessione non conta come successo pur contenendo la sequenza', async () => {
    const { core } = await seededDemo()
    const routine = demoRoutine(core)
    const uncovered = core.patterns.explain(routine.pattern_id)!.episodes.filter((e) => e.role === 'uncovered')
    expect(uncovered).toHaveLength(1)
    expect(uncovered[0].coverage).toBe('partial')
    expect(containsInOrder(uncovered[0].actions.map((a) => a.token), ROUTINE)).toBe(true)
    expect(routine.counts.successes).toBe(8)
    expect(routine.coverage).toBeCloseTo(10 / 11, 3)
  }, 60_000)

  it('T08 demo: gli effetti dell’automazione esistente (portico) non sono azioni manuali né passi di un’abitudine', async () => {
    const { core } = await seededDemo()
    const evening = core.arrivals.list({ demo: true, limit: 100, finalizedOnly: true }).filter((e) => e.daypart === 'evening' && e.state === 'present_stable')
    expect(evening.length).toBeGreaterThanOrEqual(10)
    for (const ep of evening) {
      expect(ep.automation_effects).toContain('light.demo_portico')
      expect(ep.actions.some((a) => a.targets.includes('light.demo_portico'))).toBe(false)
    }
    for (const pattern of core.patterns.list({ demo: true, includeRetired: true })) {
      expect(pattern.steps.flatMap((s) => s.target_entity_ids)).not.toContain('light.demo_portico')
    }
  }, 60_000)
})

describe('core: scenari sintetici', () => {
  it('T08 automazioni esistenti e azioni solo probabili non generano abitudini, anche se ripetute a ogni rientro', async () => {
    const { core, clock } = await newCore('2026-09-01T00:00:00Z')
    const scenario = new Scenario('auto')
    const days = weekdaysFrom('2026-09-01', 15)
    for (const date of days) {
      scenario.day({ date, automation: ['light.demo_portico'], likely: ['light.demo_soggiorno'] })
    }
    // Un altro client chiede l'ingresso a ogni rientro: è “probabile”, non confermato.
    for (const date of days) {
      scenario.intent('lighting.on', 'light.demo_ingresso', new Date(zonedInstant(date, '18:32', TZ).instant), 'manual_likely')
    }
    await replay(core, clock, scenario.events, `${addDays(days.at(-1)!, 1)}T06:00:00Z`)

    const episodes = core.arrivals.list({ demo: true, limit: 100, finalizedOnly: true })
    expect(episodes.filter((e) => e.state === 'present_stable')).toHaveLength(15)
    for (const ep of episodes) {
      expect(ep.actions).toHaveLength(0)
      expect(ep.automation_effects).toContain('light.demo_portico')
    }
    expect(core.patterns.list({ demo: true, includeRetired: true })).toHaveLength(0)
  }, 60_000)

  it('T16 dieci click in un minuto dentro un rientro: un episodio, nessuna abitudine, nessuna proposta', async () => {
    const { core, clock } = await newCore('2026-09-01T00:00:00Z')
    const scenario = new Scenario('burst')
    const days = weekdaysFrom('2026-09-01', 12)
    days.forEach((date, i) => scenario.day({
      date,
      steps: i === 5 ? [{ key: 'lighting.toggle', target: 'light.demo_soggiorno', afterS: 90, repeat: 10, everyS: 6 }] : [],
    }))
    await replay(core, clock, scenario.events, `${addDays(days.at(-1)!, 1)}T06:00:00Z`)

    const burst = core.arrivals.list({ demo: true, limit: 100, finalizedOnly: true }).find((e) => e.local_date === days[5])!
    // Le ripetizioni restano nella memoria dell'episodio (dieci gesti distinti)…
    expect(burst.actions).toHaveLength(10)
    expect(new Set(burst.action_operation_ids).size).toBe(10)
    // …ma non sono campioni indipendenti: nessun pattern, nessuna proposta di routine.
    expect(core.patterns.list({ demo: true, includeRetired: true })).toHaveLength(0)
    core.evaluate({ kind: 'review' })
    expect(core.proposals.list({ includePersonal: true, limit: 50 }).filter((p) => p.agent_key === 'arrival')).toHaveLength(0)
  }, 60_000)

  it('T15 baseline: un’azione che avviene ogni sera, rientro o no, non è un’abitudine del rientro', async () => {
    const { core, clock } = await newCore('2026-09-01T00:00:00Z')
    const scenario = new Scenario('baseline')
    const days = weekdaysFrom('2026-09-01', 15)
    for (const date of days) {
      scenario.day({ date, steps: ROUTINE_STEPS, later: [{ key: 'lighting.on', target: 'light.demo_ingresso', at: '21:30' }] })
    }
    await replay(core, clock, scenario.events, `${addDays(days.at(-1)!, 1)}T06:00:00Z`)
    const routine = core.patterns.list({ demo: true, includeRetired: true }).find((p) => p.tokens[0] === INGRESSO)!
    expect(routine.counts).toMatchObject({ eligible_opportunities: 15, successes: 15 })
    expect(routine.baseline_frequency).toBe(1)
    expect(routine.status_reason).toContain('NO_CONTEXT_ADVANTAGE')
    expect(routine.state).toBe('candidate')
  }, 60_000)

  it('T19 cold start: timeline dei rientri disponibile, nessun pattern presentato come stabile', async () => {
    const { core, clock } = await newCore('2026-09-01T00:00:00Z')
    // Core appena avviato: niente episodi, niente pattern, niente proposte inventate.
    core.refreshPatterns()
    expect(core.arrivals.list({ demo: true, limit: 10 })).toHaveLength(0)
    expect(core.patterns.list({ includeRetired: true })).toHaveLength(0)

    const scenario = new Scenario('cold')
    const days = weekdaysFrom('2026-09-01', 5)
    for (const date of days) scenario.day({ date, steps: ROUTINE_STEPS })
    await replay(core, clock, scenario.events, `${addDays(days.at(-1)!, 1)}T06:00:00Z`)

    const timeline = core.arrivals.list({ demo: true, limit: 100, finalizedOnly: true })
    expect(timeline).toHaveLength(5)
    for (const ep of timeline) {
      expect(ep.state).toBe('present_stable')
      expect(ep.actions.map((a) => a.token)).toEqual(ROUTINE)
    }
    const patterns = core.patterns.list({ demo: true, includeRetired: true })
    expect(patterns.length).toBeGreaterThan(0)
    for (const pattern of patterns) {
      expect(pattern.state).toBe('candidate')
      expect(pattern.status_reason).toEqual(expect.arrayContaining(['COLD_START', 'FEW_OPPORTUNITIES']))
    }
    core.evaluate({ kind: 'review' })
    expect(core.proposals.list({ includePersonal: true, limit: 50 }).filter((p) => p.agent_key === 'arrival')).toHaveLength(0)
  }, 60_000)

  it('T18 rientro durante una disconnessione: copertura parziale, escluso da successi e controesempi', async () => {
    const { core, clock } = await newCore('2026-09-01T00:00:00Z')
    const scenario = new Scenario('gap')
    const days = weekdaysFrom('2026-09-01', 12)
    days.forEach((date, i) => scenario.day({ date, gap: i === 4, steps: i === 4 || i === 9 ? [] : ROUTINE_STEPS }))
    await replay(core, clock, scenario.events, `${addDays(days.at(-1)!, 1)}T06:00:00Z`)

    const gapEpisode = core.arrivals.list({ demo: true, limit: 100, finalizedOnly: true }).find((e) => e.local_date === days[4])!
    expect(gapEpisode.coverage).toBe('partial')
    const routine = core.patterns.list({ demo: true, includeRetired: true }).find((p) => p.tokens.join('>') === ROUTINE.join('>'))!
    // 11 rientri coperti (10 successi, 1 controesempio): quello scoperto senza azioni non è un insuccesso.
    expect(routine.counts).toEqual({ eligible_opportunities: 11, successes: 10, counterexamples: 1, distinct_days: 10 })
    expect(routine.coverage).toBeCloseTo(11 / 12, 3)
    expect(core.patterns.evidence(routine.pattern_id).find((e) => e.episode_id === gapEpisode.episode_id)?.role).toBe('uncovered')
  }, 60_000)
})

describe('core: feedback, riavvio e decadimento', () => {
  it('T20 “non suggerire più” sulla proposta: soppressione rispettata dopo il riavvio, anche con nuovi rientri', async () => {
    const { core, store, clock } = await seededDemo()
    const routine = demoRoutine(core)
    const proposal = openProposalsFor(core, routine.pattern_id)[0]
    expect(proposal).toBeDefined()
    core.proposals.feedback(proposal.proposal_id, 'never_suggest', 'device-admin', proposal.scope, null)
    core.refreshPatterns()
    expect(core.patterns.get(routine.pattern_id)!.state).toBe('suppressed')

    // Riavvio: nuova istanza sullo stesso archivio.
    const restarted = new HomeAiCore({ store, clock })
    restarted.refreshPatterns()
    const after = restarted.patterns.get(routine.pattern_id)!
    expect(after.state).toBe('suppressed')
    expect(after.status_reason).toEqual(['USER_SUPPRESSED'])
    expect(restarted.evaluate({ kind: 'review' }).candidates.filter((c) => c.pattern_id === routine.pattern_id)).toHaveLength(0)
    expect(openProposalsFor(restarted, routine.pattern_id)).toHaveLength(0)

    // Nuovi rientri con la stessa sequenza cambiano i conteggi ma non la scelta dell'utente.
    const scenario = new Scenario('t20', DEMO_PRESENCE)
    const days = weekdaysFrom('2026-10-13', 3)
    for (const date of days) scenario.day({ date, steps: ROUTINE_STEPS })
    await replay(restarted, clock, scenario.events, `${addDays(days.at(-1)!, 1)}T06:00:00Z`)
    const later = restarted.patterns.get(routine.pattern_id)!
    expect(later.counts.successes).toBe(11)
    expect(later.state).toBe('suppressed')
    restarted.evaluate({ kind: 'review' })
    expect(openProposalsFor(restarted, routine.pattern_id)).toHaveLength(0)
  }, 60_000)

  it('T20 rifiuto esplicito sull’abitudine (contesto sbagliato): la proposta aperta sparisce e resta soppressa dopo il riavvio', async () => {
    const { core, store, clock } = await seededDemo()
    const routine = demoRoutine(core)
    const [open] = openProposalsFor(core, routine.pattern_id)
    expect(open).toBeDefined()
    await patternFeedback(core, routine.pattern_id, 'wrong_context')
    expect(core.patterns.get(routine.pattern_id)!.state).toBe('suppressed')
    expect(openProposalsFor(core, routine.pattern_id)).toHaveLength(0)
    expect(core.proposals.get(open.proposal_id)).toMatchObject({ state: 'withdrawn', reason_codes: ['PATTERN_SUPPRESSED'] })

    const restarted = new HomeAiCore({ store, clock })
    clock.advance(7 * 3_600_000)
    await restarted.tick()
    expect(restarted.patterns.get(routine.pattern_id)!.state).toBe('suppressed')
    expect(openProposalsFor(restarted, routine.pattern_id)).toHaveLength(0)
  }, 60_000)

  it('T20 un solo “non utile” non sopprime l’abitudine; il secondo sì', async () => {
    const { core } = await seededDemo()
    const routine = demoRoutine(core)
    await patternFeedback(core, routine.pattern_id, 'not_useful')
    expect(core.patterns.get(routine.pattern_id)!.state).toBe('supported')
    await patternFeedback(core, routine.pattern_id, 'not_useful')
    expect(core.patterns.get(routine.pattern_id)!.state).toBe('suppressed')
  }, 60_000)

  it('T21 abitudine della demo che non si ripete più: ritiro motivato, score pesato in calo, nessun suggerimento', async () => {
    const { core, clock } = await seededDemo()
    const before = demoRoutine(core)
    expect(before.state).toBe('supported')
    const [open] = openProposalsFor(core, before.pattern_id)
    expect(open).toBeDefined()

    // Tre rientri serali coperti in cui la sequenza non avviene (solo la TV).
    const scenario = new Scenario('t21', DEMO_PRESENCE)
    const days = weekdaysFrom('2026-10-13', 3)
    for (const date of days) scenario.day({ date, steps: [{ key: 'media.play', target: 'media_player.demo_tv', afterS: 120 }] })
    await replay(core, clock, scenario.events, `${addDays(days.at(-1)!, 1)}T06:00:00Z`)

    const retired = core.patterns.get(before.pattern_id)!
    expect(retired.state).toBe('retired')
    expect(retired.counts).toMatchObject({ eligible_opportunities: 13, successes: 8, counterexamples: 5 })
    expect(retired.status_reason).toEqual(expect.arrayContaining(['LOW_FREQUENCY', 'TEMPORAL_VALIDATION_FAILED']))
    expect(retired.weighted_score).toBeLessThan(before.weighted_score)
    expect(retired.revision).toBeGreaterThan(before.revision)
    // Non si continua a suggerirla: né nuovi candidati né proposte aperte.
    expect(core.evaluate({ kind: 'review' }).candidates.filter((c) => c.pattern_id === before.pattern_id)).toHaveLength(0)
    expect(openProposalsFor(core, before.pattern_id)).toHaveLength(0)
    expect(core.proposals.get(open.proposal_id)).toMatchObject({ state: 'withdrawn', reason_codes: ['PATTERN_RETIRED'] })

    // Altri tre rientri senza la sequenza: resta ritirata, sempre con un motivo.
    const more = new Scenario('t21b', DEMO_PRESENCE)
    const moreDays = weekdaysFrom(addDays(days.at(-1)!, 1), 3)
    for (const date of moreDays) more.day({ date })
    await replay(core, clock, more.events, `${addDays(moreDays.at(-1)!, 1)}T06:00:00Z`)
    const still = core.patterns.get(before.pattern_id)!
    expect(still.state).toBe('retired')
    expect(still.status_reason.length).toBeGreaterThan(0)
    expect(core.patterns.list({ demo: true }).map((p) => p.pattern_id)).not.toContain(before.pattern_id)
  }, 60_000)
})
