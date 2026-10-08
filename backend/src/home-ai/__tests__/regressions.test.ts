import { describe, expect, it } from 'vitest'
import type { Candidate } from '../agents/types.js'
import { makeEvent, quality } from '../ingestion/normalize.js'
import { newCore, seededDemo } from './helpers.js'

describe('regressioni', () => {
  it('una proposta già visibile non va in cooldown o fuori budget a causa di sé stessa', async () => {
    const { core } = await seededDemo((config) => { config.runtime.mode = 'suggest' })
    const visible = () => core.proposals.list({ states: ['visible'], includePersonal: true, limit: 50 }).map((p) => p.proposal_id).sort()
    const before = visible()
    expect(before.length).toBeGreaterThan(0)
    // Senza esclusione di sé stessa la proposta oscillava: visibile → candidata → visibile.
    for (let i = 0; i < 3; i += 1) {
      core.evaluate({ kind: 'review' })
      expect(visible()).toEqual(before)
    }
  }, 60_000)

  it('un’abitudine dimenticata non viene ricostruita dal miner con lo stesso ID', async () => {
    const { core } = await seededDemo()
    const pattern = core.patterns.list({ demo: true }).find((p) => p.state === 'supported')
    expect(pattern).toBeDefined()
    core.privacy.requestDeletion({ entity_ids: [], subject_id: null, pattern_id: pattern!.pattern_id, before: null, all: false }, 'test')
    core.refreshPatterns()
    core.refreshPatterns()
    expect(core.patterns.list({ demo: true, includeRetired: true }).some((p) => p.pattern_id === pattern!.pattern_id)).toBe(false)
    expect(core.proposals.list({ includePersonal: true, limit: 100 }).some((p) => p.pattern_id === pattern!.pattern_id)).toBe(false)
  }, 60_000)

  it('una nuova revisione della stessa abitudine sostituisce la proposta aperta', async () => {
    const { core } = await seededDemo((config) => { config.runtime.mode = 'suggest' })
    const open = core.proposals.list({ states: ['visible'], includePersonal: true, limit: 50 }).find((p) => p.pattern_id)
    expect(open).toBeDefined()
    const candidate: Candidate = {
      agent_key: open!.agent_key, kind: open!.kind, topic: open!.topic, title: open!.title, explanation: open!.explanation,
      evidence_ids: open!.evidence_ids, pattern_id: open!.pattern_id, occurrence_id: null, risk: open!.risk,
      resources: open!.resources, steps: open!.steps, scope: open!.scope, urgency: 'normal', expires_at: open!.expires_at,
      utility: 0.5, support: 0.8, uncertainty: 0.2, attention_cost: 0.2, dedup_key: `pattern:${open!.pattern_id}:r99`,
      requires: [], learned: true, demo: true,
    }
    core.proposals.upsert(candidate, {
      decision_id: 'pol-test', candidate_key: candidate.dedup_key, outcome: 'allow_local', reason_codes: ['SUGGESTION_ALLOWED'],
      constraints: [], missing_data: [], policy_version: 1, evaluated_at: core.clock.now().toISOString(), context_snapshot_id: open!.context_snapshot_id,
    })
    const forPattern = core.proposals.list({ includePersonal: true, limit: 100 }).filter((p) => p.pattern_id === open!.pattern_id)
    expect(forPattern.filter((p) => ['visible', 'snoozed', 'candidate', 'policy_checked'].includes(p.state))).toHaveLength(1)
    expect(core.proposals.get(open!.proposal_id)?.state).toBe('superseded')
  }, 60_000)

  it('salute: con solo il meteo corrente e nessuna previsione dichiara "current_only"', async () => {
    const { core, clock } = await newCore('2026-10-12T10:00:00Z', (config) => {
      config.runtime.demo = false
      config.sources.fixtures.enabled = false
      config.sources.weather.adapter = 'none'
      config.sources.home_assistant.enabled = true
      config.privacy.real_observation_enabled = true
      config.sources.home_assistant.selected_entities = ['weather.casa']
    })
    const extra = { haReachable: true, lastBackupAt: null, lastRestoreVerifiedAt: null }
    expect(core.health(extra).forecast).toBe('unavailable')
    const at = clock.now().toISOString()
    core.ingest(makeEvent({
      kind: 'state.changed', source: { id: 'ha', kind: 'ha', native_id: 'w1' }, occurred_at: at, received_at: at, delivery: 'live',
      quality: quality('system', 1, []),
      payload: { entity_id: 'weather.casa', before: null, after: { state: 'rainy', attributes: {}, source_updated_at: at, availability: 'available' }, effect_of_operation_id: null },
    }), { demo: false })
    core.process()
    expect(core.health(extra).forecast).toBe('current_only')
  })
})
