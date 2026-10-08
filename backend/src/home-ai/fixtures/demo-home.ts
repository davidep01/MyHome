import type { ObservedEvent, StateValue, WasteCalendar } from '../domain/contracts.js'
import { seededRandom } from '../domain/ids.js'
import { addDays, weekdayOf, zonedInstant } from '../domain/time.js'
import { makeEvent, quality } from '../ingestion/normalize.js'
import type { CatalogEntry } from '../context/catalog.js'

/**
 * Dataset dimostrativo `demo-home-v1` — DATI SINTETICI.
 *
 * Abitanti, entità, orari, raccolte e meteo sono inventati e non descrivono
 * alcuna casa reale né il calendario di alcun comune. Ogni evento è marcato
 * `source.kind: 'fixture'` e `delivery: 'replay'`, e nel database con `demo = 1`.
 *
 * Il generatore è deterministico (seed fisso) e relativo a una data finale:
 * gli stessi parametri producono sempre gli stessi eventi. Contiene di
 * proposito: 11 rientri serali (10 coperti, 1 con gap), 8 ripetizioni della
 * sequenza ingresso → soggiorno → clima, 2 controesempi, flapping della
 * presenza, telemetria duplicata, eventi fuori ordine e tardivi, una sessione
 * slider, dieci click in un minuto, un'automazione esistente all'arrivo, un
 * cambio da altro client (solo user_id) e uno da interruttore fisico.
 */

export const DEMO_DATASET = 'demo-home-v1'
const TZ = 'Europe/Rome'
const SEED = 20261008

export const DEMO_ENTITIES: CatalogEntry[] = [
  { entity_id: 'person.demo_abitante_1', domain: 'person', label: 'Abitante dimostrativo 1', area_id: null, role: 'presence', capabilities: [] },
  { entity_id: 'person.demo_abitante_2', domain: 'person', label: 'Abitante dimostrativo 2', area_id: null, role: 'presence', capabilities: [] },
  { entity_id: 'binary_sensor.demo_porta_ingresso', domain: 'binary_sensor', label: 'Porta d’ingresso (demo)', area_id: 'demo_ingresso', role: 'door', capabilities: [] },
  { entity_id: 'binary_sensor.demo_finestra_studio', domain: 'binary_sensor', label: 'Finestra dello studio (demo)', area_id: 'demo_studio', role: 'window', capabilities: [] },
  { entity_id: 'light.demo_ingresso', domain: 'light', label: 'Luce ingresso (demo)', area_id: 'demo_ingresso', role: 'light', capabilities: ['lighting.set'] },
  { entity_id: 'light.demo_soggiorno', domain: 'light', label: 'Luce soggiorno (demo)', area_id: 'demo_soggiorno', role: 'light', capabilities: ['lighting.set'] },
  { entity_id: 'light.demo_portico', domain: 'light', label: 'Luce portico (demo)', area_id: 'demo_esterno', role: 'light', capabilities: ['lighting.set'] },
  { entity_id: 'climate.demo_soggiorno', domain: 'climate', label: 'Clima soggiorno (demo)', area_id: 'demo_soggiorno', role: 'climate', capabilities: ['climate.set_mode', 'climate.set_temperature'] },
  { entity_id: 'media_player.demo_tv', domain: 'media_player', label: 'TV soggiorno (demo)', area_id: 'demo_soggiorno', role: 'media', capabilities: ['media.set'] },
]

