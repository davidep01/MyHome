import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CoreClock, HomeAiCore } from '../core.js'
import { defaultCoreConfig } from '../config.js'
import type { ObservedEvent } from '../domain/contracts.js'
import { ManualClock } from '../domain/time.js'
import { MAX_QUARANTINE_ROWS } from '../ingestion/event-log.js'
import { openCoreStore } from '../storage/db.js'
import {
  ARRIVAL, ENTRANCE, KIOSK, LIVING, START,
  click, countRows, eventsOf, intentEvent, iso, newRealCore, presenceSignal, realHome, stateEvent,
  type RealEnv,
} from './ingestion.support.js'

/**
 * Registro eventi, outbox e quarantena (specifica §8, §19, §20, matrice
 * §26: T10, T46, T51).
 */

/** Stato osservabile da confrontare fra due core che hanno visto gli stessi fatti. */
function observable(env: RealEnv) {
  return {
    events: countRows(env, 'observed_events'),
    states: env.core.projection.all().map((s) => ({ entity_id: s.entity_id, state: s.value.state, at: s.value.source_updated_at, conflict: s.conflict })),
    episodes: env.core.arrivals.list({ limit: 20 })
      .filter((episode) => episode.state !== 'cancelled')
      .map((episode) => ({ state: episode.state, actions: episode.actions.map((a) => [a.operation_id, a.token, a.session_updates]) })),
    effects: eventsOf(env.core, 'state.changed').map((e) => [e.payload.entity_id, e.payload.after?.state, e.payload.effect_of_operation_id]),
  }
}

async function settle(env: RealEnv): Promise<void> {
  env.clock.set(iso(ARRIVAL, 70))
  await env.core.tick({ light: true })
  env.clock.set(iso(ARRIVAL, 8 + 20 * 60))
  await env.core.tick({ light: true })
}

describe('Deduplica e riordino', () => {
  it('T10 eventi duplicati e riordinati producono stato coerente e conteggi invariati', async () => {
    const left = iso(ARRIVAL, -45 * 60)
    // Ogni evento arriva entro la finestra di riordino di 30 s, ma non nell'ordine in cui è accaduto.
    const facts: ObservedEvent[] = [
      presenceSignal('away', left, { receivedAt: iso(left, 1) }),
      presenceSignal('home', ARRIVAL, { receivedAt: iso(ARRIVAL, 1) }),
      presenceSignal('away', iso(ARRIVAL, 3), { receivedAt: iso(ARRIVAL, 25) }),
      presenceSignal('home', iso(ARRIVAL, 8), { receivedAt: iso(ARRIVAL, 9) }),
      intentEvent('op-t10-a', ENTRANCE, iso(ARRIVAL, 80), { receivedAt: iso(ARRIVAL, 104) }),
      stateEvent(ENTRANCE, 'on', iso(ARRIVAL, 81), { receivedAt: iso(ARRIVAL, 82), effectOf: 'op-t10-a', contextId: 'ctx-t10-a' }),
      intentEvent('op-t10-b', LIVING, iso(ARRIVAL, 95), { receivedAt: iso(ARRIVAL, 96) }),
      stateEvent(LIVING, 'on', iso(ARRIVAL, 96), { receivedAt: iso(ARRIVAL, 120), effectOf: 'op-t10-b', contextId: 'ctx-t10-b' }),
      stateEvent(LIVING, 'off', iso(ARRIVAL, 110), { receivedAt: iso(ARRIVAL, 111) }),
    ]
    for (const fact of facts) expect(Date.parse(fact.received_at) - Date.parse(fact.occurred_at)).toBeLessThanOrEqual(30_000)

    const ordered = await newRealCore()
    for (const fact of [...facts].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
      ordered.clock.set(fact.occurred_at)
      expect(ordered.core.ingest(fact, { demo: false }).status).toBe('stored')
      ordered.core.process()
    }

    // Consegna reale: ordine di ricezione, ogni evento ripetuto identico e poi reinviato con un nuovo event_id.
    const messy = await newRealCore()
    const byArrival = [...facts].sort((a, b) => a.received_at.localeCompare(b.received_at))
    const deliveries = [
      ...byArrival.flatMap((fact) => [fact, fact]),
      ...[...byArrival].reverse().map((fact) => ({ ...fact, event_id: `${fact.event_id}-reinvio` })),
    ]
    const statuses: string[] = []
    for (const delivery of deliveries) {
      messy.clock.set(delivery.received_at)
      statuses.push(messy.core.ingest(delivery, { demo: false }).status)
      messy.core.process()
    }
    expect(statuses.filter((status) => status === 'stored')).toHaveLength(facts.length)
    expect(statuses.filter((status) => status === 'duplicate')).toHaveLength(2 * facts.length)
    expect(messy.core.metrics).toMatchObject({ ingested: facts.length, duplicates: 2 * facts.length, quarantined: 0 })

    await settle(ordered)
    await settle(messy)
    const expected = observable(ordered)
    expect(observable(messy)).toEqual(expected)
    // Il fatto più recente vince anche se arriva prima di quello più vecchio.
    expect(messy.core.projection.get(LIVING)?.value).toMatchObject({ state: 'off', source_updated_at: iso(ARRIVAL, 110) })
    expect(expected.episodes).toEqual([{
      state: 'present_stable',
      actions: [['op-t10-a', `lighting.on|${ENTRANCE}`, 1], ['op-t10-b', `lighting.on|${LIVING}`, 1]],
    }])
    expect(eventsOf(messy.core, 'manual.intent').some((event) => event.quality.reason_codes.includes('LATE_EVENT'))).toBe(false)
  })
})

