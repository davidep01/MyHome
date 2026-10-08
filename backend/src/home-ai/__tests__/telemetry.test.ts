import { afterEach, describe, expect, it, vi } from 'vitest'
import { pseudonymousSubject } from '../adapters/ha-feed.js'
import type { IngestResult } from '../ingestion/event-log.js'
import { attributeHaChange } from '../ingestion/normalize.js'
import { contextIdFromServiceResponse } from '../ingestion/telemetry.js'
import {
  ARRIVAL, ENTRANCE, LIVING, PERSON_A, START,
  arrive, click, closeWindow, delta, eventsOf, haEntity, iso, newRealCore, snapshot,
} from './ingestion.support.js'

/**
 * Telemetria delle azioni manuali e attribuzione degli eventi esterni
 * (specifica §7, matrice §26: T01–T04, T06, T07, T09).
 *
 * Intenzione, esito del percorso manuale ed effetto osservato sono tre cose
 * distinte; l'identità della fonte (operation_id + fase) decide la
 * deduplica, mai il valore di stato.
 */

const health = { haReachable: true, lastBackupAt: null, lastRestoreVerifiedAt: null }

afterEach(() => { vi.restoreAllMocks() })

describe('Telemetria dei gesti manuali', () => {
  it('T01 due click deliberati sullo stesso pulsante producono due intenzioni e due operation id', async () => {
    const env = await newRealCore()
    const episode = await arrive(env, ARRIVAL)
    env.clock.set(iso(ARRIVAL, 80))
    const first = click(env.core, 'op-t01-a', { targets: [ENTRANCE] })
    env.clock.set(iso(ARRIVAL, 84))
    const second = click(env.core, 'op-t01-b', { targets: [ENTRANCE] })

    expect(first.status).toBe('stored')
    expect(second.status).toBe('stored')
    const intents = eventsOf(env.core, 'manual.intent')
    expect(intents.map((event) => event.payload.operation_id)).toEqual(['op-t01-a', 'op-t01-b'])
    expect(new Set(intents.map((event) => event.event_id)).size).toBe(2)
    // Stessa chiave semantica e stesso valore richiesto: due gesti restano due.
    expect(new Set(intents.map((event) => `${event.payload.action_key}|${JSON.stringify(event.payload.requested)}`)).size).toBe(1)
    expect(env.core.telemetry.stats().intents).toBe(2)

    // Nell'episodio i due click restano due azioni collegate, non una "sessione di regolazione".
    const closed = await closeWindow(env, episode)
    expect(closed.actions.map((action) => [action.operation_id, action.session_updates])).toEqual([['op-t01-a', 1], ['op-t01-b', 1]])
    expect(closed.action_operation_ids).toEqual(['op-t01-a', 'op-t01-b'])
    const links = env.store.all("SELECT event_id FROM episode_events WHERE episode_id = ? AND role = 'action'", closed.episode_id)
    expect(links.map((row) => String(row.event_id)).sort()).toEqual(intents.map((event) => event.event_id).sort())
  })

  it('T02 il retry della stessa telemetria resta un solo evento logico', async () => {
    const env = await newRealCore()
    env.clock.set(iso(START, 10))
    const first = click(env.core, 'op-t02', { targets: [LIVING] }) as IngestResult
    // Il client reinvia 3 secondi dopo (risposta persa): stesso operation_id, istante diverso.
    env.clock.advance(3_000)
    const retry = click(env.core, 'op-t02', { targets: [LIVING] })
    expect(first.status).toBe('stored')
    expect(retry).toMatchObject({ status: 'duplicate', event_id: first.event_id })

    // Anche l'esito si deduplica per operazione: backend e client lo riferiscono entrambi.
    expect(env.core.telemetry.recordResult({ operation_id: 'op-t02', result: 'accepted' }, 'ctx-t02').status).toBe('stored')
    expect(env.core.telemetry.recordResult({ operation_id: 'op-t02', result: 'accepted' }).status).toBe('duplicate')

    expect(env.core.events.byOperation('op-t02').map((event) => event.kind)).toEqual(['manual.intent', 'manual.result'])
    expect(env.core.metrics).toMatchObject({ ingested: 2, duplicates: 2 })
    // Nessuna voce di outbox per i duplicati: i consumer vedono un solo evento per fase.
    expect(env.core.events.pending('projection')).toBe(2)
    env.core.process()
    expect(env.core.events.pending('projection')).toBe(0)
    expect(eventsOf(env.core, 'manual.intent')).toHaveLength(1)
  })

  it('T03 un click con la luce già accesa conserva l’intenzione senza inventare un effetto', async () => {
    const env = await newRealCore()
    const onSince = iso(START, -3_600)
    env.feed.handle(snapshot(haEntity(LIVING, 'on', onSince)))

    const operations = ['op-t03-1', 'op-t03-2', 'op-t03-3', 'op-t03-4', 'op-t03-5']
    for (const op of operations) {
      env.clock.advance(2_000)
      expect(click(env.core, op, { targets: [LIVING] }).status).toBe('stored')
      // HA non cambia nulla e risponde senza stati: nessun context.id da collegare.
      const contextId = contextIdFromServiceResponse([])
      expect(contextId).toBeNull()
      expect(env.core.telemetry.recordResult({ operation_id: op, result: 'accepted' }, contextId).status).toBe('stored')
    }
    env.core.process()

    expect(eventsOf(env.core, 'manual.intent').map((event) => event.payload.operation_id)).toEqual(operations)
    for (const op of operations) {
      expect(env.core.events.byOperation(op).map((event) => event.kind)).toEqual(['manual.intent', 'manual.result'])
      expect(env.core.telemetry.operationForContext(op)).toBeNull()
    }
    // L'unico cambio di stato è lo snapshot iniziale: nessuna transizione off → on inventata.
    const changes = eventsOf(env.core, 'state.changed')
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ delivery: 'snapshot', payload: { effect_of_operation_id: null } })
    expect(env.core.projection.get(LIVING)?.value).toMatchObject({ state: 'on', source_updated_at: onSince })
  })

  it('T04 il timeout del comando manuale resta un esito incerto e il core non ripete nulla', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rete vietata nei test'))
    const env = await newRealCore()
    env.feed.handle(snapshot(haEntity(LIVING, 'on', iso(START, -3_600))))
    env.clock.set(iso(START, 60))
    expect(click(env.core, 'op-t04', { targets: [LIVING], service: 'turn_off' }).status).toBe('stored')
    // Il proxy servizi non ha ricevuto risposta in tempo (504): esito ignoto, nessun context HA.
    expect(env.core.telemetry.recordResult({ operation_id: 'op-t04', result: 'unknown', ha_status: 504 }, null).status).toBe('stored')

    // Il tempo passa e il core lavora: nessun retry, nessuna nuova intenzione, nessun I/O.
    for (let minute = 1; minute <= 30; minute += 10) {
      env.clock.set(iso(START, 60 + minute * 60))
      await env.core.tick()
    }

    const linked = env.core.events.byOperation('op-t04')
    expect(linked.map((event) => event.kind)).toEqual(['manual.intent', 'manual.result'])
    const result = linked[1]
    expect(result.kind === 'manual.result' && result.payload).toEqual({
      operation_id: 'op-t04', result: 'unknown', reason_code: 'HA_STATUS_504', ha_context_id: null,
    })
    expect(eventsOf(env.core, 'manual.intent')).toHaveLength(1)
    expect(env.core.telemetry.stats()).toMatchObject({ intents: 1, results: 1 })

    // Un cambio successivo senza correlazione verificabile non diventa l'effetto del comando incerto.
    env.clock.set(iso(START, 40 * 60))
    env.feed.handle(delta(haEntity(LIVING, 'off', iso(START, 40 * 60), { id: 'ctx-ignoto', user_id: null, parent_id: null })))
    const late = eventsOf(env.core, 'state.changed').at(-1)
    expect(late).toMatchObject({ delivery: 'live', payload: { entity_id: LIVING, effect_of_operation_id: null }, quality: { attribution: 'unknown' } })
    expect(env.core.events.byOperation('op-t04')).toHaveLength(2)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(env.core.health(health).physical_execution).toBe('disabled')
  })
})

