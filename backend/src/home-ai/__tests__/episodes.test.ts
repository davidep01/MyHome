import { afterEach, describe, expect, it, vi } from 'vitest'
import { pseudonymousSubject } from '../adapters/ha-feed.js'
import type { AgentTrigger } from '../agents/types.js'
import type { HomeAiCore } from '../core.js'
import { seededDemo } from './helpers.js'
import {
  ARRIVAL, CLIMATE, ENTRANCE, KIOSK, LIVING, PERSON_A, PERSON_B, PORCH, START,
  arrive, click, closeWindow, delta, eventsOf, haEntity, intentEvent, iso, newRealCore, presenceSignal, snapshot,
} from './ingestion.support.js'

/**
 * Episodi di rientro (specifica §8, §12, matrice §26: T05, T08, T11–T14).
 *
 * Il riconoscitore lavora a livello di nucleo: flapping, snapshot e
 * riconnessioni non sono rientri; un'automazione esistente non è un gesto;
 * un tablet condiviso non identifica chi lo tocca.
 */

const health = { haReachable: true, lastBackupAt: null, lastRestoreVerifiedAt: null }

afterEach(() => { vi.restoreAllMocks() })

/** Trigger con cui il core ha valutato gli agenti per un episodio appena chiuso. */
function liveEvaluations(spy: { mock: { calls: unknown[][] } }, episodeId: string): number {
  return spy.mock.calls
    .map((call) => call[0] as AgentTrigger)
    .filter((trigger) => trigger.kind === 'episode_finalized' && trigger.episode_id === episodeId).length
}

function presenceAt(env: { core: HomeAiCore; clock: { set(at: string): void } }, status: 'home' | 'away' | 'unknown', at: string): void {
  env.clock.set(at)
  expect(env.core.ingest(presenceSignal(status, at), { demo: false }).status).toBe('stored')
  env.core.process()
}

describe('Sessioni e conteggi dentro l’episodio', () => {
  it('T05 uno slider con molti aggiornamenti è una sola sessione di regolazione e non gonfia il supporto', async () => {
    const env = await newRealCore()
    const arrivals = [ARRIVAL, '2026-10-13T16:40:00.000Z']
    const updatesPerDay = [30, 3]
    for (const [day, arrival] of arrivals.entries()) {
      const episode = await arrive(env, arrival)
      for (let update = 0; update < updatesPerDay[day]; update += 1) {
        env.clock.set(iso(arrival, 120 + update * 0.5))
        const result = click(env.core, `op-t05-${day}-${update}`, {
          domain: 'climate', service: 'set_temperature', targets: [CLIMATE], control: 'slider', requested: { temperature: 19 + update * 0.1 },
        })
        expect(result.status).toBe('stored')
      }
      const closed = await closeWindow(env, episode)
      expect(closed.actions).toHaveLength(1)
      expect(closed.actions[0]).toMatchObject({ action_key: 'climate.temperature', operation_id: `op-t05-${day}-0`, session_updates: updatesPerDay[day] })
      expect(closed.action_operation_ids).toEqual([`op-t05-${day}-0`])
    }
    // I campioni restano nel registro (servono al contesto), ma non come preferenze indipendenti.
    expect(eventsOf(env.core, 'manual.intent')).toHaveLength(33)

    env.core.refreshPatterns()
    const pattern = env.core.patterns.list({ demo: false }).find((p) => p.tokens.join('>') === `climate.temperature|${CLIMATE}`)
    expect(pattern?.counts).toEqual({ eligible_opportunities: 2, successes: 2, counterexamples: 0, distinct_days: 2 })
    expect(pattern?.state).toBe('candidate')
    expect(pattern?.status_reason).toEqual(expect.arrayContaining(['FEW_OPPORTUNITIES', 'FEW_SUCCESSES']))
  })

  it('T08 un’automazione esistente dopo il rientro è esclusa dal conteggio delle azioni manuali', async () => {
    const env = await newRealCore()
    const episode = await arrive(env, ARRIVAL)
    // L'automazione di HA accende il portico: contesto con parent_id.
    env.clock.set(iso(ARRIVAL, 65))
    env.feed.handle(delta(haEntity(PORCH, 'on', iso(ARRIVAL, 65), { id: 'ctx-auto', parent_id: 'ctx-trigger', user_id: null })))
    env.clock.set(iso(ARRIVAL, 80))
    expect(click(env.core, 'op-t08', { targets: [ENTRANCE] }).status).toBe('stored')

    const porch = eventsOf(env.core, 'state.changed').find((event) => event.payload.entity_id === PORCH)
    expect(porch?.quality).toMatchObject({ attribution: 'automation', reason_codes: ['HA_PARENT_CONTEXT'] })
    expect(porch?.payload.effect_of_operation_id).toBeNull()

    const closed = await closeWindow(env, episode)
    expect(closed.automation_effects).toEqual([PORCH])
    expect(closed.actions.map((action) => action.token)).toEqual([`lighting.on|${ENTRANCE}`])
    expect(closed.action_operation_ids).toEqual(['op-t08'])
  })

  it('T08 nella demo il portico acceso dall’automazione non entra mai nelle routine apprese', async () => {
    const { core } = await seededDemo()
    const withAutomation = core.arrivals.list({ demo: true, limit: 100, finalizedOnly: true })
      .filter((episode) => episode.automation_effects.includes('light.demo_portico'))
    expect(withAutomation.length).toBeGreaterThanOrEqual(10)
    for (const episode of withAutomation) {
      expect(episode.actions.some((action) => action.targets.includes('light.demo_portico'))).toBe(false)
    }
    const patterns = core.patterns.list({ demo: true, includeRetired: true })
    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns.flatMap((pattern) => pattern.tokens).some((token) => token.includes('light.demo_portico'))).toBe(false)
  })
})

