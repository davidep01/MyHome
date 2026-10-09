import { describe, expect, it } from 'vitest'
import type { Candidate } from '../agents/types.js'
import type { ProspectiveStep } from '../domain/contracts.js'
import { CoreError } from '../domain/errors.js'
import { seededRandom } from '../domain/ids.js'
import { arbitrate } from '../policy/arbiter.js'
import { decide, type PolicyState } from '../policy/engine.js'
import { defaultCoreConfig, type CoreConfig } from '../config.js'
import type { HomeAiCore } from '../core.js'
import type { StoredPattern } from '../learning/patterns.js'
import type { StoredProposal } from '../suggestions/service.js'
import { newCore, seededDemo } from './helpers.js'

/**
 * Policy, arbitraggio, approvazioni e simulatore (specifica §16–18, T33–T39).
 * Clock sempre iniettato (ManualClock dei helper), nessuna rete.
 */

const HOUSEHOLD = { kind: 'household', subject_id: null } as const

function step(id: string, capability: ProspectiveStep['capability_key'], targets: string[], action: string): ProspectiveStep {
  return {
    step_id: id, capability_key: capability, target_entity_ids: targets, desired: { action },
    after_step_id: null, earliest_at: null, latest_at: null, required_state: {},
  }
}

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    agent_key: 'weather',
    kind: 'contextual_suggestion',
    topic: 'test:argomento',
    title: 'Proposta di prova',
    explanation: 'Motivo A.',
    evidence_ids: ['ev-a'],
    pattern_id: null,
    occurrence_id: null,
    risk: 'low',
    resources: ['light.demo_ingresso'],
    steps: [step('s1', 'lighting.set', ['light.demo_ingresso'], 'on')],
    scope: HOUSEHOLD,
    urgency: 'normal',
    expires_at: '2026-10-14T19:00:00.000Z',
    utility: 0.7,
    support: 0.6,
    uncertainty: 0.2,
    attention_cost: 0.3,
    dedup_key: 'test:a',
    requires: [],
    learned: false,
    demo: true,
    ...over,
  }
}

function policyState(config: CoreConfig, now: Date, over: Partial<PolicyState> = {}): PolicyState {
  return {
    config,
    now,
    learningConsent: false,
    personalConsent: false,
    preferences: [],
    proactiveToday: 0,
    lastShownForTopic: () => null,
    factIsValid: () => true,
    userRules: [],
    policyVersion: 1,
    ...over,
  }
}

function suggestConfig(): CoreConfig {
  const config = defaultCoreConfig()
  config.runtime.mode = 'suggest'
  return config
}

function arrivalProposal(core: HomeAiCore): StoredProposal {
  const proposal = core.proposals.list({ includePersonal: true, limit: 50 }).find((p) => p.agent_key === 'arrival')
  if (!proposal) throw new Error('la demo deve produrre una proposta di rientro')
  return proposal
}

function supportedPattern(core: HomeAiCore): StoredPattern {
  const pattern = core.patterns.list({ demo: true }).find((p) => p.state === 'supported')
  if (!pattern) throw new Error('la demo deve produrre un pattern supportato')
  return pattern
}

