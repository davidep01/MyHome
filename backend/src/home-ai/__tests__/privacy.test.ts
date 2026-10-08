import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HAReadGateway } from '../adapters/ha-gateway.js'
import { CoreClock, HomeAiCore } from '../core.js'
import type { ObservedEvent } from '../domain/contracts.js'
import { CoreError } from '../domain/errors.js'
import { ManualClock } from '../domain/time.js'
import { buildDemoDataset, DEMO_ENTITIES } from '../fixtures/demo-home.js'
import { makeEvent, quality } from '../ingestion/normalize.js'
import { PrivacyService } from '../privacy/service.js'
import { createBackup, prepareRestore } from '../storage/backup.js'
import { openCoreStore, type CoreStore } from '../storage/db.js'
import { DEMO_END, DEMO_UNTIL, newCore } from './helpers.js'

/**
 * Privacy, segreti, degrado dell'archivio e ripristino (T43, T45, T48, T49).
 * Database su file in cartelle temporanee sotto `os.tmpdir()`, rimosse a fine
 * test; clock iniettato; nessuna rete (fetch/WebSocket bloccati dove serve).
 */

const ENTITY = 'light.demo_ingresso'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.dG9rZW4tZGktdGVzdC1zZWdyZXRv.ZmlybWEtc2VncmV0YS0xMjM0NTY'
const PLAIN = 'tok_SEGRETO_non_jwt_8f3c1a9b2d'

const tempDirs: string[] = []
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function blockNetwork() {
  const fetchSpy = vi.fn(async () => { throw new Error('rete bloccata nei test') })
  const wsSpy = vi.fn(function blockedWebSocket() { throw new Error('WebSocket bloccato nei test') })
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('WebSocket', wsSpy)
  return { fetchSpy, wsSpy }
}

function count(store: CoreStore, sql: string, ...params: string[]): number {
  return Number(store.get(sql, ...params)?.n ?? 0)
}

/** Tracce di un'entità in eventi e derivati. */
function traces(store: CoreStore, entityId: string) {
  return {
    events: count(store, 'SELECT COUNT(*) AS n FROM event_entities WHERE entity_id = ?', entityId),
    eventBodies: count(store, 'SELECT COUNT(*) AS n FROM observed_events WHERE body LIKE ?', `%"${entityId}"%`),
    episodes: count(store, 'SELECT COUNT(*) AS n FROM episodes WHERE body LIKE ?', `%${entityId}%`),
    patterns: count(store, 'SELECT COUNT(*) AS n FROM patterns WHERE body LIKE ?', `%${entityId}%`),
    proposals: count(store, 'SELECT COUNT(*) AS n FROM proposals WHERE body LIKE ?', `%${entityId}%`),
    snapshots: count(store, 'SELECT COUNT(*) AS n FROM context_snapshots WHERE body LIKE ?', `%"${entityId}"%`),
    state: count(store, 'SELECT COUNT(*) AS n FROM entity_state WHERE entity_id = ?', entityId),
  }
}

function noTraces() {
  return { events: 0, eventBodies: 0, episodes: 0, patterns: 0, proposals: 0, snapshots: 0, state: 0 }
}

/** Un evento del dataset che riguarda l'entità, da riproporre come replay/ripristino. */
function oldEventFor(entityId: string): ObservedEvent {
  const dataset = buildDemoDataset(DEMO_END, DEMO_UNTIL)
  const event = dataset.events.find((e) => e.kind === 'manual.intent' && e.payload.target_entity_ids.includes(entityId))
  if (!event) throw new Error('evento di fixture atteso')
  return event
}

/**
 * Replay delle fixture come se fossero dati REALI (demo spenta, osservazione e
 * apprendimento consentiti): serve a verificare revoca e oblio sui derivati reali.
 */
