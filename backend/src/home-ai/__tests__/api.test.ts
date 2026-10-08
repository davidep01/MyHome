import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHomeAiRouter, type RouterDeps } from '../api/routes.js'
import type { HomeAiCore } from '../core.js'
import type { PolicyDecision } from '../domain/contracts.js'
import { makeEvent, quality } from '../ingestion/normalize.js'
import type { Candidate } from '../agents/types.js'
import type { StoredProposal } from '../suggestions/service.js'
import { DEMO_UNTIL, newCore, seededDemo } from './helpers.js'

/**
 * API locale `/api/home-ai/v1` (specifica §21): barriera di esecuzione (T40),
 * approvazioni (T37, T38), reasoner (T42), scope del tablet (T44), segreti
 * (T45) e degrado (T48). Il router è montato con ruoli finti dal header
 * `X-Test-Role`; un test usa anche l'app reale di MyHome (auth disattivata).
 */

const JWT = 'eyJhbGciOiJIUzI1NiJ9.YXBpLXRlc3Qtc2VncmV0by1kaS1wcm92YQ.ZmlybWEtYXBpLXRlc3QtOTk5'
const SUBJECT = 'subj-abc123def456'

type Json = Record<string, any>

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function blockNetwork() {
  const fetchSpy = vi.fn(async () => { throw new Error('rete bloccata nei test') })
  const wsSpy = vi.fn(function blockedWebSocket() { throw new Error('WebSocket bloccato nei test') })
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('WebSocket', wsSpy)
  return { fetchSpy, wsSpy }
}

function routerFor(core: HomeAiCore | null, extra: Partial<RouterDeps> = {}) {
  return createHomeAiRouter({
    core: () => core,
    disabledReason: () => (core ? null : 'Core disattivato nel test.'),
    role: (c) => {
      const role = c.req.header('X-Test-Role')
      return role === 'admin' || role === 'kiosk' ? role : null
    },
    authMode: () => 'disabled',
    haReachable: () => null,
    backups: {
      list: () => [],
      create: async () => ({ id: 'bk-test', created_at: DEMO_UNTIL.toISOString() }),
      restore: async () => ({ restored_from: 'bk-test', tombstones_reapplied: 0 }),
      lastRestoreVerifiedAt: () => null,
    },
    candidateEntities: () => [],
    dashboardEntities: () => [],
    onConfigChanged: () => undefined,
    ...extra,
  })
}

let keySeq = 0
function call(router: ReturnType<typeof routerFor>, method: string, path: string, opts: { role?: 'admin' | 'kiosk'; body?: unknown; key?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opts.headers }
  if (opts.role) headers['X-Test-Role'] = opts.role
  if (method !== 'GET') headers['Idempotency-Key'] = opts.key ?? `test-key-${(keySeq += 1).toString().padStart(6, '0')}`
  return router.request(path, { method, headers, body: opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body) })
}

async function json(response: Response): Promise<Json> {
  return await response.json() as Json
}

function arrival(core: HomeAiCore): StoredProposal {
  const proposal = core.proposals.list({ includePersonal: true, limit: 50 }).find((p) => p.agent_key === 'arrival')
  if (!proposal) throw new Error('proposta di rientro attesa')
  return proposal
}

// ── T40 ─────────────────────────────────────────────────────────────────────

