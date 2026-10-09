import { describe, expect, it } from 'vitest'
import type { HomeAiCore } from '../core.js'
import type { CoreConfig } from '../config.js'
import type { WasteCalendar, WasteRule } from '../domain/contracts.js'
import { addDays, daysBetween, inTimeWindow, localParts, offsetMinutes, weekdayOf, zonedInstant } from '../domain/time.js'
import { json } from '../storage/db.js'
import { resolveOccurrences } from '../waste/calendar.js'
import { parseWasteIcs, type IcsImportOptions } from '../waste/ics.js'
import { expandRRule } from '../waste/rrule.js'
import type { StoredOccurrence } from '../waste/service.js'
import { newCore } from './helpers.js'

/**
 * Test del tempo (specifica §26): mezzanotte, cambio di mese e anno, timezone
 * diverse, ora legale a Roma il 29/03/2026 e il 25/10/2026, ore civili
 * inesistenti e ripetute, risoluzione dichiarata nell'anteprima.
 *
 * Politica del scheduler (§26): ora inesistente → primo istante locale valido
 * se ancora utile, altrimenti scade; ora ambigua → la PRIMA occorrenza, mai
 * due promemoria.
 */

const TZ = 'Europe/Rome'
const OPTS = { tz: TZ, horizonDays: 60, realHome: false }

const suggest = (config: CoreConfig) => {
  config.runtime.mode = 'suggest'
  config.attention.quiet_hours = { from: '00:00', until: '00:00' }
}

function rule(patch: Partial<WasteRule> & Pick<WasteRule, 'recurrence'>): WasteRule {
  return {
    rule_id: 'regola',
    fraction_id: 'organico',
    collection_time: '07:00',
    exposure: { start_day_offset: -1, start_time: '20:00', end_day_offset: -1, end_time: '22:00' },
    reminders: [{ day_offset: -1, at: '21:00' }],
    ...patch,
  }
}

function calendarWith(rules: WasteRule[], patch: Partial<WasteCalendar> = {}): WasteCalendar {
  return {
    schema_version: 1,
    calendar_id: 'tempo',
    revision: 1,
    municipality: 'Comune di prova',
    area: 'Zona A',
    timezone: TZ,
    valid_from: '2026-01-01',
    valid_until: '2027-12-31',
    source: { kind: 'manual', reference: 'inserimento-manuale', document_url: null, checksum: null, acquired_at: '2026-01-01T08:00:00Z' },
    approval: { state: 'approved', actor_id: 'test-admin', confirmed_at: '2026-01-01T08:00:00Z' },
    fractions: [{ id: 'organico', label: 'Organico' }, { id: 'carta', label: 'Carta' }, { id: 'vetro', label: 'Vetro' }],
    rules,
    exceptions: [],
    demo: false,
    ...patch,
  }
}

const resolve = (calendar: WasteCalendar, today: string, horizonDays = 60) =>
  resolveOccurrences(calendar, { today, horizonDays, realHome: false })

function activate(core: HomeAiCore, calendar: WasteCalendar) {
  const saved = core.waste.saveDraft(calendar, OPTS)
  core.waste.approve(saved.calendar.calendar_id, saved.calendar.revision, 'test-admin', { ...OPTS, demo: false })
  return saved
}

const reminders = (core: HomeAiCore) => core.proposals.list({ includePersonal: true, limit: 200 }).filter((p) => p.agent_key === 'waste')
const occurrences = (core: HomeAiCore) => core.store.all('SELECT body FROM waste_occurrences').map((row) => json<StoredOccurrence>(row.body))

function withHostTimezone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = tz
  try { return fn() } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

