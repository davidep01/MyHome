import { describe, expect, it } from 'vitest'
import type { HomeAiCore } from '../core.js'
import type { CoreConfig } from '../config.js'
import type { ForecastPoint, StateValue, WasteCalendar } from '../domain/contracts.js'
import { zonedInstant } from '../domain/time.js'
import { DEMO_ENTITIES } from '../fixtures/demo-home.js'
import { makeEvent, quality } from '../ingestion/normalize.js'
import type { StoredProposal } from '../suggestions/service.js'
import type { ForecastSnapshot } from '../weather/forecast.js'
import { newCore } from './helpers.js'

/**
 * Meteo e azioni contestuali (specifica §14, matrice §26: T29–T32).
 *
 * Previsioni SINTETICHE iniettate come eventi o tramite una `ForecastReadPort`
 * finta: nessuna rete. Le entità sono quelle dimostrative (finestra dello
 * studio con ruolo `window`).
 */

const TZ = 'Europe/Rome'
const WINDOW = 'binary_sensor.demo_finestra_studio'
const HOUR = 3_600_000
const HEALTH_INPUT = { haReachable: null, lastBackupAt: null, lastRestoreVerifiedAt: null }

const suggest = (config: CoreConfig) => {
  config.runtime.mode = 'suggest'
  config.attention.quiet_hours = { from: '00:00', until: '00:00' }
}

async function home(start: string) {
  const env = await newCore(start, suggest)
  env.core.rebuildCatalog() // entità dimostrative: la finestra dello studio ha ruolo "window"
  return env
}

function wasteCalendar(exposure: { from: string; until: string }, reminderAt: string): WasteCalendar {
  return {
    schema_version: 1,
    calendar_id: 'meteo-rifiuti',
    revision: 1,
    municipality: 'Comune di prova',
    area: 'Zona A',
    timezone: TZ,
    valid_from: '2026-09-01',
    valid_until: '2026-12-31',
    source: { kind: 'manual', reference: 'inserimento-manuale', document_url: null, checksum: null, acquired_at: '2026-09-01T08:00:00Z' },
    approval: { state: 'draft', actor_id: null, confirmed_at: null },
    fractions: [{ id: 'organico', label: 'Organico' }],
    rules: [{
      rule_id: 'organico-martedi',
      fraction_id: 'organico',
      recurrence: { kind: 'rrule', dtstart: '2026-09-01', value: 'FREQ=WEEKLY;BYDAY=TU' },
      collection_time: '07:00',
      exposure: { start_day_offset: -1, start_time: exposure.from, end_day_offset: -1, end_time: exposure.until },
      reminders: [{ day_offset: -1, at: reminderAt }],
    }],
    exceptions: [],
    demo: false,
  }
}

function activate(core: HomeAiCore, calendar: WasteCalendar): void {
  const opts = { tz: TZ, horizonDays: 60, realHome: false }
  const { calendar: draft } = core.waste.saveDraft(calendar, opts)
  core.waste.approve(draft.calendar_id, draft.revision, 'test-admin', { ...opts, demo: false })
}

/** Punti orari; piove nelle ore che iniziano dentro uno degli intervalli `rain`. */
function hourly(fromIso: string, hours: number, rain: [string, string][]): ForecastPoint[] {
  const start = Date.parse(fromIso)
  return Array.from({ length: hours }, (_, i) => {
    const from = start + i * HOUR
    const rainy = rain.some(([a, b]) => from >= Date.parse(a) && from < Date.parse(b))
    return {
      from: new Date(from).toISOString(),
      until: new Date(from + HOUR).toISOString(),
      resolution: 'hourly' as const,
      condition: rainy ? 'rainy' : 'cloudy',
      rain_probability: rainy ? 0.8 : 0.1,
      precipitation_mm: rainy ? 1.2 : 0,
      temperature_c: 15,
      wind_kmh: 10,
    }
  })
}

function snapshot(fetchedAt: string, expiresAt: string, points: ForecastPoint[]): ForecastSnapshot {
  return {
    source_id: 'test-forecast',
    issued_at: new Date(Date.parse(fetchedAt) - 30 * 60_000).toISOString(),
    fetched_at: fetchedAt,
    expires_at: expiresAt,
    points,
  }
}

function publishForecast(core: HomeAiCore, forecast: ForecastSnapshot): void {
  const result = core.ingest(makeEvent({
    kind: 'forecast.updated',
    source: { id: 'weather-test', kind: 'weather', native_id: `test:${forecast.fetched_at}` },
    occurred_at: forecast.fetched_at,
    received_at: forecast.fetched_at,
    delivery: 'live',
    quality: quality('system', 1, ['FORECAST_SOURCE']),
    payload: {
      forecast_source_id: forecast.source_id,
      issued_at: forecast.issued_at,
      fetched_at: forecast.fetched_at,
      expires_at: forecast.expires_at,
      points: forecast.points,
    },
  }), { demo: true })
  expect(result.status).toBe('stored')
  core.process()
}