async function seededReal() {
  const env = await newCore(DEMO_UNTIL.toISOString(), (config) => {
    config.runtime.demo = false
    config.sources.fixtures.enabled = false
    config.sources.home_assistant.enabled = true
    config.sources.home_assistant.selected_entities = DEMO_ENTITIES.map((e) => e.entity_id)
    config.sources.home_assistant.presence_entities = DEMO_ENTITIES.filter((e) => e.role === 'presence').map((e) => e.entity_id)
    config.sources.home_assistant.door_entities = DEMO_ENTITIES.filter((e) => e.role === 'door').map((e) => e.entity_id)
    config.sources.home_assistant.window_entities = DEMO_ENTITIES.filter((e) => e.role === 'window').map((e) => e.entity_id)
    config.sources.weather.adapter = 'none'
    config.privacy.real_observation_enabled = true
    config.privacy.real_learning_enabled = true
  })
  const { core } = env
  const dataset = buildDemoDataset(DEMO_END, DEMO_UNTIL)
  core.catalog.replace(dataset.entities, DEMO_UNTIL.toISOString())
  for (const event of dataset.events) {
    core.clock.override = new Date(event.received_at)
    await core.tick({ allowMining: false, agents: false, light: true })
    core.ingest(event, { demo: false })
    core.process()
  }
  core.clock.override = new Date(DEMO_UNTIL)
  await core.tick({ allowMining: false, agents: false })
  core.clock.override = null
  core.refreshPatterns()
  core.evaluate({ kind: 'review' })
  return env
}

// ── T43 ─────────────────────────────────────────────────────────────────────

describe('T43 — revoca del consenso e oblio', () => {
  it('T43 revocare l’apprendimento ferma le inferenze e cancella pattern e proposte derivati dai dati reali', async () => {
    const { core, clock } = await seededReal()
    const real = core.patterns.list({ demo: false, includeRetired: true })
    expect(real.some((p) => p.state === 'supported')).toBe(true)
    expect(count(core.store, 'SELECT COUNT(*) AS n FROM pattern_evidence')).toBeGreaterThan(0)
    expect(core.proposals.list({ includePersonal: true, limit: 50 }).some((p) => p.agent_key === 'arrival')).toBe(true)
    const scopeBefore = core.contexts.privacyScopeVersion()
    const episodesBefore = core.arrivals.list({ demo: false, limit: 200 }).length

    const config = core.config()
    core.updateConfig({ ...config, privacy: { ...config.privacy, real_learning_enabled: false } }, core.configRevision(), 'device-admin')

    expect(core.patterns.list({ demo: false, includeRetired: true })).toEqual([])
    expect(count(core.store, 'SELECT COUNT(*) AS n FROM pattern_evidence')).toBe(0)
    expect(core.proposals.list({ includePersonal: true, limit: 50 }).filter((p) => p.agent_key === 'arrival')).toEqual([])
    const consent = core.privacy.consents()[0]
    expect(consent).toMatchObject({ purpose: 'learning', granted: false, granted_by: 'device-admin' })
    expect(core.contexts.privacyScopeVersion()).toBeGreaterThan(scopeBefore)
    expect(core.health({ haReachable: true, lastBackupAt: null, lastRestoreVerifiedAt: null }).learner).toBe('stopped_no_consent')
    expect(core.audit.list(50).some((entry) => entry.action === 'privacy.learning_revoked')).toBe(true)

    // Nessuna nuova inferenza, nemmeno dai job a tempo o da una rivalutazione.
    core.refreshPatterns()
    clock.advance(7 * 3_600_000)
    await core.tick()
    core.evaluate({ kind: 'review' })
    expect(core.patterns.list({ demo: false, includeRetired: true })).toEqual([])
    expect(core.proposals.list({ includePersonal: true, limit: 50 }).filter((p) => p.agent_key === 'arrival')).toEqual([])
    // L'osservazione (memoria episodica) non è cancellata dalla sola revoca dell'apprendimento.
    expect(core.arrivals.list({ demo: false, limit: 200 }).length).toBe(episodesBefore)
  })

  it('T43 “Dimentica questi dati” su un’entità rimuove eventi, episodi, pattern, snapshot, proposte e stato derivati', async () => {
    const { core } = await seededReal()
    const before = traces(core.store, ENTITY)
    expect(before.events).toBeGreaterThan(0)
    expect(before.episodes).toBeGreaterThan(0)
    expect(before.patterns).toBeGreaterThan(0)
    const forgottenPatterns = core.patterns.list({ demo: false, includeRetired: true }).filter((p) => JSON.stringify(p.steps).includes(ENTITY)).map((p) => p.pattern_id)

    const job = core.privacy.requestDeletion({ entity_ids: [ENTITY], subject_id: null, pattern_id: null, before: null, all: false }, 'device-admin')
    expect(job.state).toBe('completed')
    expect(job.removed.events).toBe(before.events)
    expect(job.removed.episodes).toBeGreaterThan(0)
    expect(job.removed.patterns).toBeGreaterThanOrEqual(forgottenPatterns.length)
    expect(core.privacy.job(job.job_id)).toMatchObject({ state: 'completed', removed: job.removed })

    expect(traces(core.store, ENTITY)).toEqual(noTraces())
    // Il riapprendimento sui dati rimasti non ricrea ciò che è stato dimenticato.
    core.refreshPatterns()
    core.evaluate({ kind: 'review' })
    expect(traces(core.store, ENTITY)).toEqual({ ...noTraces(), snapshots: traces(core.store, ENTITY).snapshots })
    for (const id of forgottenPatterns) expect(core.patterns.get(id)).toBeNull()
    expect(JSON.stringify(core.privacy.export({ includePersonal: true }))).not.toContain(ENTITY)
    // Un replay dei vecchi eventi non li reimporta.
    expect(core.ingest(oldEventFor(ENTITY), { demo: false }).status).toBe('tombstoned')
  })
})