describe('TEMPO — mezzanotte', () => {
  it('TEMPO mezzanotte: il giorno civile cambia alla mezzanotte locale, non a quella UTC', () => {
    expect(localParts(new Date('2026-10-12T21:59:00Z'), TZ)).toMatchObject({ date: '2026-10-12', time: '23:59', weekday: 1 })
    expect(localParts(new Date('2026-10-12T22:00:00Z'), TZ)).toMatchObject({ date: '2026-10-13', time: '00:00', weekday: 2 })
    // Capodanno in ora solare: a Roma è già il 2027 mentre in UTC è ancora il 2026.
    expect(localParts(new Date('2026-12-31T23:00:00Z'), TZ)).toMatchObject({ date: '2027-01-01', time: '00:00', weekday: 5 })
    // Fasce a cavallo della mezzanotte (es. quiet hours 22:30–07:30).
    expect(inTimeWindow('23:00', '22:30', '07:30')).toBe(true)
    expect(inTimeWindow('00:00', '22:30', '07:30')).toBe(true)
    expect(inTimeWindow('07:29', '22:30', '07:30')).toBe(true)
    expect(inTimeWindow('07:30', '22:30', '07:30')).toBe(false)
    expect(inTimeWindow('22:29', '22:30', '07:30')).toBe(false)
  })

  it('TEMPO mezzanotte: esposizione a cavallo della mezzanotte e promemoria alle 00:00 maturano all’istante locale giusto', async () => {
    const midnight = rule({
      recurrence: { kind: 'dates', dates: ['2026-10-13'] },
      exposure: { start_day_offset: -1, start_time: '22:00', end_day_offset: 0, end_time: '06:00' },
      reminders: [{ day_offset: 0, at: '00:00' }],
    })
    const [occurrence] = resolve(calendarWith([midnight]), '2026-10-12').occurrences
    expect(occurrence.collection_date).toBe('2026-10-13')
    expect(occurrence.exposure_from).toBe('2026-10-12T20:00:00.000Z')
    expect(occurrence.exposure_until).toBe('2026-10-13T04:00:00.000Z')
    expect(occurrence.reminder_at).toBe('2026-10-12T22:00:00.000Z')
    expect(occurrence.time_resolution).toBe('exact')

    const { core, clock } = await newCore('2026-10-12T21:58:00Z', suggest)
    activate(core, calendarWith([midnight]))
    await core.tick()
    clock.set('2026-10-12T21:59:59Z')
    await core.tick()
    expect(reminders(core)).toHaveLength(0)
    clock.set('2026-10-12T22:00:00Z')
    await core.tick()
    clock.set('2026-10-12T22:30:00Z')
    await core.tick()
    expect(reminders(core)).toHaveLength(1)
  })
})

describe('TEMPO — cambio di mese e anno', () => {
  it('TEMPO cambio mese/anno: aritmetica delle date civili, anni bisestili compresi', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
    // I giorni civili non dipendono dal cambio d'ora: 29/03 e 25/10 contano come un giorno.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(weekdayOf('2027-01-01')).toBe(5)
    expect(weekdayOf('2026-10-13')).toBe(2)
  })

  it('TEMPO cambio mese/anno: ricorrenze e “giorno prima” attraversano mese e anno', () => {
    expect(expandRRule('FREQ=WEEKLY;BYDAY=FR', '2026-12-04', '2026-12-20', '2027-01-10')).toEqual(['2026-12-25', '2027-01-01', '2027-01-08'])
    expect(expandRRule('FREQ=MONTHLY;BYDAY=-1TU', '2026-11-01', '2026-11-01', '2027-02-28')).toEqual(['2026-11-24', '2026-12-29', '2027-01-26', '2027-02-23'])
    // Il 31 non esiste in ogni mese: nessuna data inventata (30/11 o 28/02).
    expect(expandRRule('FREQ=MONTHLY;BYMONTHDAY=31', '2026-10-01', '2026-10-01', '2027-03-31')).toEqual(['2026-10-31', '2026-12-31', '2027-01-31', '2027-03-31'])

    const calendar = calendarWith([
      rule({ rule_id: 'organico-martedi', recurrence: { kind: 'rrule', dtstart: '2026-11-03', value: 'FREQ=WEEKLY;BYDAY=TU' } }),
      rule({ rule_id: 'carta-venerdi', fraction_id: 'carta', recurrence: { kind: 'rrule', dtstart: '2026-11-06', value: 'FREQ=WEEKLY;BYDAY=FR' } }),
    ])
    const occ = resolve(calendar, '2026-11-25').occurrences
    const at = (fraction: string, date: string) => occ.find((o) => o.fraction_id === fraction && o.collection_date === date)
    expect(at('organico', '2026-12-01')?.reminder_at).toBe('2026-11-30T20:00:00.000Z')
    expect(at('carta', '2027-01-01')?.reminder_at).toBe('2026-12-31T20:00:00.000Z')
    expect(at('carta', '2027-01-01')?.exposure_from).toBe('2026-12-31T19:00:00.000Z')
    expect(localParts(new Date(at('carta', '2027-01-01')!.reminder_at), TZ)).toMatchObject({ date: '2026-12-31', time: '21:00' })
  })
})