function observe(core: HomeAiCore, entityId: string, value: StateValue, at: string): void {
  const result = core.ingest(makeEvent({
    kind: 'state.changed',
    source: { id: 'test-ha', kind: 'ha', native_id: `${entityId}:${at}` },
    occurred_at: at,
    received_at: at,
    delivery: 'live',
    quality: quality('system', 1, ['SENSOR_DOMAIN']),
    payload: { entity_id: entityId, before: null, after: value, effect_of_operation_id: null },
  }), { demo: true })
  expect(result.status).toBe('stored')
  core.process()
}

const windowValue = (state: 'on' | 'off' | 'unavailable' | 'unknown', at: string): StateValue => ({
  state: state === 'on' || state === 'off' ? state : null,
  attributes: { device_class: 'window' },
  source_updated_at: at,
  availability: state === 'on' || state === 'off' ? 'available' : state,
})

const byAgent = (core: HomeAiCore, agent: StoredProposal['agent_key']) =>
  core.proposals.list({ includePersonal: true, limit: 200 }).filter((p) => p.agent_key === agent)

const RAIN_CLAIM = /piov|pioggia/i

describe('T29 — pioggia e finestra di esposizione regolata', () => {
  const cases: { name: string; rain: [string, string]; expected: [string, string] }[] = [
    { name: 'pioggia nel mezzo della finestra', rain: ['2026-10-12T18:00:00Z', '2026-10-12T20:00:00Z'], expected: ['22:00', '23:00'] },
    { name: 'pioggia all’inizio, asciutto prima della finestra', rain: ['2026-10-12T18:00:00Z', '2026-10-12T19:00:00Z'], expected: ['21:00', '23:00'] },
  ]
  for (const { name, rain, expected } of cases) {
    it(`T29 ${name}: il momento suggerito resta dentro la finestra consentita (20:00–23:00)`, async () => {
      const { core, clock } = await home('2026-10-12T17:30:00Z')
      activate(core, wasteCalendar({ from: '20:00', until: '23:00' }, '20:00'))
      // Dalle 17:00 alle 20:00 locali è asciutto, ma è prima della finestra: non va proposto.
      const forecast = snapshot('2026-10-12T17:30:00Z', '2026-10-12T20:30:00Z', hourly('2026-10-12T15:00:00Z', 9, [rain]))
      core.setForecastPort({ id: 'test', read: async () => forecast })
      await core.tick()
      clock.set('2026-10-12T18:00:00Z') // 20:00 locali: matura il promemoria
      await core.tick()

      const [reminder] = byAgent(core, 'waste')
      expect(reminder.state).toBe('visible')
      const occurrence = core.waste.get(reminder.occurrence_id!)!
      // Il meteo non sposta né annulla la raccolta.
      expect(occurrence.collection_date).toBe('2026-10-13')
      expect(reminder.expires_at).toBe(occurrence.exposure_until)
      expect(reminder.steps[0]).toMatchObject({ earliest_at: occurrence.exposure_from, latest_at: occurrence.exposure_until })

      const match = /puoi esporre fra le (\d{2}:\d{2}) e le (\d{2}:\d{2})/.exec(reminder.explanation)
      expect(match, reminder.explanation).not.toBeNull()
      expect([match![1], match![2]]).toEqual(expected)
      const from = zonedInstant('2026-10-12', match![1], TZ).instant.getTime()
      const until = zonedInstant('2026-10-12', match![2], TZ).instant.getTime()
      expect(from).toBeGreaterThanOrEqual(Date.parse(occurrence.exposure_from))
      expect(until).toBeLessThanOrEqual(Date.parse(occurrence.exposure_until))
      expect(until).toBeGreaterThan(from)
    })
  }

  it('T29 pioggia per tutta la finestra: nessuna alternativa fuori orario, il promemoria resta e spiega il vincolo', async () => {
    const { core, clock } = await home('2026-10-12T17:30:00Z')
    activate(core, wasteCalendar({ from: '20:00', until: '23:00' }, '20:00'))
    const forecast = snapshot('2026-10-12T17:30:00Z', '2026-10-12T20:30:00Z',
      hourly('2026-10-12T15:00:00Z', 9, [['2026-10-12T18:00:00Z', '2026-10-12T21:00:00Z']]))
    core.setForecastPort({ id: 'test', read: async () => forecast })
    await core.tick()
    clock.set('2026-10-12T18:00:00Z')
    await core.tick()

    const [reminder] = byAgent(core, 'waste')
    expect(reminder.state).toBe('visible')
    expect(reminder.explanation).not.toMatch(/puoi esporre/)
    expect(reminder.explanation).toMatch(/non c.è un momento alternativo consentito/)
    expect(reminder.explanation).toMatch(/il promemoria resta valido/)
    expect(reminder.explanation).toMatch(/dalle 20:00 alle 23:00/)
    expect(core.waste.get(reminder.occurrence_id!)?.collection_date).toBe('2026-10-13')
  })
})