describe('T40 — barriera esplicita nell’API', () => {
  const FORCED = [
    '/execute', '/execute/light.demo_ingresso', '/call-service', '/call-service/light/turn_on',
    '/publish-mqtt', '/publish-mqtt/casa/cmd', '/ha/services/lock/unlock', '/services/light/turn_on',
    '/proxy/http%3A%2F%2Fha.local%2Fapi%2Fservices', '/fire-event', '/fire-event/home_ai_trigger', '/fire_event', '/call_service',
  ]

  it('T40 esecuzione, servizi, eventi e MQTT: 403 PHYSICAL_EXECUTION_DISABLED prima di qualunque I/O, per ogni ruolo e metodo', async () => {
    const { fetchSpy, wsSpy } = blockNetwork()
    const { core } = await seededDemo()
    const router = routerFor(core)
    const auditBefore = core.audit.list(500).length
    const stateBefore = core.projection.all()
    const hostile = { domain: 'lock', service: 'unlock', entity_id: 'lock.porta', service_data: { code: JWT }, topic: 'casa/cmd', payload: 'ON' }
    let attempts = 0
    for (const path of FORCED) {
      for (const method of ['POST', 'GET', 'PUT']) {
        for (const role of ['admin', 'kiosk', undefined] as const) {
          const response = await call(router, method, path, { role, body: method === 'GET' ? undefined : hostile })
          attempts += 1
          expect(response.status, `${method} ${path}`).toBe(403)
          const body = await json(response)
          expect(body.code).toBe('PHYSICAL_EXECUTION_DISABLED')
          expect(body.error).toBe('Questa versione non controlla i dispositivi.')
          expect(body.request_id).toMatch(/^req-/)
          expect(JSON.stringify(body)).not.toContain(JWT)
        }
      }
    }
    const blocked = core.audit.list(500).slice(0, core.audit.list(500).length - auditBefore).filter((entry) => entry.outcome === 'blocked')
    expect(blocked).toHaveLength(attempts)
    for (const entry of blocked) {
      expect(entry.reason_codes).toEqual(['PHYSICAL_EXECUTION_DISABLED'])
      expect(entry.detail).not.toMatch(/lock\.porta|casa\/cmd|ON|service_data/)
      expect(entry.detail).not.toContain(JWT)
    }
    expect(core.projection.all()).toEqual(stateBefore)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(wsSpy).not.toHaveBeenCalled()

    // La barriera vale anche con il core spento o non disponibile.
    const disabled = routerFor(null)
    const response = await call(disabled, 'POST', '/execute', { role: 'admin', body: hostile })
    expect(response.status).toBe(403)
    expect((await json(response)).code).toBe('PHYSICAL_EXECUTION_DISABLED')
  })

  it('T40 payload anomali sugli endpoint esistenti: rifiutati senza effetti né I/O', async () => {
    const { fetchSpy } = blockNetwork()
    const { core } = await seededDemo()
    const router = routerFor(core)
    const proposal = arrival(core)
    const approve = { purpose: 'save_preference', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }
    const configRevision = core.configRevision()

    const attempts: [string, string, unknown][] = [
      ['POST', `/suggestions/${proposal.proposal_id}/approve`, { ...approve, purpose: 'execute' }],
      ['POST', `/suggestions/${proposal.proposal_id}/approve`, { ...approve, execute: true }],
      ['POST', `/suggestions/${proposal.proposal_id}/approve`, `{"purpose":"save_preference","expected_revision":${proposal.revision},"plan_hash":"${proposal.plan_hash}","constructor":{"service":"lock.unlock"}}`],
      ['POST', `/suggestions/${proposal.proposal_id}/approve`, `{"purpose":"save_preference","expected_revision":${proposal.revision},"plan_hash":"${proposal.plan_hash}","__proto__":{"physical_execution":"enabled"}}`],
      ['POST', `/suggestions/${proposal.proposal_id}/simulate`, { seed: 1, physical_effects: true }],
      ['POST', `/suggestions/${proposal.proposal_id}/simulate`, { seed: 1, call_service: 'light.turn_on' }],
      ['POST', `/suggestions/${proposal.proposal_id}/feedback`, { kind: 'execute' }],
      ['POST', `/suggestions/${proposal.proposal_id}/approve`, 'non è JSON'],
      ['PUT', '/config', { expected_revision: configRevision, config: { ...core.config(), runtime: { ...core.config().runtime, physical_execution: 'enabled' } } }],
      ['PUT', '/config', { expected_revision: configRevision, config: { ...core.config(), runtime: { ...core.config().runtime, mode: 'autonomous' } } }],
      ['PUT', '/policy-rules', { rules: [{ rule_id: 'r1', description: 'x', when: { eq: { fact: 'context.mode', value: 'suggest' } }, outcome: 'execute', reason_code: 'X' }] }],
      ['PUT', '/policy-rules', { rules: [{ rule_id: 'r1', description: 'x', when: { js: 'require("child_process")' }, outcome: 'defer', reason_code: 'X' }] }],
    ]
    for (const [method, path, body] of attempts) {
      const response = await call(router, method, path, { role: 'admin', body })
      expect(response.status, `${method} ${path} ${JSON.stringify(body).slice(0, 80)}`).toBe(400)
      expect((await json(response)).code).toBe('VALIDATION_ERROR')
    }
    expect(core.proposals.get(proposal.proposal_id)?.state).toBe(proposal.state)
    expect(core.proposals.preferences()).toEqual([])
    expect(core.configRevision()).toBe(configRevision)
    expect(core.config().runtime.physical_execution).toBe('disabled')
    expect(core.userRules()).toEqual([])
    expect(({} as Json).physical_execution).toBeUndefined()

    // Telemetria verso un servizio non mappato: mai un comando, al massimo dato scartato.
    const telemetry = await call(router, 'POST', '/telemetry/manual-intents', {
      role: 'kiosk',
      body: { operation_id: 'op-x1', interaction_id: 'click-x1', control: 'button', domain: 'lock', service: 'unlock', target_entity_ids: ['lock.porta'], requested: {} },
    })
    expect(telemetry.status).toBe(202)
    expect((await json(telemetry)).status).not.toBe('stored')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('T40 l’app reale di MyHome monta la barriera prima di qualunque handler del core', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'home-ai-api-app-'))
    const saved = { ...process.env }
    try {
      process.env.NODE_ENV = 'test'
      process.env.MYHOME_DB_PATH = join(dir, 'db.json')
      process.env.HOME_AI_DB_PATH = join(dir, 'home-ai.sqlite')
      delete process.env.MYHOME_AUTH_MODE
      const { app } = await import('../../app.js')
      for (const client of ['desktop', 'tablet']) {
        for (const path of ['/api/home-ai/v1/execute', '/api/home-ai/v1/call-service', '/api/home-ai/v1/publish-mqtt', '/api/home-ai/v1/fire-event']) {
          const response = await app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MyHome-Client': client }, body: JSON.stringify({ entity_id: 'light.x' }) })
          expect(response.status, `${client} ${path}`).toBe(403)
          expect((await json(response)).code).toBe('PHYSICAL_EXECUTION_DISABLED')
        }
      }
    } finally {
      process.env = saved
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── T37 / T38 ───────────────────────────────────────────────────────────────

describe('T37/T38 — approvazioni dall’API', () => {
  it('T37 approvare e simulare dall’API: solo preferenza locale e dry-run, risposte idempotenti, zero comandi', async () => {
    const { fetchSpy, wsSpy } = blockNetwork()
    const { core } = await seededDemo()
    const router = routerFor(core)
    const proposal = arrival(core)
    const stateBefore = core.projection.all()

    const simulateApproval = { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }
    const authorized = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/approve`, { role: 'admin', body: simulateApproval })
    expect(authorized.status).toBe(200)
    expect((await json(authorized)).notice).toBe('Simulazione autorizzata una volta, senza effetti fisici.')
    const simulated = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/simulate`, { role: 'admin', body: { seed: 4 } })
    expect(simulated.status).toBe(200)
    expect(await json(simulated)).toMatchObject({ physical_effects: false, external_notifications: false, status: 'simulated' })

    const save = { purpose: 'save_preference', expected_revision: proposal.revision, plan_hash: proposal.plan_hash }
    const first = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/approve`, { role: 'admin', body: save, key: 'approva-preferenza-01' })
    const firstBody = await json(first)
    expect(first.status).toBe(200)
    expect(firstBody.notice).toBe('Preferenza salvata: nessun dispositivo è stato comandato.')
    expect(firstBody.proposal.state).toBe('preference_saved')
    // Stessa chiave → stessa risposta; chiave diversa sulla stessa revisione → nessuna seconda preferenza.
    const replay = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/approve`, { role: 'admin', body: save, key: 'approva-preferenza-01' })
    expect(await json(replay)).toEqual(firstBody)
    const again = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/approve`, { role: 'admin', body: save, key: 'approva-preferenza-02' })
    expect(again.status).toBe(200)
    expect(core.proposals.preferences().filter((p) => p.kind === 'routine')).toHaveLength(1)

    expect(core.projection.all()).toEqual(stateBefore)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(wsSpy).not.toHaveBeenCalled()
    const audit = core.audit.list(100).filter((entry) => entry.action.startsWith('approval.'))
    expect(audit.length).toBeGreaterThanOrEqual(2)
    expect(audit.every((entry) => entry.reason_codes.includes('NO_PHYSICAL_EFFECT'))).toBe(true)
  })

  it('T38 revisione o hash non correnti, simulazione senza approvazione e approvazione dal tablet sono respinti', async () => {
    const { core, clock } = await seededDemo()
    const router = routerFor(core)
    const proposal = arrival(core)
    const stale = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/approve`, { role: 'admin', body: { purpose: 'simulate_once', expected_revision: proposal.revision + 1, plan_hash: proposal.plan_hash } })
    expect(stale.status).toBe(409)
    expect((await json(stale)).code).toBe('REVISION_CONFLICT')
    const forged = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/approve`, { role: 'admin', body: { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: 'a'.repeat(64) } })
    expect(forged.status).toBe(409)
    const unapproved = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/simulate`, { role: 'admin', body: {} })
    expect(unapproved.status).toBe(409)
    expect((await json(unapproved)).code).toBe('REVISION_CONFLICT')
    const fromKiosk = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/approve`, { role: 'kiosk', body: { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: proposal.plan_hash } })
    expect(fromKiosk.status).toBe(403)

    // Approvazione valida, poi scaduta: la simulazione è rifiutata.
    await call(router, 'POST', `/suggestions/${proposal.proposal_id}/approve`, { role: 'admin', body: { purpose: 'simulate_once', expected_revision: proposal.revision, plan_hash: proposal.plan_hash } })
    clock.advance(2 * 3_600_000)
    const expired = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/simulate`, { role: 'admin', body: {} })
    expect(expired.status).toBe(409)
    expect(core.simulations()).toEqual([])
  })
})