export function demoWasteCalendar(endDate: string, acquiredAt: string): WasteCalendar {
  return {
    schema_version: 1,
    calendar_id: 'demo-waste',
    revision: 1,
    municipality: 'Comune dimostrativo',
    area: 'Zona dimostrativa',
    timezone: TZ,
    valid_from: addDays(endDate, -30),
    valid_until: addDays(endDate, 80),
    source: { kind: 'manual', reference: DEMO_DATASET, document_url: null, checksum: null, acquired_at: acquiredAt },
    approval: { state: 'draft', actor_id: null, confirmed_at: null },
    fractions: [{ id: 'organico', label: 'Organico' }, { id: 'carta', label: 'Carta' }],
    rules: [
      {
        rule_id: 'demo-organico',
        fraction_id: 'organico',
        recurrence: { kind: 'rrule', dtstart: '2026-10-06', value: 'FREQ=WEEKLY;BYDAY=TU' },
        collection_time: '07:00',
        exposure: { start_day_offset: -1, start_time: '20:00', end_day_offset: -1, end_time: '22:00' },
        reminders: [{ day_offset: -1, at: '21:00' }],
      },
      {
        rule_id: 'demo-carta',
        fraction_id: 'carta',
        recurrence: { kind: 'rrule', dtstart: '2026-10-01', value: 'FREQ=WEEKLY;BYDAY=TH' },
        collection_time: null,
        exposure: { start_day_offset: -1, start_time: '20:00', end_day_offset: -1, end_time: '23:00' },
        reminders: [{ day_offset: -1, at: '20:30' }],
      },
    ],
    exceptions: [],
    demo: true,
  }
}

interface Ctx { events: ObservedEvent[]; seq: number; until: number; rand: () => number }

const FIXTURE_SOURCE = (native: string | null) => ({ id: 'demo-fixture', kind: 'fixture' as const, native_id: native })

function instant(date: string, time: string, extraSeconds = 0): Date {
  return new Date(zonedInstant(date, time, TZ).instant.getTime() + extraSeconds * 1_000)
}

function sv(state: string | null, attributes: Record<string, string | number | boolean | null> = {}, at: Date | null = null): StateValue {
  return { state, attributes, source_updated_at: at ? at.toISOString() : null, availability: state === null ? 'unknown' : 'available' }
}

function push(ctx: Ctx, event: ObservedEvent): void {
  if (Date.parse(event.occurred_at) > ctx.until) return
  ctx.events.push(event)
}

function presence(ctx: Ctx, subject: 1 | 2, status: 'home' | 'away', at: Date): void {
  ctx.seq += 1
  push(ctx, makeEvent({
    event_id: `demo-evt-${ctx.seq}`,
    kind: 'presence.signal',
    source: FIXTURE_SOURCE(`presence-${ctx.seq}`),
    occurred_at: at.toISOString(),
    received_at: new Date(at.getTime() + 500).toISOString(),
    delivery: 'replay',
    quality: quality('system', 1, ['SYNTHETIC_PRESENCE']),
    payload: { presence_source_id: `demo-presence-${subject}`, status, subject_id: null },
  }))
  stateChange(ctx, `person.demo_abitante_${subject}`, status === 'home' ? 'home' : 'not_home', at, 'system')
}

function stateChange(ctx: Ctx, entityId: string, state: string, at: Date, attribution: 'system' | 'automation' | 'manual_likely' | 'unknown' | 'manual_confirmed', extra: { op?: string; contextId?: string; attributes?: Record<string, string | number | boolean | null> } = {}): void {
  ctx.seq += 1
  const reasons = attribution === 'automation' ? ['SYNTHETIC_AUTOMATION', 'HA_PARENT_CONTEXT']
    : attribution === 'manual_likely' ? ['SYNTHETIC_OTHER_CLIENT', 'HA_USER_ID_ONLY']
      : attribution === 'unknown' ? ['SYNTHETIC_PHYSICAL_SWITCH', 'NO_ORIGIN_EVIDENCE']
        : attribution === 'manual_confirmed' ? ['EFFECT_OF_DASHBOARD_OPERATION'] : ['SYNTHETIC_SENSOR']
  push(ctx, makeEvent({
    event_id: `demo-evt-${ctx.seq}`,
    kind: 'state.changed',
    source: FIXTURE_SOURCE(`state-${ctx.seq}`),
    occurred_at: at.toISOString(),
    received_at: new Date(at.getTime() + 300).toISOString(),
    delivery: 'replay',
    quality: quality(attribution, attribution === 'automation' ? 0.8 : attribution === 'manual_likely' ? 0.5 : attribution === 'unknown' ? 0 : 1, reasons),
    context: { id: extra.contextId ?? null, parent_id: attribution === 'automation' ? `demo-auto-parent-${ctx.seq}` : null },
    payload: { entity_id: entityId, before: null, after: sv(state, extra.attributes ?? {}, at), effect_of_operation_id: extra.op ?? null },
  }))
}