describe('T30 — meteo corrente o previsione scaduta', () => {
  it('T30 solo meteo corrente: lo stato di weather.* non diventa una previsione di pioggia', async () => {
    const { core, clock } = await home('2026-10-12T18:50:00Z')
    core.catalog.replace([...DEMO_ENTITIES, { entity_id: 'weather.casa', domain: 'weather', label: 'Meteo casa', area_id: null, role: 'sensor', capabilities: [] }], '2026-10-12T18:50:00Z')
    observe(core, 'weather.casa', { state: 'rainy', attributes: { temperature: 14 }, source_updated_at: '2026-10-12T18:50:00Z', availability: 'available' }, '2026-10-12T18:50:00Z')
    observe(core, WINDOW, windowValue('on', '2026-10-12T18:50:00Z'), '2026-10-12T18:50:00Z')
    activate(core, wasteCalendar({ from: '20:00', until: '22:00' }, '21:00'))
    await core.tick()
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()

    const { context, candidates } = core.evaluate({ kind: 'review' })
    expect(context.forecast).toBeNull()
    expect(context.states.find((s) => s.entity_id === 'weather.casa')?.value.state).toBe('rainy')
    expect(candidates.filter((c) => c.agent_key === 'weather')).toEqual([])
    expect(byAgent(core, 'weather')).toEqual([])
    const [reminder] = byAgent(core, 'waste')
    expect(reminder.state).toBe('visible')
    expect(reminder.explanation).not.toMatch(RAIN_CLAIM)
    expect(core.health(HEALTH_INPUT).forecast).not.toBe('available')
  })

  const expired = [
    { name: 'oltre la validità di 3 ore dall’acquisizione', fetched: '2026-10-12T15:00:00Z', expires: '2026-10-13T03:00:00Z' },
    { name: 'oltre la scadenza dichiarata dalla fonte', fetched: '2026-10-12T18:30:00Z', expires: '2026-10-12T18:50:00Z' },
  ]
  for (const { name, fetched, expires } of expired) {
    it(`T30 previsione scaduta (${name}): nessuna affermazione su pioggia futura`, async () => {
      const { core, clock } = await home('2026-10-12T18:55:00Z')
      // Pioggia "prevista" stasera e domani, ma il dato non è più valido.
      publishForecast(core, snapshot(fetched, expires, hourly('2026-10-12T15:00:00Z', 36, [
        ['2026-10-12T18:00:00Z', '2026-10-12T23:00:00Z'], ['2026-10-13T05:00:00Z', '2026-10-13T12:00:00Z'],
      ])))
      observe(core, WINDOW, windowValue('on', '2026-10-12T18:55:00Z'), '2026-10-12T18:55:00Z')
      activate(core, wasteCalendar({ from: '20:00', until: '22:00' }, '21:00'))
      await core.tick()
      clock.set('2026-10-12T19:00:00Z')
      await core.tick()

      const { context, candidates } = core.evaluate({ kind: 'review' })
      expect(context.forecast?.valid).toBe(false)
      expect(candidates.filter((c) => c.agent_key === 'weather')).toEqual([])
      expect(byAgent(core, 'weather')).toEqual([])
      const [reminder] = byAgent(core, 'waste')
      expect(reminder.explanation).not.toMatch(RAIN_CLAIM)
      expect(core.health(HEALTH_INPUT).forecast).toBe('unavailable')
    })
  }

  it('T30 quando la previsione scade, il suggerimento meteo già mostrato viene ritirato e non riproposto', async () => {
    const { core, clock } = await home('2026-10-12T18:55:00Z')
    observe(core, WINDOW, windowValue('on', '2026-10-12T18:50:00Z'), '2026-10-12T18:50:00Z')
    publishForecast(core, snapshot('2026-10-12T18:55:00Z', '2026-10-12T21:55:00Z',
      hourly('2026-10-12T18:00:00Z', 8, [['2026-10-12T20:00:00Z', '2026-10-12T23:00:00Z']])))
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    const [shown] = byAgent(core, 'weather')
    expect(shown.state).toBe('visible')
    expect(shown.explanation).toMatch(/fra le 22:00 e le 01:00/)

    clock.set('2026-10-12T22:00:00Z') // previsione acquisita più di 3 ore fa
    await core.tick()
    const after = core.proposals.get(shown.proposal_id)!
    expect(after.state).toBe('withdrawn')
    expect(after.reason_codes).toContain('FORECAST_NO_LONGER_VALID')
    expect(core.evaluate({ kind: 'review' }).candidates.filter((c) => c.agent_key === 'weather')).toEqual([])
    expect(byAgent(core, 'weather').filter((p) => p.state === 'visible')).toEqual([])
  })
})