// ── T42 ─────────────────────────────────────────────────────────────────────

describe('T42 — stato trasparente del reasoner', () => {
  it('T42 health, status e /reasoner dichiarano "non configurato" mentre l’inbox è popolata dagli agenti deterministici', async () => {
    const { core } = await seededDemo()
    const router = routerFor(core)
    const health = await json(await call(router, 'GET', '/health'))
    expect(health).toMatchObject({ status: 'ok', reasoner: 'not_configured', physical_execution: 'disabled' })
    const reasoner = await call(router, 'GET', '/reasoner', { role: 'kiosk' })
    expect(reasoner.status).toBe(200)
    expect(await json(reasoner)).toEqual({ capabilities: { available: false, structured_output: false, local_only: true }, code: 'REASONER_NOT_CONFIGURED' })
    const status = await json(await call(router, 'GET', '/status', { role: 'admin' }))
    expect(status.reasoner).toEqual({ available: false, structured_output: false, local_only: true })
    expect(status.health.reasoner).toBe('not_configured')
    expect(status.health.service).toBe('running')
    const inbox = await json(await call(router, 'GET', '/suggestions?all=1', { role: 'admin' }))
    expect(new Set((inbox.suggestions as StoredProposal[]).map((p) => p.agent_key))).toEqual(new Set(['arrival', 'waste', 'weather']))
    expect(inbox.notice).toBe('Questa versione non controlla i dispositivi.')
  })
})