function intent(ctx: Ctx, opId: string, actionKey: string, targets: string[], requested: Record<string, string | number>, at: Date, opts: { control?: 'button' | 'toggle' | 'slider'; receivedDelayMs?: number; effectState?: string | null; result?: 'accepted' | 'failed' | 'unknown' } = {}): void {
  ctx.seq += 1
  const received = new Date(at.getTime() + (opts.receivedDelayMs ?? 120))
  push(ctx, makeEvent({
    event_id: `demo-evt-${ctx.seq}`,
    kind: 'manual.intent',
    source: FIXTURE_SOURCE(`${opId}:intent`),
    occurred_at: at.toISOString(),
    received_at: received.toISOString(),
    delivery: 'replay',
    scope: { kind: 'household', subject_id: null },
    actor_id: 'device-kiosk',
    quality: quality('manual_confirmed', 1, ['SYNTHETIC_AUTHENTICATED_GESTURE', 'SHARED_DEVICE']),
    payload: { operation_id: opId, interaction_id: `${opId}-tap`, control: opts.control ?? 'button', action_key: actionKey, target_entity_ids: targets, requested },
  }))
  ctx.seq += 1
  const contextId = `demo-ctx-${opId}`
  push(ctx, makeEvent({
    event_id: `demo-evt-${ctx.seq}`,
    kind: 'manual.result',
    source: FIXTURE_SOURCE(`${opId}:result`),
    occurred_at: new Date(at.getTime() + 400).toISOString(),
    received_at: new Date(received.getTime() + 400).toISOString(),
    delivery: 'replay',
    actor_id: 'device-kiosk',
    quality: quality('manual_confirmed', 1, ['MANUAL_PATH_RESULT']),
    context: { id: contextId, parent_id: null },
    payload: { operation_id: opId, result: opts.result ?? 'accepted', reason_code: opts.result === 'unknown' ? 'TIMEOUT' : null, ha_context_id: opts.result === 'unknown' ? null : contextId },
  }))
  if (opts.effectState !== null && (opts.result ?? 'accepted') === 'accepted') {
    for (const target of targets) {
      stateChange(ctx, target, opts.effectState ?? String(requested.state ?? 'on'), new Date(at.getTime() + 900), 'manual_confirmed', { op: opId, contextId })
    }
  }
}

function coverageGap(ctx: Ctx, from: Date, until: Date): void {
  for (const [at, end] of [[from, null], [until, until]] as const) {
    ctx.seq += 1
    push(ctx, makeEvent({
      event_id: `demo-evt-${ctx.seq}`,
      kind: 'coverage.gap',
      source: FIXTURE_SOURCE(`gap-${ctx.seq}`),
      occurred_at: at.toISOString(),
      received_at: at.toISOString(),
      delivery: 'replay',
      quality: quality('system', 1, ['SYNTHETIC_DISCONNECTION'], 'partial'),
      payload: { source_id: 'ha', from: from.toISOString(), until: end ? end.toISOString() : null, reason_code: end ? 'HA_RECONNECTED' : 'HA_DISCONNECTED' },
    }))
  }
}

export interface DemoDataset {
  events: ObservedEvent[]
  entities: CatalogEntry[]
  calendar: WasteCalendar
  /** Ultimo istante coperto dal dataset. */
  until: string
}

/**
 * @param endDate data civile finale (inclusa) del periodo di 21 giorni
 * @param until   istante oltre il quale nessun evento viene generato
 */