describe('Outbox e ripresa dopo un crash', () => {
  it('T46 dopo un crash fra inserimento e consumer la ripresa dall’outbox non perde né duplica', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'home-ai-t46-'))
    const file = join(dir, 'home-ai.sqlite')
    const clock = new ManualClock(START)
    const open = async () => new HomeAiCore({ store: await openCoreStore(file), clock: new CoreClock(clock) })
    const opened: HomeAiCore[] = []
    try {
      const first = await open()
      opened.push(first)
      const config = defaultCoreConfig()
      realHome()(config)
      first.updateConfig(config, first.configRevision(), 'test')

      const left = iso(ARRIVAL, -45 * 60)
      const facts = [
        presenceSignal('away', left),
        presenceSignal('home', ARRIVAL),
        stateEvent(ENTRANCE, 'on', iso(ARRIVAL, 81), { effectOf: 'op-t46', contextId: 'ctx-t46' }),
      ]
      clock.set(iso(ARRIVAL, 85))
      for (const fact of facts) expect(first.ingest(fact, { demo: false }).status).toBe('stored')
      expect(click(first, 'op-t46', { targets: [ENTRANCE] }).status).toBe('stored')
      // Persistiti con la loro voce di outbox; il processo muore prima dei consumer.
      expect(first.events.pending('projection')).toBe(4)
      expect(first.events.pending('episodes')).toBe(4)
      expect(first.projection.get(ENTRANCE)).toBeNull()
      expect(first.arrivals.list({ limit: 10 })).toEqual([])

      // Riavvio sullo stesso file (la connessione precedente è abbandonata, non chiusa).
      const second = await open()
      opened.push(second)
      expect(second.events.pending('projection')).toBe(4)
      second.process()
      expect(second.events.pending('projection')).toBe(0)
      expect(second.events.pending('episodes')).toBe(0)
      expect(second.projection.get(ENTRANCE)?.value.state).toBe('on')
      expect(second.arrivals.list({ limit: 10 })).toHaveLength(1)

      // La fonte riconsegna dopo il riavvio: duplicati, nessun nuovo lavoro per i consumer.
      for (const fact of facts) expect(second.ingest(fact, { demo: false }).status).toBe('duplicate')
      expect(click(second, 'op-t46', { targets: [ENTRANCE] }).status).toBe('duplicate')
      second.process()
      expect(second.events.pending('projection')).toBe(0)

      const third = await open()
      opened.push(third)
      third.process()
      expect(Number(third.store.get('SELECT COUNT(*) AS n FROM observed_events')?.n)).toBe(4)
      const [episode] = third.arrivals.list({ limit: 10 })
      expect(third.arrivals.list({ limit: 10 })).toHaveLength(1)
      clock.set(iso(ARRIVAL, 61))
      await third.tick({ light: true })
      clock.set(episode.window_until)
      await third.tick({ light: true })
      const closed = third.arrivals.get(episode.episode_id)
      expect(closed?.state).toBe('present_stable')
      expect(closed?.actions.map((action) => action.operation_id)).toEqual(['op-t46'])
    } finally {
      for (const core of opened) core.store.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('T46 un consumer che cade a metà batch riprende dal checkpoint senza effetti doppi', async () => {
    const env = await newRealCore()
    const facts = [
      presenceSignal('away', iso(START, 1)),
      stateEvent(ENTRANCE, 'on', iso(START, 2)),
      stateEvent(LIVING, 'on', iso(START, 3)),
    ]
    for (const fact of facts) expect(env.core.ingest(fact, { demo: false }).status).toBe('stored')
    const applied = (eventId: string) => env.store.getMeta(`t46:${eventId}`)
    const handler = (failOn: string | null) => (event: ObservedEvent) => {
      env.store.setMeta(`t46:${event.event_id}`, String(Number(applied(event.event_id) ?? 0) + 1))
      if (event.event_id === failOn) throw new Error('crash simulato nel consumer')
    }

    expect(() => env.core.events.consume('t46-probe', handler(facts[1].event_id))).toThrow('crash simulato nel consumer')
    // L'effetto del messaggio fallito è annullato insieme al suo checkpoint.
    expect(applied(facts[0].event_id)).toBe('1')
    expect(applied(facts[1].event_id)).toBeNull()
    expect(env.core.events.pending('t46-probe')).toBe(2)

    expect(env.core.events.consume('t46-probe', handler(null))).toBe(2)
    expect(env.core.events.consume('t46-probe', handler(null))).toBe(0)
    expect(facts.map((fact) => applied(fact.event_id))).toEqual(['1', '1', '1'])
  })

  it('T46 evento e voce di outbox nascono nella stessa transazione', async () => {
    const env = await newRealCore()
    env.store.db.exec("CREATE TRIGGER t46_outbox_down BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'outbox non disponibile'); END")
    const fact = stateEvent(LIVING, 'on', iso(START, 10))
    expect(() => env.core.ingest(fact, { demo: false })).toThrow('outbox non disponibile')
    // Nessun evento orfano senza la sua consegna: la fonte può riconsegnarlo.
    expect(countRows(env, 'observed_events')).toBe(0)
    expect(countRows(env, 'event_entities')).toBe(0)

    env.store.db.exec('DROP TRIGGER t46_outbox_down')
    expect(env.core.ingest(fact, { demo: false }).status).toBe('stored')
    expect(env.core.events.pending('projection')).toBe(1)
    env.core.process()
    expect(env.core.projection.get(LIVING)?.value.state).toBe('on')
  })
})