// ── T44 ─────────────────────────────────────────────────────────────────────

/** Casa reale con profili personali: un rientro attribuito a un soggetto pseudonimo. */
async function personalHome() {
  const env = await newCore('2026-10-12T14:00:00Z', (config) => {
    config.runtime.demo = false
    config.sources.fixtures.enabled = false
    config.sources.home_assistant.enabled = true
    config.sources.home_assistant.selected_entities = ['light.demo_ingresso']
    config.sources.home_assistant.presence_entities = ['person.demo_abitante_1']
    config.sources.weather.adapter = 'none'
    config.privacy.real_observation_enabled = true
    config.privacy.personal_profiles_enabled = true
  })
  const { core, clock } = env
  const presence = (status: 'home' | 'away', n: number) => makeEvent({
    kind: 'presence.signal', source: { id: 'ha', kind: 'ha', native_id: `presence-t44-${n}` },
    occurred_at: clock.now().toISOString(), received_at: clock.now().toISOString(), delivery: 'live',
    quality: quality('system', 1, ['PRESENCE_ENTITY']),
    scope: { kind: 'person', subject_id: SUBJECT },
    payload: { presence_source_id: 'subj-sorgente-1', status, subject_id: SUBJECT },
  })
  expect(core.ingest(presence('away', 1), { demo: false }).status).toBe('stored')
  core.process()
  clock.advance(60 * 60_000)
  expect(core.ingest(presence('home', 2), { demo: false }).status).toBe('stored')
  core.process()
  clock.advance(61_000)
  await core.tick()
  clock.advance(21 * 60_000)
  await core.tick()
  const episode = core.arrivals.list({ demo: false, limit: 10 }).find((e) => e.subject_id === SUBJECT)
  if (!episode) throw new Error('episodio personale atteso')

  // Abitudine del nucleo la cui evidenza include il rientro personale (il miner usa gli episodi del nucleo).
  const now = clock.now().toISOString()
  core.store.run('INSERT INTO patterns (pattern_id, revision, state, subject_id, demo, body, updated_at) VALUES (?, 1, ?, NULL, 0, ?, ?)',
    'pat-nucleo-t44', 'candidate', JSON.stringify({ pattern_id: 'pat-nucleo-t44', scope: { kind: 'household', subject_id: null }, state: 'candidate', steps: [] }), now)
  core.store.run('INSERT INTO pattern_evidence (pattern_id, episode_id, role) VALUES (?, ?, ?)', 'pat-nucleo-t44', episode.episode_id, 'success')

  // Una proposta personale (scope persona).
  const candidate: Candidate = {
    agent_key: 'arrival', kind: 'preference', topic: 'routine:personale', title: 'Routine personale', explanation: 'Abitudine personale.',
    evidence_ids: [episode.episode_id], pattern_id: null, occurrence_id: null, risk: 'low', resources: ['light.demo_ingresso'], steps: [],
    scope: { kind: 'person', subject_id: SUBJECT }, urgency: 'low', expires_at: '2026-10-20T00:00:00Z', utility: 1, support: 1,
    uncertainty: 0, attention_cost: 0, dedup_key: 'personale:1', requires: [], learned: false, demo: false,
  }
  const decision: PolicyDecision = {
    decision_id: 'pol-t44', candidate_key: 'personale:1', outcome: 'allow_local', reason_codes: ['SUGGESTION_ALLOWED'], constraints: [],
    missing_data: [], policy_version: 1, evaluated_at: now, context_snapshot_id: core.contexts.build(core.config()).snapshot_id,
  }
  const personalProposal = core.proposals.upsert(candidate, decision)!
  return { ...env, episode, personalProposal }
}