// ── T45 ─────────────────────────────────────────────────────────────────────

describe('T45 — segreti in eccezioni, log ed export', () => {
  it('T45 token nel testo di audit, export e backup cifrato: sempre redatto o illeggibile', async () => {
    vi.stubEnv('HA_TOKEN', PLAIN)
    const dir = tempDir('home-ai-t45-')
    const store = await openCoreStore(join(dir, 'core.sqlite'))
    const clock = new ManualClock(DEMO_UNTIL)
    const core = new HomeAiCore({ store, clock: new CoreClock(clock) })
    await core.seedDemo({ endDate: DEMO_END, until: DEMO_UNTIL })

    core.audit.record({ actor: 'device-admin', action: 'test.secret', outcome: 'failed', detail: `HA ha risposto con Bearer ${JWT} e token=${PLAIN}` })
    const proposal = core.proposals.list({ includePersonal: true, limit: 50 })[0]
    core.proposals.feedback(proposal.proposal_id, 'not_useful', 'device-admin', proposal.scope, `incollato per errore: ${PLAIN} ${JWT}`)
    const intent = makeEvent({
      kind: 'manual.intent', source: { id: 'dashboard', kind: 'dashboard', native_id: 'op-segreto:intent' },
      occurred_at: DEMO_UNTIL.toISOString(), received_at: DEMO_UNTIL.toISOString(), delivery: 'live',
      quality: quality('manual_confirmed', 1, ['DASHBOARD_GESTURE']),
      payload: { operation_id: 'op-segreto', interaction_id: 'click-segreto', control: 'button', action_key: 'lighting.on', target_entity_ids: [ENTITY], requested: { note: `Bearer ${PLAIN}` } },
    })
    expect(core.ingest(intent, { demo: true }).status).toBe('stored')

    const audit = JSON.stringify(core.audit.list(500))
    const exported = JSON.stringify(core.privacy.export({ includePersonal: true }))
    for (const text of [audit, exported]) {
      expect(text).not.toContain(PLAIN)
      expect(text).not.toContain(JWT)
    }
    expect(exported).toContain('[REDATTO]')
    expect(core.privacy.export({ includePersonal: false }).secrets_included).toBe(false)

    // Il backup è cifrato e la chiave sta FUORI dalla cartella dei backup.
    const backupDir = join(dir, 'backups')
    const keyPath = join(dir, 'backup.key')
    const info = await createBackup(store, backupDir, keyPath, DEMO_UNTIL)
    const blob = readFileSync(join(backupDir, info.file))
    expect(blob.includes(Buffer.from(PLAIN))).toBe(false)
    expect(blob.includes(Buffer.from('device-admin'))).toBe(false)
    expect(readdirSync(backupDir).some((name) => name.includes('key'))).toBe(false)
    store.close()
  })

  it('T45 eccezioni del gateway e messaggi in quarantena non riportano il token', async () => {
    vi.stubEnv('HA_TOKEN', PLAIN)
    const failing = new HAReadGateway({
      baseUrl: async () => 'http://ha.test:8123',
      token: async () => PLAIN,
      fetchImpl: (async () => { throw new Error(`connect ECONNREFUSED Authorization: Bearer ${PLAIN}`) }) as typeof fetch,
      audit: () => undefined,
    })
    const unauthorized = new HAReadGateway({
      baseUrl: async () => 'http://ha.test:8123',
      token: async () => JWT,
      fetchImpl: (async () => new Response(`{"message":"invalid token ${JWT}"}`, { status: 401 })) as typeof fetch,
      audit: () => undefined,
    })
    for (const gateway of [failing, unauthorized]) {
      let error: unknown = null
      try { await gateway.readStates() } catch (caught) { error = caught }
      expect(error).toBeInstanceOf(CoreError)
      expect((error as CoreError).code).toBe('SOURCE_UNAVAILABLE')
      const text = JSON.stringify({ message: (error as CoreError).message, details: (error as CoreError).details, stack: (error as Error).stack })
      expect(text).not.toContain(PLAIN)
      expect(text).not.toContain(JWT)
    }

    // Un messaggio malformato con il segreto come nome di proprietà o valore: quarantena minimizzata.
    const { core } = await newCore()
    const malformed = { ...oldEventFor(ENTITY), [JWT]: 1, [`${PLAIN}`]: 'x' }
    expect(core.ingest(malformed, { demo: true }).status).toBe('quarantined')
    const quarantine = JSON.stringify(core.store.all('SELECT * FROM quarantine'))
    expect(quarantine).toContain('SCHEMA_INVALID')
    expect(quarantine).not.toContain(JWT)
    expect(quarantine).not.toContain(PLAIN)
  })
})