describe('Tempo, ritardi e copertura', () => {
  it('T11 un evento tardivo oltre la finestra corregge l’episodio senza suggerimenti live retroattivi', async () => {
    const env = await newRealCore()
    const episode = await arrive(env, ARRIVAL)
    env.clock.set(iso(ARRIVAL, 80))
    click(env.core, 'op-t11-a', { targets: [ENTRANCE] })

    const evaluate = vi.spyOn(env.core, 'evaluate')
    env.clock.set(episode.window_until)
    await env.core.tick()
    const closed = env.core.arrivals.get(episode.episode_id)
    expect(closed?.finalized_at).toBe(episode.window_until)
    expect(closed?.actions.map((action) => action.operation_id)).toEqual(['op-t11-a'])
    // Chiusura in tempo: una sola valutazione live dell'episodio.
    expect(liveEvaluations(evaluate, episode.episode_id)).toBe(1)
    evaluate.mockClear()

    // Il secondo gesto (a +130 s) arriva 25 minuti dopo, a finestra chiusa.
    const receivedAt = iso(ARRIVAL, 25 * 60 + 130)
    env.clock.set(receivedAt)
    const late = env.core.ingest(intentEvent('op-t11-b', LIVING, iso(ARRIVAL, 130), { receivedAt }), { demo: false })
    expect(late).toMatchObject({ status: 'stored', late: true })
    await env.core.tick()
    env.clock.set(iso(receivedAt, 15 * 60))
    await env.core.tick()

    const corrected = env.core.arrivals.get(episode.episode_id)
    expect(corrected?.late_corrected).toBe(true)
    expect(corrected?.actions.map((action) => action.operation_id)).toEqual(['op-t11-a', 'op-t11-b'])
    expect(eventsOf(env.core, 'manual.intent').find((event) => event.payload.operation_id === 'op-t11-b')?.quality.reason_codes).toContain('LATE_EVENT')
    expect(env.core.audit.list(50).filter((entry) => entry.action === 'episode.late_correction')).toHaveLength(1)
    // Nessuna rivalutazione live dell'episodio corretto e nessuna proposta di rientro.
    expect(liveEvaluations(evaluate, episode.episode_id)).toBe(0)
    expect(env.core.proposals.list({ includePersonal: true, limit: 50 }).filter((proposal) => proposal.agent_key === 'arrival')).toEqual([])
  })

  it('T11 un episodio chiuso a posteriori dopo un fermo del core non genera un suggerimento live', async () => {
    const env = await newRealCore()
    const episode = await arrive(env, ARRIVAL)
    env.clock.set(iso(ARRIVAL, 80))
    click(env.core, 'op-t11-c', { targets: [ENTRANCE] })
    const evaluate = vi.spyOn(env.core, 'evaluate')
    // Il core riprende due ore dopo la fine della finestra.
    env.clock.set(iso(episode.window_until, 2 * 3_600))
    await env.core.tick()
    expect(env.core.arrivals.get(episode.episode_id)?.finalized_at).not.toBeNull()
    expect(liveEvaluations(evaluate, episode.episode_id)).toBe(0)
  })

  it('T12 disconnessione e snapshot al ritorno dichiarano un gap senza inventare un rientro', async () => {
    const env = await newRealCore()
    const longAgo = iso(START, -3_600)
    env.feed.handle(snapshot(haEntity(PERSON_A, 'not_home', longAgo), haEntity(LIVING, 'off', longAgo), haEntity(ENTRANCE, 'off', longAgo)))
    await env.core.tick({ light: true })
    expect(env.core.health(health).coverage).toBe('complete')

    env.clock.set(iso(START, 5 * 60))
    env.feed.handle({ type: 'status', connected: false })
    expect(env.core.projection.openGaps()).toEqual([{ source_id: 'ha', from: iso(START, 5 * 60), reason_code: 'HA_DISCONNECTED' }])
    expect(env.core.health(health).coverage).toBe('partial')

    // Durante il buco Anna rientra e accende la luce: al ritorno arriva solo lo snapshot.
    env.clock.set(iso(START, 40 * 60))
    env.feed.handle(snapshot(
      haEntity(PERSON_A, 'home', iso(START, 20 * 60)),
      haEntity(LIVING, 'on', iso(START, 21 * 60), { id: 'ctx-durante-il-buco', user_id: 'u-tablet', parent_id: null }),
      haEntity(ENTRANCE, 'off', longAgo),
    ))
    env.clock.set(iso(START, 70 * 60))
    await env.core.tick({ light: true })

    expect(env.core.arrivals.list({ limit: 10 })).toEqual([])
    expect(env.core.projection.openGaps()).toEqual([])
    expect(env.core.projection.gapsOverlapping(START, iso(START, 3_600))).toEqual([
      { source_id: 'ha', from_at: iso(START, 5 * 60), until_at: iso(START, 40 * 60), reason: 'HA_DISCONNECTED' },
    ])
    // Lo snapshot rivela una differenza, non i gesti intermedi.
    const living = eventsOf(env.core, 'state.changed').filter((event) => event.payload.entity_id === LIVING)
    expect(living.at(-1)).toMatchObject({
      delivery: 'snapshot',
      quality: { attribution: 'system', reason_codes: ['SNAPSHOT_RECONCILE'], coverage: 'partial' },
      payload: { effect_of_operation_id: null },
    })
    const presence = eventsOf(env.core, 'presence.signal')
    expect(presence.map((event) => [event.delivery, event.payload.status])).toEqual([['snapshot', 'away'], ['snapshot', 'home']])
    // Entità invariata: nessun evento ripetuto alla riconnessione.
    expect(eventsOf(env.core, 'state.changed').filter((event) => event.payload.entity_id === ENTRANCE)).toHaveLength(1)
    expect(eventsOf(env.core, 'manual.intent')).toEqual([])
    expect(env.core.projection.get(LIVING)?.value.state).toBe('on')
    expect(env.core.health(health).coverage).toBe('complete')
  })

  it('T12 un rientro con un buco dentro la finestra resta a copertura parziale', async () => {
    const env = await newRealCore()
    const episode = await arrive(env, ARRIVAL)
    env.clock.set(iso(ARRIVAL, 5 * 60))
    env.feed.handle({ type: 'error', message: 'socket chiuso' })
    env.clock.set(iso(ARRIVAL, 9 * 60))
    env.feed.handle(snapshot(haEntity(PERSON_A, 'home', ARRIVAL)))
    const closed = await closeWindow(env, episode)
    expect(closed.coverage).toBe('partial')
    expect(env.core.arrivals.list({ limit: 10 })).toHaveLength(1)
  })
})