export function buildDemoDataset(endDate: string, until: Date): DemoDataset {
  const ctx: Ctx = { events: [], seq: 0, until: until.getTime(), rand: seededRandom(SEED) }
  const start = addDays(endDate, -20)
  const days = Array.from({ length: 21 }, (_, i) => addDays(start, i))
  const weekdays = days.filter((d) => weekdayOf(d) <= 5)
  const stayHome = new Set([weekdays[2], weekdays[6], weekdays[9], weekdays[13]])
  let arrivalIndex = 0
  let eligibleIndex = 0
  let op = 0
  const nextOp = () => `demo-op-${String(++op).padStart(4, '0')}`

  // Stato iniziale: tutti a casa, finestra chiusa.
  presence(ctx, 1, 'home', instant(start, '00:00', -3_600))
  presence(ctx, 2, 'home', instant(start, '00:00', -3_590))
  stateChange(ctx, 'binary_sensor.demo_finestra_studio', 'off', instant(start, '00:00', -3_500), 'system')

  for (const date of days) {
    const weekday = weekdayOf(date)
    if (weekday <= 5 && !stayHome.has(date)) {
      // Uscite del mattino: la casa resta vuota dalle 08:15.
      presence(ctx, 1, 'away', instant(date, '07:45'))
      presence(ctx, 2, 'away', instant(date, '08:15'))

      const jitter = Math.floor(ctx.rand() * 25 * 60)
      const arrival = new Date(instant(date, '18:00').getTime() + jitter * 1_000)
      const k = arrivalIndex++
      const gap = k === 4
      if (gap) coverageGap(ctx, new Date(arrival.getTime() - 15 * 60_000), new Date(arrival.getTime() + 40 * 60_000))

      // Porta prima dell'arrivo; flapping della presenza nel secondo rientro (T13).
      stateChange(ctx, 'binary_sensor.demo_porta_ingresso', 'on', new Date(arrival.getTime() - 20_000), 'system')
      stateChange(ctx, 'binary_sensor.demo_porta_ingresso', 'off', new Date(arrival.getTime() + 15_000), 'system')
      if (k === 1) {
        presence(ctx, 1, 'home', new Date(arrival.getTime() - 60_000))
        presence(ctx, 1, 'away', new Date(arrival.getTime() - 30_000))
      }
      presence(ctx, 1, 'home', arrival)
      // Automazione esistente: accende il portico all'arrivo (T08).
      stateChange(ctx, 'light.demo_portico', 'on', new Date(arrival.getTime() + 5_000), 'automation')

      const j = gap ? -1 : eligibleIndex++
      const counterexample = j === 3 || j === 8
      if (!counterexample) {
        const ingressoAt = new Date(arrival.getTime() + 80_000)
        const soggiornoAt = new Date(arrival.getTime() + 130_000)
        const climaAt = new Date(arrival.getTime() + 360_000)
        const opIngresso = nextOp()
        const opSoggiorno = nextOp()
        if (j === 6) {
          // Eventi fuori ordine (T10): il secondo gesto arriva al core prima del primo.
          intent(ctx, opSoggiorno, 'lighting.on', ['light.demo_soggiorno'], { state: 'on' }, soggiornoAt, { receivedDelayMs: 10 })
          intent(ctx, opIngresso, 'lighting.on', ['light.demo_ingresso'], { state: 'on' }, ingressoAt, { receivedDelayMs: 60_000 })
        } else if (j === 2) {
          intent(ctx, opIngresso, 'lighting.on', ['light.demo_ingresso'], { state: 'on' }, ingressoAt)
          // Evento tardivo oltre la finestra di riordino (T11): arriva 25 minuti dopo.
          intent(ctx, opSoggiorno, 'lighting.on', ['light.demo_soggiorno'], { state: 'on' }, soggiornoAt, { receivedDelayMs: 25 * 60_000 })
        } else {
          intent(ctx, opIngresso, 'lighting.on', ['light.demo_ingresso'], { state: 'on' }, ingressoAt)
          intent(ctx, opSoggiorno, 'lighting.on', ['light.demo_soggiorno'], { state: 'on' }, soggiornoAt)
        }
        if (j === 5) {
          // Retry della stessa telemetria (T02): stesso operation_id, un solo evento logico.
          intent(ctx, opSoggiorno, 'lighting.on', ['light.demo_soggiorno'], { state: 'on' }, soggiornoAt, { effectState: null })
        }
        intent(ctx, nextOp(), 'climate.mode', ['climate.demo_soggiorno'], { hvac_mode: 'heat' }, climaAt, { effectState: 'heat' })
        if (j === 7) {
          // Slider: sei aggiornamenti dello stesso gesto in 10 secondi = una sessione (T05).
          for (let s = 0; s < 6; s += 1) {
            intent(ctx, nextOp(), 'climate.temperature', ['climate.demo_soggiorno'], { temperature: 20 + s * 0.5 }, new Date(climaAt.getTime() + 40_000 + s * 1_800), { control: 'slider', effectState: 'heat' })
          }
        }
      } else if (j === 8) {
        intent(ctx, nextOp(), 'media.play', ['media_player.demo_tv'], { state: 'playing' }, new Date(arrival.getTime() + 200_000), { effectState: 'playing' })
      }

      // Secondo abitante: rientra con la casa già occupata (non è un rientro del nucleo).
      presence(ctx, 2, 'home', instant(date, '19:30'))
      stateChange(ctx, 'light.demo_ingresso', 'off', instant(date, '23:10'), 'unknown')
      stateChange(ctx, 'light.demo_soggiorno', 'off', instant(date, '23:15'), 'manual_likely')
    } else if (weekday >= 6) {
      presence(ctx, 1, 'away', instant(date, '10:00'))
      presence(ctx, 2, 'away', instant(date, '10:05'))
      presence(ctx, 1, 'home', instant(date, '15:00', Math.floor(ctx.rand() * 600)))
      presence(ctx, 2, 'home', instant(date, '15:20'))
      intent(ctx, nextOp(), 'media.play', ['media_player.demo_tv'], { state: 'playing' }, instant(date, '15:04'), { effectState: 'playing' })
    }
  }

  // Click con luce già accesa (T03), timeout del percorso manuale (T04), dieci click in un minuto (T16).
  const lastWeekday = weekdays[weekdays.length - 2]
  intent(ctx, nextOp(), 'lighting.on', ['light.demo_soggiorno'], { state: 'on' }, instant(lastWeekday, '21:00'), { effectState: null })
  intent(ctx, nextOp(), 'lighting.off', ['light.demo_soggiorno'], { state: 'off' }, instant(lastWeekday, '21:05'), { result: 'unknown' })
  for (let i = 0; i < 10; i += 1) {
    intent(ctx, nextOp(), 'lighting.toggle', ['light.demo_soggiorno'], {}, instant(lastWeekday, '21:20', i * 6), { control: 'toggle', effectState: i % 2 ? 'off' : 'on' })
  }

  // Finestra dello studio aperta poco prima della fine del dataset.
  stateChange(ctx, 'binary_sensor.demo_finestra_studio', 'on', new Date(until.getTime() - 2 * 60_000), 'system')

  // Previsione sintetica: pioggia fra +2h e +3h, dati orari; scade dopo 3 ore.
  ctx.seq += 1
  const fetched = new Date(until.getTime() - 60_000)
  const hour = 3_600_000
  const base = Math.floor(fetched.getTime() / hour) * hour
  push(ctx, makeEvent({
    event_id: `demo-evt-${ctx.seq}`,
    kind: 'forecast.updated',
    source: FIXTURE_SOURCE(`forecast-${fetched.toISOString()}`),
    occurred_at: fetched.toISOString(),
    received_at: fetched.toISOString(),
    delivery: 'replay',
    quality: quality('system', 1, ['SYNTHETIC_FORECAST']),
    payload: {
      forecast_source_id: 'demo-forecast',
      issued_at: new Date(fetched.getTime() - 30 * 60_000).toISOString(),
      fetched_at: fetched.toISOString(),
      expires_at: new Date(fetched.getTime() + 3 * hour).toISOString(),
      points: Array.from({ length: 12 }, (_, i) => ({
        from: new Date(base + i * hour).toISOString(),
        until: new Date(base + (i + 1) * hour).toISOString(),
        resolution: 'hourly' as const,
        condition: i === 2 || i === 3 ? 'rainy' : 'cloudy',
        rain_probability: i === 2 || i === 3 ? 0.75 : 0.1,
        precipitation_mm: i === 2 || i === 3 ? 1.6 : 0,
        temperature_c: 16 - i * 0.3,
        wind_kmh: 9,
      })),
    },
  }))

  ctx.events.sort((a, b) => a.received_at.localeCompare(b.received_at) || a.event_id.localeCompare(b.event_id))
  return { events: ctx.events, entities: DEMO_ENTITIES, calendar: demoWasteCalendar(endDate, start + 'T08:00:00Z'), until: until.toISOString() }
}