describe('T44 — il tablet condiviso non vede dati personali', () => {
  it('T44 episodi, evidenze, eventi, proposte ed export personali: negati al kiosk su ogni endpoint', async () => {
    const { core, episode, personalProposal } = await personalHome()
    const router = routerFor(core)

    // Controllo positivo: il configuratore con il consenso ai profili li vede.
    const adminEpisodes = await json(await call(router, 'GET', '/episodes', { role: 'admin' }))
    expect((adminEpisodes.episodes as Json[]).some((e) => e.episode_id === episode.episode_id)).toBe(true)

    const kioskEpisodes = await call(router, 'GET', '/episodes', { role: 'kiosk' })
    expect(kioskEpisodes.status).toBe(200)
    const kioskText = JSON.stringify(await json(kioskEpisodes))
    expect(kioskText).not.toContain(episode.episode_id)
    expect(kioskText).not.toContain(SUBJECT)

    const detail = await call(router, 'GET', `/episodes/${episode.episode_id}`, { role: 'kiosk' })
    expect(detail.status).toBe(403)
    expect((await json(detail)).code).toBe('FORBIDDEN_SCOPE')

    const explain = await call(router, 'GET', '/patterns/pat-nucleo-t44/explain', { role: 'kiosk' })
    if (explain.status === 200) {
      const text = JSON.stringify(await json(explain))
      expect(text).not.toContain(SUBJECT)
      expect(text).not.toContain(episode.episode_id)
    } else {
      expect(explain.status).toBe(403)
    }

    const suggestions = JSON.stringify(await json(await call(router, 'GET', '/suggestions?all=1', { role: 'kiosk' })))
    expect(suggestions).not.toContain(personalProposal.proposal_id)
    const feedback = await call(router, 'POST', `/suggestions/${personalProposal.proposal_id}/feedback`, { role: 'kiosk', body: { kind: 'dismiss' } })
    expect(feedback.status).toBe(403)
    expect(core.proposals.get(personalProposal.proposal_id)?.state).toBe('visible')

    for (const [method, path] of [['GET', '/events'], ['GET', '/audit'], ['GET', '/privacy'], ['POST', '/privacy/export'], ['GET', '/simulations'], ['GET', '/config'], ['GET', '/entities/candidates']] as const) {
      const response = await call(router, method, path, { role: 'kiosk', body: method === 'POST' ? {} : undefined })
      expect(response.status, `${method} ${path}`).toBe(403)
      expect((await json(response)).code).toBe('FORBIDDEN_SCOPE')
    }
    // Il contesto per il tablet è ridotto: niente attributi.
    const context = await json(await call(router, 'GET', '/context', { role: 'kiosk' }))
    for (const state of context.states as Json[]) expect(Object.keys(state.value).sort()).toEqual(['availability', 'state'])
    // Senza alcun ruolo: niente.
    expect((await call(router, 'GET', '/episodes/' + episode.episode_id)).status).toBe(403)
  })

  it('T44 senza consenso ai profili nemmeno il configuratore vede gli episodi personali', async () => {
    const { core, episode } = await personalHome()
    const config = core.config()
    core.updateConfig({ ...config, privacy: { ...config.privacy, personal_profiles_enabled: false } }, core.configRevision(), 'device-admin')
    const router = routerFor(core)
    const text = JSON.stringify(await json(await call(router, 'GET', '/episodes', { role: 'admin' })))
    expect(text).not.toContain(SUBJECT)
    expect((await call(router, 'GET', `/episodes/${episode.episode_id}`, { role: 'admin' })).status).toBe(403)
    const exported = JSON.stringify(await json(await call(router, 'POST', '/privacy/export', { role: 'admin', body: {} })))
    expect(exported).not.toContain(SUBJECT)
  })

  it('T44 lo stream SSE annuncia solo "qualcosa è cambiato", senza dati; senza ruolo è negato', async () => {
    const { core, personalProposal } = await personalHome()
    const router = routerFor(core)
    const denied = await router.request('/stream')
    expect(denied.status).toBe(403)

    const controller = new AbortController()
    const response = await router.request('/stream', { headers: { 'X-Test-Role': 'kiosk' }, signal: controller.signal })
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    const { value } = await reader.read()
    const chunk = new TextDecoder().decode(value)
    controller.abort()
    await reader.cancel().catch(() => undefined)
    expect(chunk).toContain('event: changed')
    const data = chunk.split('\n').find((line) => line.startsWith('data:'))!.slice(5).trim()
    expect(JSON.parse(data)).toEqual({ kind: 'suggestions' })
    expect(chunk).not.toContain(SUBJECT)
    expect(chunk).not.toContain(personalProposal.proposal_id)
  })
})