describe('Attribuzione degli eventi esterni', () => {
  it('T06 uno user_id da client API non basta per un’attribuzione manuale certa', async () => {
    const onlyUser = attributeHaChange(LIVING, { id: 'ctx-api', user_id: 'u-api', parent_id: null }, null)
    expect(onlyUser.quality).toMatchObject({ attribution: 'manual_likely', reason_codes: ['HA_USER_ID_ONLY'] })
    expect(onlyUser.quality.attribution_score).toBeLessThan(1)
    expect(onlyUser.effectOf).toBeNull()
    // L'ulteriore evidenza è la correlazione con un gesto della dashboard, non lo user_id.
    expect(attributeHaChange(LIVING, { id: 'ctx-api', user_id: 'u-api', parent_id: null }, { operation_id: 'op-x' }).quality.attribution).toBe('manual_confirmed')

    const env = await newRealCore()
    const episode = await arrive(env, ARRIVAL)
    env.clock.set(iso(ARRIVAL, 90))
    env.feed.handle(delta(haEntity(LIVING, 'on', iso(ARRIVAL, 90), { id: 'ctx-api-1', user_id: 'u-api-client', parent_id: null })))

    const change = eventsOf(env.core, 'state.changed').find((event) => event.payload.entity_id === LIVING)
    expect(change?.quality.attribution).toBe('manual_likely')
    expect(change?.quality.reason_codes).toEqual(['HA_USER_ID_ONLY'])
    expect(change?.actor_id).toBeNull()
    expect(change?.scope).toEqual({ kind: 'household', subject_id: null })
    expect(change?.payload.effect_of_operation_id).toBeNull()
    // Lo user_id serve solo come indizio: non viene conservato.
    expect(JSON.stringify(env.core.events.list({ limit: 100, includePersonal: true }))).not.toContain('u-api-client')

    const closed = await closeWindow(env, episode)
    expect(closed.actions).toEqual([])
    expect(eventsOf(env.core, 'manual.intent')).toHaveLength(0)
  })

  it('T07 un interruttore fisico senza utente resta di identità sconosciuta e non va all’ultimo arrivato', async () => {
    const env = await newRealCore(START, (config) => { config.privacy.personal_profiles_enabled = true })
    const anna = pseudonymousSubject(PERSON_A)
    const episode = await arrive(env, ARRIVAL, { entity: PERSON_A })
    // La presenza indica chi è rientrato; l'episodio resta del nucleo.
    expect(episode.subject_id).toBe(anna)
    expect(episode.scope).toEqual({ kind: 'household', subject_id: null })

    env.clock.set(iso(ARRIVAL, 75))
    env.feed.handle(delta(haEntity(LIVING, 'on', iso(ARRIVAL, 75), { id: 'ctx-parete', user_id: null, parent_id: null })))
    const change = eventsOf(env.core, 'state.changed').find((event) => event.payload.entity_id === LIVING)
    expect(change?.quality).toMatchObject({ attribution: 'unknown', attribution_score: 0, reason_codes: ['NO_ORIGIN_EVIDENCE'] })
    expect(change?.scope).toEqual({ kind: 'household', subject_id: null })
    expect(change?.actor_id).toBeNull()

    // Il soggetto compare solo sui segnali di presenza, mai sul gesto anonimo.
    const personal = env.store.all('SELECT DISTINCT kind FROM observed_events WHERE subject_id = ?', anna).map((row) => String(row.kind))
    expect(personal).toEqual(['presence.signal'])
    const closed = await closeWindow(env, episode)
    expect(closed.actions).toEqual([])
    expect(closed.action_operation_ids).toEqual([])
  })

  it('T09 intenzione, esito ed effetti restano collegati ma contano come una sola azione', async () => {
    const env = await newRealCore()
    const episode = await arrive(env, ARRIVAL)
    env.clock.set(iso(ARRIVAL, 80))
    expect(click(env.core, 'op-t09', { targets: [ENTRANCE, LIVING] }).status).toBe('stored')
    // Risposta reale del servizio HA: gli stati cambiati portano il context.id del comando.
    const contextId = contextIdFromServiceResponse([
      { entity_id: ENTRANCE, state: 'on', context: { id: 'ctx-t09', parent_id: null, user_id: 'u-tablet' } },
      { entity_id: LIVING, state: 'on', context: { id: 'ctx-t09', parent_id: null, user_id: 'u-tablet' } },
    ])
    expect(contextId).toBe('ctx-t09')
    expect(env.core.telemetry.recordResult({ operation_id: 'op-t09', result: 'accepted' }, contextId).status).toBe('stored')
    env.clock.set(iso(ARRIVAL, 81))
    // Una causa, due effetti su entità diverse: lo stesso context.id non li fonde.
    env.feed.handle(delta(
      haEntity(ENTRANCE, 'on', iso(ARRIVAL, 81), { id: 'ctx-t09', parent_id: null, user_id: 'u-tablet' }),
      haEntity(LIVING, 'on', iso(ARRIVAL, 81), { id: 'ctx-t09', parent_id: null, user_id: 'u-tablet' }),
    ))

    const linked = env.core.events.byOperation('op-t09')
    expect(linked.map((event) => event.kind).sort()).toEqual(['manual.intent', 'manual.result', 'state.changed', 'state.changed'])
    const effects = linked.flatMap((event) => event.kind === 'state.changed' ? [event] : [])
    expect(effects.map((event) => event.payload.entity_id).sort()).toEqual([ENTRANCE, LIVING])
    for (const effect of effects) {
      expect(effect.payload.effect_of_operation_id).toBe('op-t09')
      expect(effect.context.id).toBe('ctx-t09')
      expect(effect.quality.reason_codes).toEqual(['EFFECT_OF_DASHBOARD_OPERATION'])
    }

    // Nel dataset: una sola azione per l'operazione, collegata alla sola intenzione.
    const closed = await closeWindow(env, episode)
    expect(closed.actions).toHaveLength(1)
    expect(closed.actions[0]).toMatchObject({ operation_id: 'op-t09', action_key: 'lighting.on', targets: [ENTRANCE, LIVING] })
    const intent = linked.find((event) => event.kind === 'manual.intent')
    const links = env.store.all('SELECT event_id, role FROM episode_events WHERE episode_id = ?', closed.episode_id)
    expect(links.map((row) => [String(row.event_id), String(row.role)])).toEqual([[intent?.event_id, 'action']])
  })
})