describe('Input ostile o fuori contratto', () => {
  it('T51 schema futuro, payload malformato o enorme finiscono in una quarantena minimizzata senza bypass', async () => {
    const env = await newRealCore()
    const secret = 'eyJhbGciOiJIUzI1NiJ9.segreto-di-prova.firma'
    const valid = intentEvent('op-t51', LIVING, START)
    const circular: Record<string, unknown> = { ...valid }
    circular.self = circular
    const cases: [string, unknown, string][] = [
      ['versione futura dello schema', { ...valid, schema_version: 2 }, 'SCHEMA_UNSUPPORTED'],
      ['proprietà non prevista', { ...valid, execute: { service: 'light.turn_on' } }, 'SCHEMA_INVALID'],
      ['oggetto annidato nei parametri', { ...valid, payload: { ...valid.payload, requested: { note: { token: secret } } } }, 'SCHEMA_INVALID'],
      ['troppi target', { ...valid, payload: { ...valid.payload, target_entity_ids: Array.from({ length: 101 }, (_, i) => `light.l${i}`) } }, 'SCHEMA_INVALID'],
      ['numero non finito', { ...valid, quality: { ...valid.quality, attribution_score: Number.POSITIVE_INFINITY } }, 'SCHEMA_INVALID'],
      ['tipo di evento sconosciuto', { ...valid, kind: 'service.call' }, 'SCHEMA_INVALID'],
      ['payload enorme', { ...valid, payload: { ...valid.payload, requested: { blob: secret.repeat(2_000) } } }, 'PAYLOAD_TOO_LARGE'],
      ['struttura circolare', circular, 'PAYLOAD_TOO_LARGE'],
      ['istante nel futuro', { ...valid, occurred_at: iso(START, 3_600) }, 'CLOCK_SKEW'],
      ['non è un oggetto', 'DROP TABLE observed_events', 'SCHEMA_INVALID'],
    ]
    for (const [label, raw, reason] of cases) {
      expect(env.core.ingest(raw, { demo: false }), label).toEqual({ status: 'quarantined', reason })
    }
    // Nessun bypass: niente registro, niente outbox, niente proiezione.
    expect(countRows(env, 'observed_events')).toBe(0)
    expect(countRows(env, 'outbox')).toBe(0)
    expect(env.core.projection.all()).toEqual([])
    expect(env.core.metrics.quarantined).toBe(cases.length)

    // Quarantena minimizzata: solo motivo e percorsi, mai il contenuto.
    const rows = env.store.all('SELECT reason, detail FROM quarantine ORDER BY id')
    expect(rows.map((row) => String(row.reason))).toEqual(cases.map(([, , reason]) => reason))
    for (const row of rows) {
      const detail = JSON.parse(String(row.detail)) as string[]
      expect(detail.length).toBeLessThanOrEqual(10)
      for (const line of detail) expect(line.length).toBeLessThanOrEqual(160)
    }
    const dump = JSON.stringify(rows)
    for (const forbidden of [secret, 'DROP TABLE', 'light.turn_on', 'service.call']) expect(dump).not.toContain(forbidden)

    // Il contratto valido passa; un event_id riusato con altro contenuto non sovrascrive.
    expect(env.core.ingest(valid, { demo: false }).status).toBe('stored')
    const conflict = { ...valid, payload: { ...valid.payload, operation_id: 'op-t51-altro' } }
    expect(env.core.ingest(conflict, { demo: false })).toEqual({ status: 'quarantined', reason: 'EVENT_ID_CONFLICT' })
    expect(env.core.events.byOperation('op-t51')).toHaveLength(1)
    expect(env.core.events.byOperation('op-t51-altro')).toEqual([])

    // A breve durata: la retention svuota la quarantena, non il registro.
    env.clock.advance(2 * 86_400_000)
    env.core.privacy.applyRetention(env.core.config().privacy.retention_days)
    expect(env.core.events.quarantineCount()).toBe(0)
    expect(countRows(env, 'observed_events')).toBe(1)
  })

  it('T51 sotto un’ondata di input invalidi la quarantena resta limitata', async () => {
    const env = await newRealCore()
    const flood = MAX_QUARANTINE_ROWS + 250
    for (let i = 0; i < flood; i += 1) {
      expect(env.core.ingest({ schema_version: 1, kind: 'manual.intent', n: i }, { demo: false }).status).toBe('quarantined')
    }
    expect(env.core.metrics.quarantined).toBe(flood)
    expect(env.core.events.quarantineCount()).toBe(MAX_QUARANTINE_ROWS)
    // Restano le voci più recenti.
    const range = env.store.get('SELECT MIN(id) AS low, MAX(id) AS high FROM quarantine')
    expect(Number(range?.high)).toBe(flood)
    expect(Number(range?.high) - Number(range?.low) + 1).toBe(MAX_QUARANTINE_ROWS)
    expect(env.core.ingest(intentEvent('op-t51-dopo', LIVING, START), { demo: false }).status).toBe('stored')
  })

  it('T51 la telemetria non apre scorciatoie: azioni fuori registro, campi dichiarati dal client e target non selezionati sono respinti', async () => {
    const env = await newRealCore()
    const base = {
      operation_id: 'op-t51-tel', interaction_id: 'op-t51-tel-g', control: 'button', domain: 'light', service: 'turn_on',
      target_entity_ids: [LIVING], requested: {},
    }
    const attempts: [string, unknown, string][] = [
      ['servizio non in registro', { ...base, domain: 'lock', service: 'unlock' }, 'invalid'],
      ['servizio di sistema', { ...base, domain: 'homeassistant', service: 'restart' }, 'invalid'],
      ['chiave semantica dal client', { ...base, action_key: 'lighting.on' }, 'invalid'],
      ['identità dichiarata dal client', { ...base, actor_id: 'person-admin' }, 'invalid'],
      ['scope personale dichiarato', { ...base, scope: { kind: 'person', subject_id: 'subj-x' } }, 'invalid'],
      ['troppi target', { ...base, target_entity_ids: Array.from({ length: 101 }, (_, i) => `light.l${i}`) }, 'invalid'],
      ['parametri annidati', { ...base, requested: { payload: { service: 'lock.unlock' } } }, 'invalid'],
      ['troppi parametri', { ...base, requested: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])) }, 'invalid'],
      ['servizio con caratteri non ammessi', { ...base, service: 'turn_on; rm -rf /' }, 'invalid'],
      ['target non selezionato', { ...base, target_entity_ids: ['lock.porta_ingresso'] }, 'out_of_scope'],
    ]
    for (const [label, raw, status] of attempts) {
      expect(env.core.telemetry.recordIntent(raw, KIOSK).status, label).toBe(status)
    }
    expect(env.core.telemetry.recordResult({ operation_id: 'op-t51-tel', result: 'retry' }).status).toBe('invalid')
    expect(env.core.telemetry.recordResult({ operation_id: 'op-t51-tel', result: 'failed', reason_code: '<script>' }).status).toBe('invalid')

    expect(countRows(env, 'observed_events')).toBe(0)
    expect(countRows(env, 'outbox')).toBe(0)
    expect(env.core.telemetry.stats()).toMatchObject({ intents: 0, unmapped: 2, outOfScope: 1, results: 0 })
  })
})