// ── T48 ─────────────────────────────────────────────────────────────────────

describe('T48 — archivio pieno o non scrivibile', () => {
  async function fileCore() {
    const dir = tempDir('home-ai-t48-')
    const store = await openCoreStore(join(dir, 'core.sqlite'))
    const clock = new ManualClock('2026-10-12T19:00:00Z')
    const core = new HomeAiCore({ store, clock: new CoreClock(clock) })
    const config = core.config()
    core.updateConfig({
      ...config,
      runtime: { ...config.runtime, demo: false },
      sources: { ...config.sources, fixtures: { ...config.sources.fixtures, enabled: false }, home_assistant: { ...config.sources.home_assistant, enabled: true, selected_entities: [ENTITY] } },
      privacy: { ...config.privacy, real_observation_enabled: true },
    }, core.configRevision(), 'device-admin')
    return { core, store, clock }
  }

  const intent = (n: number) => ({
    operation_id: `op-t48-${n}`, interaction_id: `click-t48-${n}`, control: 'button', domain: 'light', service: 'turn_on',
    target_entity_ids: [ENTITY], requested: { note: 'x'.repeat(200) },
  })

  it('T48 database non scrivibile: stato degradato esplicito, nessuna persistenza dichiarata riuscita, nessuna eccezione', async () => {
    const { core, store } = await fileCore()
    expect(core.telemetry.recordIntent(intent(1), { role: 'kiosk', authMode: 'disabled' }).status).toBe('stored')

    store.db.exec('PRAGMA query_only = ON')
    let result: { status: string } | null = null
    expect(() => { result = core.telemetry.recordIntent(intent(2), { role: 'kiosk', authMode: 'disabled' }) }).not.toThrow()
    expect(result!.status).toBe('degraded')
    expect(core.ingest(oldEventFor(ENTITY), { demo: false }).status).toBe('degraded')
    expect(core.metrics.degraded).toBeGreaterThanOrEqual(1)

    const health = core.health({ haReachable: true, lastBackupAt: null, lastRestoreVerifiedAt: null })
    expect(health.service).toBe('degraded')
    expect(health.storage).toBe('read_only')
    const issue = health.issues.find((i) => i.code === 'STORAGE_DEGRADED')
    expect(issue?.message).toMatch(/dashboard continua a funzionare/)

    // Tornato scrivibile, il core lo dichiara di nuovo e riprende a persistere.
    store.db.exec('PRAGMA query_only = OFF')
    expect(core.telemetry.recordIntent(intent(3), { role: 'kiosk', authMode: 'disabled' }).status).toBe('stored')
    expect(core.health({ haReachable: true, lastBackupAt: null, lastRestoreVerifiedAt: null }).service).toBe('running')
    store.close()
  })

  it('T48 disco pieno: le scritture falliscono come "degraded", mai come "stored"', async () => {
    const { core, store } = await fileCore()
    const pages = Number(Object.values(store.get('PRAGMA page_count') ?? { n: 0 })[0])
    store.db.exec(`PRAGMA max_page_count = ${pages}`)
    const statuses: string[] = []
    for (let i = 0; i < 400 && !statuses.includes('degraded'); i += 1) {
      statuses.push(core.telemetry.recordIntent(intent(100 + i), { role: 'admin', authMode: 'disabled' }).status)
    }
    expect(statuses).toContain('degraded')
    expect(statuses.filter((s) => s !== 'stored' && s !== 'degraded')).toEqual([])
    expect(store.degraded).toMatch(/pieno o non scrivibile/)
    expect(core.health({ haReachable: true, lastBackupAt: null, lastRestoreVerifiedAt: null }).service).toBe('degraded')
    store.close()
  })
})