// ── T45 ─────────────────────────────────────────────────────────────────────

describe('T45 — segreti nelle risposte e nei log dell’API', () => {
  it('T45 eccezioni interne, errori di validazione, audit ed export non riportano mai il token', async () => {
    const plain = 'tok_API_SEGRETO_5d1e7c9a'
    vi.stubEnv('HA_TOKEN', plain)
    const logged: unknown[][] = []
    for (const level of ['error', 'warn', 'log', 'info'] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args) })

    // Eccezione interna con il segreto nel messaggio.
    const exploding = routerFor(null, { core: () => { throw new Error(`HA rifiuta Bearer ${plain} ${JWT}`) } })
    const internal = await call(exploding, 'GET', '/suggestions', { role: 'admin' })
    expect(internal.status).toBe(500)
    const internalText = JSON.stringify(await json(internal))
    expect(internalText).toContain('INTERNAL')

    const { core } = await seededDemo()
    const router = routerFor(core)
    const proposal = arrival(core)
    // Segreto come nome di proprietà (finisce nei dettagli di validazione) e come nota del feedback.
    const invalid = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/feedback`, { role: 'admin', body: { kind: 'not_useful', [JWT]: 1, [plain]: 2 } })
    expect(invalid.status).toBe(400)
    const invalidText = JSON.stringify(await json(invalid))
    const noted = await call(router, 'POST', `/suggestions/${proposal.proposal_id}/feedback`, { role: 'admin', body: { kind: 'not_useful', note: `token=${plain} Bearer ${JWT}` } })
    expect(noted.status).toBe(200)
    const blocked = await call(router, 'POST', `/execute/${plain}`, { role: 'admin', body: { token: plain } })
    const blockedText = JSON.stringify(await json(blocked))
    const audit = JSON.stringify(await json(await call(router, 'GET', '/audit?limit=200', { role: 'admin' })))
    const exported = JSON.stringify(await json(await call(router, 'POST', '/privacy/export', { role: 'admin', body: {} })))
    const status = JSON.stringify(await json(await call(router, 'GET', '/status', { role: 'admin' })))

    for (const [label, text] of Object.entries({ internalText, invalidText, blockedText, audit, exported, status, logs: JSON.stringify(logged) })) {
      expect(text, label).not.toContain(plain)
      expect(text, label).not.toContain(JWT)
    }
    expect(exported).toContain('[REDATTO]')
  })
})

// ── T48 ─────────────────────────────────────────────────────────────────────

describe('T48 — archivio non scrivibile visto dall’API e dalla dashboard', () => {
  it('T48 il core dichiara il degrado; la telemetria non blocca; la dashboard e il percorso manuale restano indipendenti', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'home-ai-t48-api-'))
    const saved = { ...process.env }
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.useFakeTimers({ toFake: ['Date'], now: DEMO_UNTIL })
    blockNetwork()
    process.env.NODE_ENV = 'test'
    process.env.MYHOME_DB_PATH = join(dir, 'db.json')
    process.env.HOME_AI_DB_PATH = join(dir, 'home-ai.sqlite')
    delete process.env.MYHOME_AUTH_MODE
    delete process.env.HOME_AI_CORE
    const { app } = await import('../../app.js')
    const mod = await import('../index.js')
    const desktop = { 'Content-Type': 'application/json', 'X-MyHome-Client': 'desktop' }
    try {
      await mod.startHomeAiCore()
      const core = mod.homeAiCoreForTests()!
      await vi.waitFor(() => expect(core.store.getMeta('demo_seeded_until')).not.toBeNull(), { timeout: 20_000, interval: 50 })

      core.store.db.exec('PRAGMA query_only = ON')
      const event = makeEvent({
        kind: 'coverage.gap', source: { id: 'ha', kind: 'ha', native_id: null },
        occurred_at: DEMO_UNTIL.toISOString(), received_at: DEMO_UNTIL.toISOString(), delivery: 'live',
        quality: quality('system', 1, ['HA_DISCONNECTED'], 'partial'),
        payload: { source_id: 'ha', from: DEMO_UNTIL.toISOString(), until: null, reason_code: 'HA_DISCONNECTED' },
      })
      expect(core.ingest(event, { demo: true }).status).toBe('degraded')

      const health = await json(await app.request('/api/home-ai/v1/health', { headers: desktop }))
      expect(health.status).toBe('degraded')
      const status = await app.request('/api/home-ai/v1/status', { headers: desktop })
      expect(status.status).toBe(200)
      const statusBody = await json(status)
      expect(statusBody.health.service).toBe('degraded')
      expect(statusBody.health.storage).toBe('read_only')
      expect((statusBody.health.issues as Json[]).map((i) => i.code)).toContain('STORAGE_DEGRADED')
      const telemetry = await app.request('/api/home-ai/v1/telemetry/manual-intents', {
        method: 'POST', headers: { ...desktop, 'X-MyHome-Client': 'tablet' },
        body: JSON.stringify({ operation_id: 'op-t48', interaction_id: 'click-t48', control: 'button', domain: 'light', service: 'turn_on', target_entity_ids: ['light.demo_ingresso'], requested: {} }),
      })
      expect(telemetry.status).toBe(202)

      // La dashboard non dipende dal core: health e home rispondono come sempre.
      const dashboardHealth = await app.request('/api/health')
      expect(dashboardHealth.status).toBe(200)
      expect((await json(dashboardHealth)).status).toBe('ok')
      expect((await app.request('/api/layout/home', { headers: desktop })).status).toBe(200)
      // L'esito del comando manuale verso il core è fire-and-forget e non lancia.
      expect(() => mod.recordManualResultFromProxy('op-t48', new Response('[]', { status: 200 }))).not.toThrow()
      await new Promise((resolve) => setImmediate(resolve))
      core.store.db.exec('PRAGMA query_only = OFF')
    } finally {
      mod.stopHomeAiCore()
      process.env = saved
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30_000)
})