function countRows(core: HomeAiCore, table: string): number {
  return Number(core.store.get(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0)
}

/** Seed deterministico per cui il guasto simulato cade sul passo `index` di `steps`. */
function seedFailingAt(index: number, steps: number): number {
  for (let seed = 0; seed < 10_000; seed += 1) {
    if (Math.floor(seededRandom(seed)() * steps) === index) return seed
  }
  throw new Error('nessun seed trovato')
}

describe('T33 — deduplica fra agenti', () => {
  it('T33 due agenti con la stessa proposta → una sola voce in inbox con motivazioni ed evidenze aggregate', async () => {
    const weather = candidate({ agent_key: 'weather', dedup_key: 'shared:finestra', explanation: 'Pioggia prevista.', evidence_ids: ['ev-meteo'], support: 0.6 })
    const comfort = candidate({ agent_key: 'comfort', dedup_key: 'shared:finestra', explanation: 'Clima acceso con finestra aperta.', evidence_ids: ['ev-comfort'], support: 0.8 })

    const { kept, dropped } = arbitrate([weather, comfort])
    expect(kept).toHaveLength(1)
    expect(dropped.map((d) => d.reason)).toEqual(['MERGED_DUPLICATE'])
    expect(kept[0].evidence_ids).toEqual(expect.arrayContaining(['ev-meteo', 'ev-comfort']))
    expect(kept[0].support).toBe(0.8)
    expect(kept[0].explanation).toContain('Pioggia prevista.')
    expect(kept[0].explanation).toContain('comfort')
    // Gli input non vengono mutati: l'arbitro lavora su copie.
    expect(weather.evidence_ids).toEqual(['ev-meteo'])

    // Attraverso policy e lifecycle: una sola proposta persistita.
    const { core, clock } = await newCore('2026-10-12T17:00:00Z')
    const config = suggestConfig()
    const context = core.contexts.build(config)
    const decision = decide(kept[0], context, policyState(config, clock.now()))
    expect(decision.outcome).toBe('allow_local')
    core.proposals.upsert(kept[0], decision)
    // Rivalutazione successiva dello stesso candidato: nessuna seconda voce.
    core.proposals.upsert(kept[0], decide(kept[0], context, policyState(config, clock.now())))
    const stored = core.proposals.list({ includePersonal: true, limit: 50 })
    expect(stored).toHaveLength(1)
    expect(stored[0].evidence_ids).toEqual(expect.arrayContaining(['ev-meteo', 'ev-comfort']))
  })

  it('T33 agenti diversi con lo stesso piano ma chiavi proprie → una sola proposta, motivazioni di entrambi', () => {
    const plan = [step('s1', 'lighting.set', ['light.demo_ingresso'], 'off')]
    const a = candidate({ agent_key: 'energy', dedup_key: 'energy:ingresso', topic: 'energy:ingresso', steps: plan, explanation: 'Luce accesa a casa vuota.', evidence_ids: ['ev-energia'], support: 0.7 })
    const b = candidate({ agent_key: 'comfort', dedup_key: 'comfort:ingresso', topic: 'comfort:ingresso', steps: plan.map((s) => ({ ...s, step_id: 'p1' })), explanation: 'Stanza non occupata.', evidence_ids: ['ev-comfort'], support: 0.5 })

    const { kept, dropped } = arbitrate([a, b])
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(1)
    expect(dropped[0].reason).toBe('MERGED_DUPLICATE')
    expect(kept[0].evidence_ids).toEqual(expect.arrayContaining(['ev-energia', 'ev-comfort']))
    expect(kept[0].explanation).toContain('Luce accesa a casa vuota.')
    expect(kept[0].explanation).toContain('comfort')
  })

  it('T33 lo stesso agente con routine distinte (contesti diversi) non viene fuso', () => {
    const plan = [step('s1', 'lighting.set', ['light.demo_ingresso'], 'on')]
    const evening = candidate({ agent_key: 'arrival', kind: 'preference', dedup_key: 'pattern:sera:r1', topic: 'routine:sera', pattern_id: 'pat-sera', steps: plan, learned: true })
    const afternoon = candidate({ agent_key: 'arrival', kind: 'preference', dedup_key: 'pattern:pomeriggio:r1', topic: 'routine:pomeriggio', pattern_id: 'pat-pomeriggio', steps: plan, learned: true })
    const { kept } = arbitrate([evening, afternoon])
    expect(kept.map((c) => c.topic).sort()).toEqual(['routine:pomeriggio', 'routine:sera'])
  })
})

describe('T34 — proposte opposte sulla stessa risorsa', () => {
  it('T34 accendi/spegni sulla stessa luce → ne resta una sola e il conflitto è esplicitato', () => {
    const on = candidate({ agent_key: 'arrival', dedup_key: 'k:on', steps: [step('s1', 'lighting.set', ['light.demo_soggiorno'], 'on')], support: 0.8 })
    const off = candidate({ agent_key: 'energy', dedup_key: 'k:off', steps: [step('s1', 'lighting.set', ['light.demo_soggiorno'], 'off')], support: 0.4 })

    for (const input of [[on, off], [off, on]]) {
      const { kept, dropped } = arbitrate(input)
      expect(kept).toHaveLength(1)
      expect(kept[0].dedup_key).toBe('k:on')
      expect(kept[0].explanation).toMatch(/opposto sulla stessa risorsa/)
      expect(dropped).toEqual([{ candidate: expect.objectContaining({ dedup_key: 'k:off' }), reason: 'CONFLICT_LOWER_SUPPORT' }])
    }
  })

  it('T34 apri/chiudi e play/pausa: mai entrambe tenute; a parità di supporto l’esito è deterministico', () => {
    const open = candidate({ dedup_key: 'cover:open', steps: [step('s1', 'cover.set', ['cover.demo_tapparella'], 'open')], support: 0.5, utility: 0.5 })
    const close = candidate({ dedup_key: 'cover:close', steps: [step('s1', 'cover.set', ['cover.demo_tapparella'], 'close')], support: 0.5, utility: 0.5 })
    const first = arbitrate([open, close])
    const second = arbitrate([close, open])
    expect(first.kept).toHaveLength(1)
    expect(second.kept.map((c) => c.dedup_key)).toEqual(first.kept.map((c) => c.dedup_key))
    expect(first.dropped[0].reason).toBe('CONFLICT_LOWER_SUPPORT')

    const play = candidate({ dedup_key: 'tv:play', steps: [step('s1', 'media.set', ['media_player.demo_tv'], 'play')], support: 0.9 })
    const pause = candidate({ dedup_key: 'tv:pause', steps: [step('s1', 'media.set', ['media_player.demo_tv'], 'pause')], support: 0.3 })
    const media = arbitrate([pause, play])
    expect(media.kept.map((c) => c.dedup_key)).toEqual(['tv:play'])

    // Stessa azione su risorse diverse: nessun conflitto.
    const other = candidate({ dedup_key: 'k:altro', steps: [step('s1', 'lighting.set', ['light.demo_portico'], 'off')] })
    const onIngresso = candidate({ dedup_key: 'k:ing', steps: [step('s1', 'lighting.set', ['light.demo_ingresso'], 'on')] })
    expect(arbitrate([other, onIngresso]).kept).toHaveLength(2)
  })
})

describe('T35 — preferenza esplicita contro pattern inferito', () => {
  it('T35 l’arbitro scarta il candidato appreso che contraddice una preferenza salvata', () => {
    const learned = candidate({ agent_key: 'arrival', kind: 'preference', learned: true, dedup_key: 'pattern:x:r1', steps: [step('s1', 'lighting.set', ['light.demo_ingresso'], 'off')], support: 1 })
    const { kept, dropped } = arbitrate([learned], new Map([['light.demo_ingresso', 'on']]))
    expect(kept).toHaveLength(0)
    expect(dropped[0].reason).toBe('EXPLICIT_PREFERENCE_PREVAILS')
  })

  it('T35 “non suggerire più” prevale anche su un’abitudine con supporto massimo', async () => {
    const { core, clock } = await newCore('2026-10-12T17:00:00Z')
    const config = suggestConfig()
    const context = core.contexts.build(config)
    const strong = candidate({ agent_key: 'arrival', kind: 'preference', topic: 'routine:pat-forte', pattern_id: 'pat-forte', learned: true, support: 1, utility: 1, uncertainty: 0 })
    const preference = core.proposals.savePreference({
      kind: 'never_suggest', topic: 'routine:pat-forte', scope: HOUSEHOLD, pattern_id: 'pat-forte', plan_hash: null,
      description: 'Non suggerire più la routine', created_by: 'device-admin',
    })
    const decision = decide(strong, context, policyState(config, clock.now(), { preferences: [preference] }))
    expect(decision.outcome).toBe('reject')
    expect(decision.reason_codes).toEqual(['NEVER_SUGGEST'])

    // Revocata la preferenza, la stessa abitudine torna proponibile.
    const revoked = core.proposals.revokePreference(preference.preference_id, preference.revision)
    expect(decide(strong, context, policyState(config, clock.now(), { preferences: [revoked] })).outcome).toBe('allow_local')
  })

  it('T35 nel ciclo reale: una routine salvata blocca il pattern appreso opposto sulla stessa luce', async () => {
    const { core } = await seededDemo()
    const pattern = supportedPattern(core)
    const proposal = arrivalProposal(core)
    expect(pattern.steps[0]).toMatchObject({ target_entity_ids: ['light.demo_ingresso'], desired: { action: 'on' } })

    // L'utente salva esplicitamente la routine (preferenza: luce ingresso accesa al rientro);
    // come fa l'API, il miner viene rieseguito e il pattern diventa `accepted`.
    core.proposals.approve(proposal.proposal_id, { purpose: 'save_preference', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }, 'device-admin', proposal.scope)
    core.refreshPatterns()
    expect(core.patterns.get(pattern.pattern_id)?.state).toBe('accepted')

    // Ipotesi inferita da altre evidenze: al rientro la stessa luce viene spenta.
    const opposite: StoredPattern = {
      ...pattern,
      pattern_id: 'pat-test-opposto',
      revision: 1,
      context_rule_id: 'arrival.household.evening',
      steps: [{ ...pattern.steps[0], desired: { action: 'off', after_arrival_s: 60 } }],
      tokens: ['lighting.off|light.demo_ingresso'],
      labels: ['lighting.off|light.demo_ingresso'],
    }
    core.store.run('INSERT INTO patterns (pattern_id, revision, state, subject_id, demo, body, updated_at) VALUES (?, ?, ?, NULL, 1, ?, ?)',
      opposite.pattern_id, opposite.revision, 'supported', JSON.stringify(opposite), core.clock.now().toISOString())

    core.evaluate({ kind: 'review' })

    const open = core.proposals.list({ includePersonal: true, limit: 100 })
      .filter((p) => p.pattern_id === 'pat-test-opposto' && ['candidate', 'policy_checked', 'visible', 'snoozed'].includes(p.state))
    expect(open).toEqual([])
    const drops = core.audit.list(200).filter((entry) => entry.action === 'arbiter.drop')
    expect(drops.map((entry) => entry.outcome)).toContain('EXPLICIT_PREFERENCE_PREVAILS')
    // La preferenza resta salvata e la proposta originaria non viene riaperta.
    expect(core.proposals.preferences().filter((p) => p.kind === 'routine')).toHaveLength(1)
    expect(core.proposals.get(proposal.proposal_id)?.state).toBe('preference_saved')
  })

  it('T35 dopo “non suggerire più” il riapprendimento non ripropone la stessa abitudine', async () => {
    const { core } = await seededDemo()
    const proposal = arrivalProposal(core)
    core.proposals.feedback(proposal.proposal_id, 'never_suggest', 'device-admin', proposal.scope, null)
    core.refreshPatterns()
    const pattern = core.patterns.get(proposal.pattern_id!)
    expect(pattern?.state).toBe('suppressed')
    expect(pattern?.counts.successes).toBeGreaterThanOrEqual(7)

    core.evaluate({ kind: 'review' })
    const open = core.proposals.list({ states: ['candidate', 'policy_checked', 'visible', 'snoozed'], includePersonal: true, limit: 100 })
    expect(open.filter((p) => p.pattern_id === proposal.pattern_id)).toEqual([])
  })
})

describe('T36 — quiet hours e budget di attenzione', () => {
  it('T36 nelle quiet hours una proposta non urgente è rinviata con motivo; una urgente no', async () => {
    // 23:15 a Roma (CEST): dentro la fascia 22:30–07:30.
    const { core, clock } = await newCore('2026-10-12T21:15:00Z')
    const config = suggestConfig()
    const context = core.contexts.build(config)
    const normal = decide(candidate({ urgency: 'normal' }), context, policyState(config, clock.now()))
    expect(normal.outcome).toBe('defer')
    expect(normal.reason_codes).toContain('QUIET_HOURS')
    expect(normal.constraints.join(' ')).toContain('22:30–07:30')

    const urgent = decide(candidate({ urgency: 'high' }), context, policyState(config, clock.now()))
    expect(urgent.outcome).toBe('allow_local')
    expect(urgent.reason_codes).not.toContain('QUIET_HOURS')

    // Fuori fascia la stessa proposta passa.
    clock.set('2026-10-13T06:00:00Z') // 08:00 locali
    expect(decide(candidate({ urgency: 'normal' }), core.contexts.build(config), policyState(config, clock.now())).outcome).toBe('allow_local')
  })

  it('T36 budget giornaliero esaurito o tema in cooldown → rinvio con motivo; i promemoria hanno un budget separato', async () => {
    const { core, clock } = await newCore('2026-10-12T15:00:00Z')
    const config = suggestConfig()
    const context = core.contexts.build(config)
    const exhausted = decide(candidate(), context, policyState(config, clock.now(), { proactiveToday: config.attention.proactive_daily_budget }))
    expect(exhausted.outcome).toBe('defer')
    expect(exhausted.reason_codes).toEqual(['ATTENTION_BUDGET_EXHAUSTED'])

    const reminder = decide(candidate({ kind: 'reminder', agent_key: 'waste' }), context, policyState(config, clock.now(), { proactiveToday: 99 }))
    expect(reminder.outcome).toBe('allow_local')
    expect(reminder.reason_codes).toContain('REMINDER_ALLOWED')

    const oneHourAgo = new Date(clock.now().getTime() - 3_600_000).toISOString()
    const cooling = decide(candidate(), context, policyState(config, clock.now(), { lastShownForTopic: () => oneHourAgo }))
    expect(cooling.outcome).toBe('defer')
    expect(cooling.reason_codes).toEqual(['TOPIC_COOLDOWN'])
  })

  it('T36 nel ciclo reale: con budget 1 solo una proposta proattiva diventa visibile, le altre restano in coda con motivo', async () => {
    const { core } = await seededDemo((config) => {
      config.runtime.mode = 'suggest'
      config.attention.proactive_daily_budget = 1
    })
    const all = core.proposals.list({ includePersonal: true, limit: 50 })
    const proactive = all.filter((p) => p.kind !== 'reminder')
    expect(proactive.length).toBeGreaterThanOrEqual(2)
    expect(proactive.filter((p) => p.state === 'visible')).toHaveLength(1)
    const deferred = proactive.filter((p) => p.state === 'candidate')
    expect(deferred.length).toBeGreaterThanOrEqual(1)
    for (const proposal of deferred) {
      expect(proposal.policy_result).toBe('defer')
      expect(proposal.reason_codes).toContain('ATTENTION_BUDGET_EXHAUSTED')
    }
    // L'inbox (visibili/rimandati) non mostra ciò che è in coda.
    const inbox = core.proposals.list({ states: ['visible', 'snoozed'], includePersonal: false, limit: 20 })
    expect(inbox.some((p) => deferred.some((d) => d.proposal_id === p.proposal_id))).toBe(false)
    // Il promemoria domestico ha un budget distinto.
    expect(all.find((p) => p.kind === 'reminder')?.state).toBe('visible')
  })

  it('T36 nel ciclo reale: la routine resta in coda nelle quiet hours e viene rivalutata alla fine della fascia', async () => {
    const { core, clock } = await seededDemo((config) => { config.runtime.mode = 'suggest' })
    expect(arrivalProposal(core).state).toBe('visible')

    clock.set('2026-10-12T21:15:00Z') // 23:15 locali
    core.evaluate({ kind: 'review' })
    const night = arrivalProposal(core)
    expect(night.state).toBe('candidate')
    expect(night.policy_result).toBe('defer')
    expect(night.reason_codes).toContain('QUIET_HOURS')

    clock.set('2026-10-13T06:00:00Z') // 08:00 locali del giorno dopo
    core.evaluate({ kind: 'review' })
    const morning = arrivalProposal(core)
    expect(morning.state).toBe('visible')
    expect(morning.policy_result).toBe('allow_local')
  })
})

describe('T38 — approvazioni legate a revisione e piano', () => {
  it('T38 se il piano cambia, la revisione sale e l’approvazione di simulazione precedente non vale più', async () => {
    const { core } = await seededDemo()
    const before = arrivalProposal(core)
    const { approval } = core.proposals.approve(before.proposal_id, { purpose: 'simulate_once', expected_revision: before.revision, plan_hash: before.plan_hash }, 'device-admin', before.scope)
    expect(approval.plan_hash).toBe(before.plan_hash)

    // Rimining: cambia l'intervallo osservato di un passo (stessa revisione del pattern → stessa proposta).
    const pattern = core.patterns.get(before.pattern_id!)!
    const changed = { ...pattern, steps: pattern.steps.map((s, i) => (i === 0 ? { ...s, desired: { ...s.desired, after_arrival_s: 999 } } : s)) }
    core.store.run('UPDATE patterns SET body = ? WHERE pattern_id = ?', JSON.stringify(changed), pattern.pattern_id)
    core.evaluate({ kind: 'review' })

    const after = core.proposals.get(before.proposal_id)!
    expect(after.revision).toBe(before.revision + 1)
    expect(after.plan_hash).not.toBe(before.plan_hash)
    expect(core.proposals.validSimulationApproval(after)).toBeNull()
    await expect(core.simulate(after.proposal_id, 'device-admin', 7, false)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(countRows(core, 'simulation_reports')).toBe(0)

    // Una nuova approvazione con la revisione VECCHIA è respinta lato server.
    expect(() => core.proposals.approve(after.proposal_id, { purpose: 'simulate_once', expected_revision: before.revision, plan_hash: before.plan_hash }, 'device-admin', after.scope))
      .toThrowError(expect.objectContaining({ code: 'REVISION_CONFLICT' }))
    // Con la revisione corrente sì.
    core.proposals.approve(after.proposal_id, { purpose: 'simulate_once', expected_revision: after.revision, plan_hash: after.plan_hash }, 'device-admin', after.scope)
    const report = await core.simulate(after.proposal_id, 'device-admin', 7, false)
    expect(report.proposal_revision).toBe(after.revision)
    expect(report.plan_hash).toBe(after.plan_hash)
  })

  it('T38 un’approvazione scaduta, già consumata o con hash forgiato non autorizza la simulazione', async () => {
    const { core, clock } = await seededDemo()
    const proposal = arrivalProposal(core)
    const forged = 'f'.repeat(64)
    expect(() => core.proposals.approve(proposal.proposal_id, { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: forged }, 'device-admin', proposal.scope))
      .toThrowError(CoreError)
    expect(() => core.proposals.approve(proposal.proposal_id, { purpose: 'simulate_once', expected_revision: proposal.revision + 5, plan_hash: proposal.plan_hash }, 'device-admin', proposal.scope))
      .toThrowError(expect.objectContaining({ code: 'REVISION_CONFLICT' }))

    core.proposals.approve(proposal.proposal_id, { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }, 'device-admin', proposal.scope)
    clock.advance(61 * 60_000) // l'approvazione di simulazione vale un'ora
    expect(core.proposals.validSimulationApproval(core.proposals.get(proposal.proposal_id)!)).toBeNull()
    await expect(core.simulate(proposal.proposal_id, 'device-admin', 1, false)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })

    // Nuova approvazione: vale UNA simulazione, poi è consumata.
    core.proposals.approve(proposal.proposal_id, { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }, 'device-admin', proposal.scope)
    await core.simulate(proposal.proposal_id, 'device-admin', 1, false)
    await expect(core.simulate(proposal.proposal_id, 'device-admin', 1, false)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect(countRows(core, 'simulation_reports')).toBe(1)

    // Difesa in profondità: anche il simulatore blocca un piano che non corrisponde.
    const blocked = core.simulator.run({ proposal_id: proposal.proposal_id, proposal_revision: proposal.revision, context_snapshot_id: proposal.context_snapshot_id, plan_hash: forged, seed: 1 })
    expect(blocked.status).toBe('blocked')
    expect(blocked.reason_codes).toEqual(['PLAN_MISMATCH'])
    expect(blocked.physical_effects).toBe(false)
  })
})

describe('T39 — simulazione con guasto intermedio', () => {
  it('T39 guasto al secondo passo: report coerente, terzo passo non raggiunto, stato reale immutato', async () => {
    const { core } = await seededDemo()
    const proposal = arrivalProposal(core)
    expect(proposal.steps).toHaveLength(3)
    const seed = seedFailingAt(1, proposal.steps.length)

    const realBefore = core.projection.all()
    const eventsBefore = countRows(core, 'observed_events')
    const episodesBefore = JSON.stringify(core.arrivals.list({ limit: 200 }))
    const patternsBefore = JSON.stringify(core.patterns.list({ includeRetired: true }).map((p) => [p.pattern_id, p.revision, p.counts]))

    core.proposals.approve(proposal.proposal_id, { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }, 'device-admin', proposal.scope)
    const report = await core.simulate(proposal.proposal_id, 'device-admin', seed, true)

    expect(report.status).toBe('failed')
    expect(report.physical_effects).toBe(false)
    expect(report.external_notifications).toBe(false)
    expect(report.reason_codes).toEqual(['SIMULATED_FAILURE'])
    const outcomes = report.steps.map((s) => s.outcome)
    expect(outcomes).toHaveLength(3)
    expect(['would_apply', 'already_satisfied', 'redundant_automation', 'precondition_missing', 'conflict']).toContain(outcomes[0])
    expect(outcomes[1]).toBe('simulated_failure')
    expect(outcomes[2]).toBe('not_reached')
    expect(report.steps[1].note).toMatch(/rollback fisico non è garantito/)
    expect(report.steps[2].diff).toEqual({})
    expect(core.proposals.get(proposal.proposal_id)?.state).toBe('simulation_failed')

    // Stato reale e memoria non toccati: nessuna evidenza nuova, nessun conteggio gonfiato.
    expect(core.projection.all()).toEqual(realBefore)
    expect(countRows(core, 'observed_events')).toBe(eventsBefore)
    expect(JSON.stringify(core.arrivals.list({ limit: 200 }))).toBe(episodesBefore)
    core.refreshPatterns()
    expect(JSON.stringify(core.patterns.list({ includeRetired: true }).map((p) => [p.pattern_id, p.revision, p.counts]))).toBe(patternsBefore)
    expect(countRows(core, 'simulation_reports')).toBe(1)

    // Replay riproducibile: stesso seed → stesso esito.
    core.proposals.approve(proposal.proposal_id, { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }, 'device-admin', proposal.scope)
    const replay = await core.simulate(proposal.proposal_id, 'device-admin', seed, true)
    expect(replay.steps.map((s) => s.outcome)).toEqual(outcomes)
  })

  it('T39 una simulazione riuscita mostra differenze ipotetiche senza modificare la proiezione live', async () => {
    const { core } = await seededDemo()
    const proposal = arrivalProposal(core)
    // Lo snapshot della proposta ha la luce del soggiorno spenta? Se sì, il diff deve mostrarla accesa solo nel simulato.
    const realBefore = core.projection.all()
    core.proposals.approve(proposal.proposal_id, { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }, 'device-admin', proposal.scope)
    const report = await core.simulate(proposal.proposal_id, 'device-admin', 3, false)
    expect(report.status).toBe('simulated')
    expect(report.reason_codes).toEqual(['DRY_RUN_ONLY'])
    expect(report.steps.every((s) => s.outcome !== 'simulated_failure' && s.outcome !== 'not_reached')).toBe(true)
    expect(core.projection.all()).toEqual(realBefore)
    expect(core.proposals.get(proposal.proposal_id)?.state).toBe('simulated')
  })
})