describe('Presenza e identità', () => {
  it('T13 il flapping della presenza non duplica l’episodio senza un’assenza stabile', async () => {
    const env = await newRealCore()
    const left = '2026-10-12T15:45:00.000Z'
    presenceAt(env, 'away', left)
    // Telefono che si riconnette: casa → fuori → casa in 40 secondi attorno al rientro.
    presenceAt(env, 'home', iso(ARRIVAL, -40))
    presenceAt(env, 'away', iso(ARRIVAL, -20))
    presenceAt(env, 'home', ARRIVAL)
    env.clock.set(iso(ARRIVAL, 61))
    await env.core.tick({ light: true })
    // Dopo il rientro stabile: uscita breve (2 minuti) e segnale perso e ritrovato.
    presenceAt(env, 'away', iso(ARRIVAL, 5 * 60))
    presenceAt(env, 'home', iso(ARRIVAL, 7 * 60))
    presenceAt(env, 'unknown', iso(ARRIVAL, 9 * 60))
    presenceAt(env, 'home', iso(ARRIVAL, 9 * 60 + 30))
    env.clock.set(iso(ARRIVAL, 40 * 60))
    await env.core.tick({ light: true })

    const episodes = env.core.arrivals.list({ limit: 20 })
    const kept = episodes.filter((episode) => episode.state !== 'cancelled')
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ state: 'present_stable', arrived_at: ARRIVAL, absent_since: left })
    expect(kept[0].finalized_at).not.toBeNull()
    // Il rientro non stabilizzato è annullato, non contato come secondo episodio.
    expect(episodes.filter((episode) => episode.state === 'cancelled').map((episode) => episode.arrived_at)).toEqual([iso(ARRIVAL, -40)])
  })

  it('T14 tablet condiviso e due abitanti: nessuna attribuzione personale per coincidenza', async () => {
    const env = await newRealCore(START, (config) => { config.privacy.personal_profiles_enabled = true })
    const anna = pseudonymousSubject(PERSON_A)
    const marco = pseudonymousSubject(PERSON_B)
    const left = iso(ARRIVAL, -3 * 3_600)
    env.clock.set(left)
    env.feed.handle(snapshot(haEntity(PERSON_A, 'not_home', left), haEntity(PERSON_B, 'not_home', left)))

    // Anna rientra; 20 secondi dopo qualcuno tocca il tablet condiviso.
    env.clock.set(ARRIVAL)
    env.feed.handle(delta(haEntity(PERSON_A, 'home', ARRIVAL)))
    env.clock.set(iso(ARRIVAL, 61))
    await env.core.tick({ light: true })
    env.clock.set(iso(ARRIVAL, 80))
    expect(click(env.core, 'op-t14-a', { targets: [ENTRANCE] }, KIOSK).status).toBe('stored')
    // Marco rientra a casa già occupata e poi il tablet viene toccato di nuovo.
    env.clock.set(iso(ARRIVAL, 180))
    env.feed.handle(delta(haEntity(PERSON_B, 'home', iso(ARRIVAL, 180))))
    env.clock.set(iso(ARRIVAL, 200))
    expect(click(env.core, 'op-t14-b', { targets: [LIVING] }, KIOSK).status).toBe('stored')

    // Un client non può dichiarare chi è: identità e scope li decide il server.
    const forged = env.core.telemetry.recordIntent({
      operation_id: 'op-t14-forged', interaction_id: 'op-t14-forged-g', control: 'button', domain: 'light', service: 'turn_on',
      target_entity_ids: [LIVING], requested: {}, subject_id: marco,
    }, KIOSK)
    expect(forged.status).toBe('invalid')

    env.clock.set(iso(ARRIVAL, 20 * 60))
    await env.core.tick({ light: true })
    const episodes = env.core.arrivals.list({ limit: 10 })
    expect(episodes).toHaveLength(1)
    expect(episodes[0]).toMatchObject({ scope: { kind: 'household', subject_id: null }, subject_id: anna, state: 'present_stable' })
    expect(episodes[0].actions.map((action) => action.operation_id)).toEqual(['op-t14-a', 'op-t14-b'])

    const intents = eventsOf(env.core, 'manual.intent')
    expect(intents).toHaveLength(2)
    for (const intent of intents) {
      expect(intent.scope).toEqual({ kind: 'household', subject_id: null })
      expect(intent.actor_id).toBe('device-kiosk')
      expect(intent.quality.reason_codes).toContain('SHARED_DEVICE')
    }
    // I soggetti compaiono solo sui segnali di presenza.
    const personal = env.store.all('SELECT DISTINCT kind, subject_id FROM observed_events WHERE subject_id IS NOT NULL ORDER BY subject_id')
      .map((row) => [String(row.kind), String(row.subject_id)])
    expect(personal).toEqual([['presence.signal', anna], ['presence.signal', marco]].sort((a, b) => a[1].localeCompare(b[1])))
  })
})