describe('T31 — previsione giornaliera', () => {
  it('T31 previsione solo giornaliera: nessuna finestra oraria precisa inventata', async () => {
    const { core, clock } = await home('2026-10-12T18:55:00Z')
    const daily = (from: string, until: string): ForecastPoint => ({
      from, until, resolution: 'daily', condition: 'rainy', rain_probability: 0.8, precipitation_mm: null, temperature_c: null, wind_kmh: null,
    })
    publishForecast(core, snapshot('2026-10-12T18:55:00Z', '2026-10-12T21:55:00Z', [
      daily('2026-10-11T22:00:00Z', '2026-10-12T22:00:00Z'), // lunedì 12, giornata locale
      daily('2026-10-12T22:00:00Z', '2026-10-13T22:00:00Z'), // martedì 13
    ]))
    observe(core, WINDOW, windowValue('on', '2026-10-12T18:45:00Z'), '2026-10-12T18:45:00Z')
    activate(core, wasteCalendar({ from: '20:00', until: '22:00' }, '21:00'))
    await core.tick()
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()

    const [reminder] = byAgent(core, 'waste')
    expect(reminder.explanation).toMatch(/nella giornata/)
    expect(reminder.explanation).toMatch(/non indica l.ora/)
    expect(reminder.explanation).not.toMatch(/puoi esporre/)
    expect(reminder.explanation).not.toMatch(/pioggia fra le/)

    const [weather] = byAgent(core, 'weather')
    expect(weather.explanation).toMatch(/senza orario preciso/)
    expect(weather.explanation).not.toMatch(/\d{1,2}:\d{2}/)
  })
})

describe('T32 — finestra non disponibile', () => {
  for (const availability of ['unavailable', 'unknown'] as const) {
    it(`T32 finestra ${availability}: con pioggia valida non viene trattata come aperta`, async () => {
      const { core } = await home('2026-10-12T19:00:00Z')
      publishForecast(core, snapshot('2026-10-12T18:55:00Z', '2026-10-12T21:55:00Z',
        hourly('2026-10-12T18:00:00Z', 8, [['2026-10-12T20:00:00Z', '2026-10-12T23:00:00Z']])))
      observe(core, WINDOW, windowValue(availability, '2026-10-12T18:58:00Z'), '2026-10-12T18:58:00Z')
      expect(core.evaluate({ kind: 'review' }).candidates.filter((c) => c.agent_key === 'weather')).toEqual([])
      expect(byAgent(core, 'weather')).toEqual([])

      // Controprova: la stessa previsione con la finestra osservata aperta produce il suggerimento.
      observe(core, WINDOW, windowValue('on', '2026-10-12T18:59:00Z'), '2026-10-12T18:59:00Z')
      expect(core.evaluate({ kind: 'review' }).candidates.filter((c) => c.agent_key === 'weather')).toHaveLength(1)
    })
  }

  it('T32 finestra che diventa unavailable: il suggerimento non viene ritirato come se fosse chiusa', async () => {
    const { core, clock } = await home('2026-10-12T18:55:00Z')
    publishForecast(core, snapshot('2026-10-12T18:55:00Z', '2026-10-12T21:55:00Z',
      hourly('2026-10-12T18:00:00Z', 8, [['2026-10-12T20:00:00Z', '2026-10-12T23:00:00Z']])))
    observe(core, WINDOW, windowValue('on', '2026-10-12T18:50:00Z'), '2026-10-12T18:50:00Z')
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    const [shown] = byAgent(core, 'weather')
    expect(shown.state).toBe('visible')

    observe(core, WINDOW, windowValue('unavailable', '2026-10-12T19:05:00Z'), '2026-10-12T19:05:00Z')
    clock.set('2026-10-12T19:05:00Z')
    await core.tick()
    let current = core.proposals.get(shown.proposal_id)!
    expect(current.state).toBe('visible')
    expect(current.reason_codes).not.toContain('CONDITION_RESOLVED')

    // Solo una chiusura osservata e disponibile risolve la condizione.
    observe(core, WINDOW, windowValue('off', '2026-10-12T19:10:00Z'), '2026-10-12T19:10:00Z')
    clock.set('2026-10-12T19:10:00Z')
    await core.tick()
    current = core.proposals.get(shown.proposal_id)!
    expect(current.state).toBe('withdrawn')
    expect(current.reason_codes).toContain('CONDITION_RESOLVED')
  })
})