describe('TEMPO — timezone diverse', () => {
  it('TEMPO timezone diverse: la data di raccolta resta civile, l’istante segue la timezone del calendario', () => {
    const tuesday = rule({ recurrence: { kind: 'dates', dates: ['2026-10-13', '2026-10-27', '2026-11-03'] } })
    const expected: Record<string, string> = {
      'Europe/Rome': '2026-10-12T19:00:00.000Z',
      'America/New_York': '2026-10-13T01:00:00.000Z', // in UTC è già martedì: la raccolta resta il 13
      'Asia/Tokyo': '2026-10-12T12:00:00.000Z',
      'Australia/Sydney': '2026-10-12T10:00:00.000Z', // ora legale australe già iniziata il 4/10
    }
    for (const [tz, reminderAt] of Object.entries(expected)) {
      const [first] = resolve(calendarWith([tuesday], { timezone: tz }), '2026-10-10').occurrences
      expect(first.collection_date).toBe('2026-10-13')
      expect(first.reminder_at).toBe(reminderAt)
      expect(localParts(new Date(first.reminder_at), tz)).toMatchObject({ date: '2026-10-12', time: '21:00', weekday: 1 })
    }

    // Cambi d'ora non simultanei: Roma il 25/10, New York l'1/11.
    const reminderOf = (tz: string, date: string) => resolve(calendarWith([tuesday], { timezone: tz }), '2026-10-10').occurrences
      .find((o) => o.collection_date === date)?.reminder_at
    expect(reminderOf('Europe/Rome', '2026-10-27')).toBe('2026-10-26T20:00:00.000Z')
    expect(reminderOf('America/New_York', '2026-10-27')).toBe('2026-10-27T01:00:00.000Z')
    expect(reminderOf('Europe/Rome', '2026-11-03')).toBe('2026-11-02T20:00:00.000Z')
    expect(reminderOf('America/New_York', '2026-11-03')).toBe('2026-11-03T02:00:00.000Z')
  })

  it('TEMPO timezone diverse: un orario ICS senza timezone (floating) non viene letto nella timezone del server', () => {
    const ics = (dtstart: string, extra = '') => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prova//Rifiuti//IT', 'BEGIN:VEVENT',
      'UID:vetro-1@prova.invalid', 'DTSTAMP:20260901T000000Z', dtstart, ...(extra ? [extra] : []), 'SUMMARY:Vetro', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const options: IcsImportOptions = {
      calendar_id: 'ics-tempo', municipality: 'Comune di prova', area: 'Zona A', timezone: TZ,
      valid_from: '2026-10-01', valid_until: '2026-11-30', label_mapping: {},
      exposure: { start_day_offset: -1, start_time: '20:00', end_day_offset: -1, end_time: '22:00' },
      reminders: [{ day_offset: -1, at: '21:00' }], acquired_at: '2026-09-30T08:00:00Z',
    }
    for (const hostTz of ['UTC', 'Europe/Rome', 'America/Los_Angeles', 'Pacific/Auckland']) {
      withHostTimezone(hostTz, () => {
        // Con TZID o in UTC l'orario civile del calendario è certo, ovunque giri il server.
        for (const dtstart of ['DTSTART;TZID=Europe/Rome:20261013T070000', 'DTSTART:20261013T050000Z']) {
          const ok = parseWasteIcs(ics(dtstart), options)
          expect(ok.errors).toEqual([])
          expect(ok.calendar!.rules[0]).toMatchObject({ collection_time: '07:00', recurrence: { kind: 'dates', dates: ['2026-10-13'] } })
        }
        // Floating: né l'ora né il giorno si possono ricavare dal server. Errore visibile, nessuna bozza.
        for (const floating of [ics('DTSTART:20261013T233000'), ics('DTSTART:20261006T233000', 'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3')]) {
          const refused = parseWasteIcs(floating, options)
          expect(refused.calendar).toBeNull()
          expect(refused.errors.join(' ')).toMatch(/timezone/)
        }
      })
    }
  })
})