// ── T49 ─────────────────────────────────────────────────────────────────────

describe('T49 — ripristino di un backup dopo un oblio', () => {
  it('T49 le cancellazioni (tombstone) vengono riapplicate al database ripristinato prima di rielaborare', async () => {
    const dir = tempDir('home-ai-t49-')
    const dbPath = join(dir, 'core.sqlite')
    const backupDir = join(dir, 'backups')
    const keyPath = join(dir, 'backup.key')
    let store = await openCoreStore(dbPath)
    const clock = new ManualClock(DEMO_UNTIL)
    let core = new HomeAiCore({ store, clock: new CoreClock(clock) })
    await core.seedDemo({ endDate: DEMO_END, until: DEMO_UNTIL })
    expect(traces(store, ENTITY).events).toBeGreaterThan(0)

    const backup = await createBackup(store, backupDir, keyPath, DEMO_UNTIL)
    clock.advance(60_000)
    core.privacy.requestDeletion({ entity_ids: [ENTITY], subject_id: null, pattern_id: null, before: null, all: false }, 'device-admin')
    expect(traces(store, ENTITY)).toEqual(noTraces())
    const tombstones = core.privacy.tombstones()
    expect(tombstones).toHaveLength(1)

    const prepared = await prepareRestore(store, backupDir, keyPath, backup.id, dbPath, clock.now())
    expect(existsSync(prepared.previousCopy)).toBe(true)
    store.close()
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true })
    renameSync(prepared.restoredFile, dbPath)

    store = await openCoreStore(dbPath)
    core = new HomeAiCore({ store, clock: new CoreClock(clock) })
    // Il backup precede l'oblio: i dati sono tornati, senza tombstone.
    expect(traces(store, ENTITY).events).toBeGreaterThan(0)
    expect(core.privacy.tombstones()).toEqual([])

    const reapplied = core.privacy.reapplyTombstones(tombstones)
    expect(reapplied).toBeGreaterThan(0)
    expect(traces(store, ENTITY)).toEqual(noTraces())
    expect(core.privacy.tombstones()).toHaveLength(1)

    // Rielaborazione, riapprendimento e replay non resuscitano nulla.
    core.process()
    await core.tick()
    core.refreshPatterns()
    expect(core.ingest(oldEventFor(ENTITY), { demo: true }).status).toBe('tombstoned')
    const after = traces(store, ENTITY)
    expect({ ...after, snapshots: 0 }).toEqual(noTraces())
    expect(core.patterns.list({ includeRetired: true }).some((p) => JSON.stringify(p.steps).includes(ENTITY))).toBe(false)
    // Idempotente: riapplicare di nuovo non duplica le tombstone.
    core.privacy.reapplyTombstones(tombstones)
    expect(core.privacy.tombstones()).toHaveLength(1)
    store.close()
  })

  it('T49 ripristino dal servizio (API admin): oblio riapplicato prima di catalogo, feed, job e rielaborazione', async () => {
    const dir = tempDir('home-ai-t49-api-')
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
    const admin = { 'Content-Type': 'application/json', 'X-MyHome-Client': 'desktop' }
    try {
      await mod.startHomeAiCore()
      const first = mod.homeAiCoreForTests()!
      await vi.waitFor(() => expect(first.store.getMeta('demo_seeded_until')).not.toBeNull(), { timeout: 20_000, interval: 50 })
      expect(traces(first.store, ENTITY).events).toBeGreaterThan(0)

      const created = await app.request('/api/home-ai/v1/backups', { method: 'POST', headers: admin, body: '{}' })
      expect(created.status).toBe(201)
      const backup = await created.json() as { id: string }

      vi.setSystemTime(new Date(DEMO_UNTIL.getTime() + 60_000))
      const deletion = await app.request('/api/home-ai/v1/privacy/delete', {
        method: 'POST', headers: { ...admin, 'Idempotency-Key': 'oblio-t49-0001' },
        body: JSON.stringify({ entity_ids: [ENTITY], subject_id: null, pattern_id: null, before: null, all: false, confirm: true }),
      })
      expect(deletion.status).toBe(200)
      expect(traces(first.store, ENTITY)).toEqual(noTraces())

      const reapplySpy = vi.spyOn(PrivacyService.prototype, 'reapplyTombstones')
      const processSpy = vi.spyOn(HomeAiCore.prototype, 'process')
      const tickSpy = vi.spyOn(HomeAiCore.prototype, 'tick')
      const catalogSpy = vi.spyOn(HomeAiCore.prototype, 'rebuildCatalog')
      const minerSpy = vi.spyOn(HomeAiCore.prototype, 'refreshPatterns')
      const ingestSpy = vi.spyOn(HomeAiCore.prototype, 'ingest')

      const restored = await app.request(`/api/home-ai/v1/backups/${backup.id}/restore`, { method: 'POST', headers: { ...admin, 'Idempotency-Key': 'ripristino-t49-0001' }, body: '{}' })
      const body = await restored.json() as { restored_from?: string; tombstones_reapplied?: number; code?: string }
      expect(restored.status, JSON.stringify(body)).toBe(200)
      expect(body.restored_from).toBe(backup.id)
      expect(body.tombstones_reapplied).toBeGreaterThan(0)

      const second = mod.homeAiCoreForTests()!
      expect(second).not.toBe(first)
      expect(traces(second.store, ENTITY)).toEqual(noTraces())
      expect(second.privacy.tombstones()).toHaveLength(1)
      expect(second.ingest(oldEventFor(ENTITY), { demo: true }).status).toBe('tombstoned')

      // Ordine: la riapplicazione precede ogni altra elaborazione del core ripristinato.
      expect(reapplySpy).toHaveBeenCalledTimes(1)
      const reapplyAt = reapplySpy.mock.invocationCallOrder[0]
      for (const spy of [processSpy, tickSpy, catalogSpy, minerSpy, ingestSpy]) {
        for (const at of spy.mock.invocationCallOrder) expect(at).toBeGreaterThan(reapplyAt)
      }
    } finally {
      mod.stopHomeAiCore()
      process.env = saved
    }
  }, 40_000)
})