describe('TEMPO — ora legale Europe/Rome', () => {
  it('TEMPO 29/03/2026: l’ora 02:30 non esiste e passa al primo istante locale valido (03:00)', () => {
    expect(offsetMinutes(new Date('2026-03-29T00:59:59Z'), TZ)).toBe(60)
    expect(offsetMinutes(new Date('2026-03-29T01:00:00Z'), TZ)).toBe(120)
    expect(zonedInstant('2026-03-29', '02:30', TZ)).toEqual({ instant: new Date('2026-03-29T01:00:00Z'), resolution: 'shifted_forward' })
    expect(zonedInstant('2026-03-29', '02:00', TZ)).toEqual({ instant: new Date('2026-03-29T01:00:00Z'), resolution: 'shifted_forward' })
    expect(zonedInstant('2026-03-29', '01:59', TZ)).toEqual({ instant: new Date('2026-03-29T00:59:00Z'), resolution: 'exact' })
    expect(zonedInstant('2026-03-29', '03:00', TZ)).toEqual({ instant: new Date('2026-03-29T01:00:00Z'), resolution: 'exact' })
    expect(localParts(new Date('2026-03-29T01:00:00Z'), TZ).time).toBe('03:00')
  })

  it('TEMPO 29/03/2026: “il giorno prima” è il giorno civile precedente, non 24 ore prima', () => {
    const occ = resolve(calendarWith([rule({ recurrence: { kind: 'dates', dates: ['2026-03-29', '2026-03-30'] } })]), '2026-03-20').occurrences
    const sunday = occ.find((o) => o.collection_date === '2026-03-29')!
    const monday = occ.find((o) => o.collection_date === '2026-03-30')!
    expect(sunday.reminder_at).toBe('2026-03-28T20:00:00.000Z')
    expect(monday.reminder_at).toBe('2026-03-29T19:00:00.000Z')
    expect(Date.parse(monday.reminder_at) - Date.parse(sunday.reminder_at)).toBe(23 * 3_600_000)
    for (const o of [sunday, monday]) {
      expect(localParts(new Date(o.reminder_at), TZ).time).toBe('21:00')
      expect(o.time_resolution).toBe('exact')
    }
  })

  it('TEMPO 29/03/2026: promemoria a ora inesistente ancora utile → primo istante valido, una sola volta, dichiarato nell’anteprima', async () => {
    const night = rule({
      fraction_id: 'vetro',
      recurrence: { kind: 'dates', dates: ['2026-03-29'] },
      collection_time: '06:00',
      exposure: { start_day_offset: 0, start_time: '01:00', end_day_offset: 0, end_time: '05:00' },
      reminders: [{ day_offset: 0, at: '02:30' }],
    })
    const { core, clock } = await newCore('2026-03-28T23:30:00Z', suggest)
    const { preview } = activate(core, calendarWith([night], { valid_from: '2026-03-01', valid_until: '2026-04-30' }))
    expect(preview.dst_adjusted).toEqual([{ date: '2026-03-29', resolution: 'shifted_forward' }])
    expect(preview.occurrences[0]).toMatchObject({ reminder_at: '2026-03-29T01:00:00.000Z', time_resolution: 'shifted_forward' })

    await core.tick()
    clock.set('2026-03-29T00:59:00Z')
    await core.tick()
    expect(reminders(core)).toHaveLength(0)
    clock.set('2026-03-29T01:00:00Z') // 03:00 CEST
    await core.tick()
    clock.set('2026-03-29T01:30:00Z')
    await core.tick()
    const shown = reminders(core)
    expect(shown).toHaveLength(1)
    expect(shown[0].state).toBe('visible')
    expect(occurrences(core).filter((o) => o.state !== 'superseded')).toHaveLength(1)
  })

  it('TEMPO 29/03/2026: promemoria a ora inesistente non più utile → scade senza comparire', async () => {
    const tooLate = rule({
      fraction_id: 'vetro',
      recurrence: { kind: 'dates', dates: ['2026-03-29'] },
      collection_time: '06:00',
      exposure: { start_day_offset: 0, start_time: '01:00', end_day_offset: 0, end_time: '03:00' },
      reminders: [{ day_offset: 0, at: '02:30' }],
    })
    const { core, clock } = await newCore('2026-03-29T00:30:00Z', suggest)
    const { preview } = activate(core, calendarWith([tooLate], { valid_from: '2026-03-01', valid_until: '2026-04-30' }))
    expect(preview.dst_adjusted).toEqual([{ date: '2026-03-29', resolution: 'shifted_forward' }])
    await core.tick()
    clock.set('2026-03-29T01:00:00Z')
    await core.tick()
    clock.set('2026-03-29T01:30:00Z')
    await core.tick()
    expect(reminders(core)).toEqual([])
    expect(occurrences(core).map((o) => o.state)).toEqual(['expired'])
  })

  it('TEMPO 25/10/2026: l’ora 02:30 si ripete; vale la prima occorrenza e “il giorno prima” dura 25 ore', () => {
    expect(offsetMinutes(new Date('2026-10-25T00:59:59Z'), TZ)).toBe(120)
    expect(offsetMinutes(new Date('2026-10-25T01:00:00Z'), TZ)).toBe(60)
    expect(localParts(new Date('2026-10-25T00:30:00Z'), TZ).time).toBe('02:30')
    expect(localParts(new Date('2026-10-25T01:30:00Z'), TZ).time).toBe('02:30')
    expect(zonedInstant('2026-10-25', '02:30', TZ)).toEqual({ instant: new Date('2026-10-25T00:30:00Z'), resolution: 'first_of_ambiguous' })
    expect(zonedInstant('2026-10-25', '01:59', TZ)).toEqual({ instant: new Date('2026-10-24T23:59:00Z'), resolution: 'exact' })
    expect(zonedInstant('2026-10-25', '03:00', TZ)).toEqual({ instant: new Date('2026-10-25T02:00:00Z'), resolution: 'exact' })

    const occ = resolve(calendarWith([rule({ recurrence: { kind: 'dates', dates: ['2026-10-25', '2026-10-26'] } })]), '2026-10-20').occurrences
    const sunday = occ.find((o) => o.collection_date === '2026-10-25')!
    const monday = occ.find((o) => o.collection_date === '2026-10-26')!
    expect(sunday.reminder_at).toBe('2026-10-24T19:00:00.000Z')
    expect(monday.reminder_at).toBe('2026-10-25T20:00:00.000Z')
    expect(Date.parse(monday.reminder_at) - Date.parse(sunday.reminder_at)).toBe(25 * 3_600_000)
  })

  it('TEMPO 25/10/2026: promemoria all’ora ripetuta → un solo promemoria alla prima 02:30, dichiarato nell’anteprima', async () => {
    const night = rule({
      fraction_id: 'vetro',
      recurrence: { kind: 'dates', dates: ['2026-10-25'] },
      collection_time: '06:00',
      exposure: { start_day_offset: 0, start_time: '01:00', end_day_offset: 0, end_time: '05:00' },
      reminders: [{ day_offset: 0, at: '02:30' }],
    })
    const { core, clock } = await newCore('2026-10-24T22:00:00Z', suggest)
    const { preview } = activate(core, calendarWith([night], { valid_from: '2026-10-01', valid_until: '2026-11-30' }))
    expect(preview.dst_adjusted).toEqual([{ date: '2026-10-25', resolution: 'first_of_ambiguous' }])
    expect(preview.occurrences[0]).toMatchObject({ reminder_at: '2026-10-25T00:30:00.000Z', time_resolution: 'first_of_ambiguous' })

    await core.tick()
    clock.set('2026-10-25T00:29:00Z')
    await core.tick()
    expect(reminders(core)).toHaveLength(0)
    clock.set('2026-10-25T00:30:00Z') // prima 02:30 (CEST)
    await core.tick()
    expect(reminders(core)).toHaveLength(1)
    clock.set('2026-10-25T01:30:00Z') // seconda 02:30 (CET): nessun secondo promemoria
    await core.tick()
    clock.set('2026-10-25T02:00:00Z')
    await core.tick()
    expect(reminders(core)).toHaveLength(1)
    const live = occurrences(core).filter((o) => o.state !== 'superseded')
    expect(live).toHaveLength(1)
    expect(live[0].state).toBe('visible')
  })

  it('TEMPO 25/10/2026: una finestra di esposizione che cade nell’ora ripetuta viene segnalata, non corretta in silenzio', () => {
    const ambiguousWindow = rule({
      recurrence: { kind: 'dates', dates: ['2026-10-25'] },
      exposure: { start_day_offset: 0, start_time: '02:30', end_day_offset: 0, end_time: '04:00' },
      reminders: [{ day_offset: 0, at: '01:00' }],
    })
    const [occurrence] = resolve(calendarWith([ambiguousWindow]), '2026-10-20').occurrences
    expect(occurrence.reminder_at).toBe('2026-10-24T23:00:00.000Z')
    expect(occurrence.exposure_from).toBe('2026-10-25T00:30:00.000Z')
    expect(occurrence.time_resolution).toBe('first_of_ambiguous')
  })
})
