import { describe, expect, it } from 'vitest'
import { CoreClock, HomeAiCore } from '../core.js'
import type { CoreConfig } from '../config.js'
import type { WasteCalendar, WasteRule } from '../domain/contracts.js'
import { CoreError } from '../domain/errors.js'
import { demoWasteCalendar } from '../fixtures/demo-home.js'
import { json } from '../storage/db.js'
import type { StoredProposal } from '../suggestions/service.js'
import { resolveOccurrences } from '../waste/calendar.js'
import { parseWasteIcs, type IcsImportOptions } from '../waste/ics.js'
import type { StoredOccurrence } from '../waste/service.js'
import { DEMO_END, newCore, seededDemo } from './helpers.js'

/**
 * Raccolta differenziata (specifica §13, matrice §26: T22–T28, T47).
 *
 * Calendari SINTETICI: nessuno descrive il calendario di un comune reale.
 * Orologio iniettato, nessuna rete, nessuna connessione a Home Assistant.
 */

const TZ = 'Europe/Rome'
const OPTS = { tz: TZ, horizonDays: 60, realHome: false }
const OPEN = new Set(['candidate', 'policy_checked', 'visible', 'snoozed'])

/** Promemoria visibili nell'inbox locale; fascia di quiete neutra per non mescolare policy e calendario. */
const suggest = (config: CoreConfig) => {
  config.runtime.mode = 'suggest'
  config.attention.quiet_hours = { from: '00:00', until: '00:00' }
}

const ORGANICO: WasteRule = {
  rule_id: 'organico-martedi',
  fraction_id: 'organico',
  recurrence: { kind: 'rrule', dtstart: '2026-09-01', value: 'FREQ=WEEKLY;BYDAY=TU' },
  collection_time: '07:00',
  exposure: { start_day_offset: -1, start_time: '20:00', end_day_offset: -1, end_time: '22:00' },
  reminders: [{ day_offset: -1, at: '21:00' }],
}

const CARTA: WasteRule = {
  rule_id: 'carta-venerdi',
  fraction_id: 'carta',
  recurrence: { kind: 'rrule', dtstart: '2026-09-04', value: 'FREQ=WEEKLY;BYDAY=FR' },
  collection_time: null,
  exposure: { start_day_offset: -1, start_time: '20:00', end_day_offset: -1, end_time: '23:00' },
  reminders: [{ day_offset: -1, at: '20:30' }],
}

function calendar(patch: Partial<WasteCalendar> = {}): WasteCalendar {
  return {
    schema_version: 1,
    calendar_id: 'prova-rifiuti',
    revision: 1,
    municipality: 'Comune di prova',
    area: 'Zona A',
    timezone: TZ,
    valid_from: '2026-09-01',
    valid_until: '2027-03-31',
    source: { kind: 'manual', reference: 'inserimento-manuale', document_url: null, checksum: null, acquired_at: '2026-09-01T08:00:00Z' },
    approval: { state: 'draft', actor_id: null, confirmed_at: null },
    fractions: [{ id: 'organico', label: 'Organico' }, { id: 'carta', label: 'Carta' }],
    rules: [ORGANICO],
    exceptions: [],
    demo: false,
    ...patch,
  }
}

function activate(core: HomeAiCore, input: WasteCalendar, realHome = false): WasteCalendar {
  const { calendar: draft } = core.waste.saveDraft(input, { ...OPTS, realHome })
  return core.waste.approve(draft.calendar_id, draft.revision, 'test-admin', { ...OPTS, realHome, demo: !realHome })
}

/** Tutte le occorrenze persistite, superate comprese. */
function occurrences(core: HomeAiCore): StoredOccurrence[] {
  return core.store.all('SELECT body FROM waste_occurrences').map((row) => json<StoredOccurrence>(row.body))
}

function live(core: HomeAiCore, fraction?: string): StoredOccurrence[] {
  return occurrences(core).filter((o) => o.state !== 'superseded' && (!fraction || o.fraction_id === fraction))
}

function reminders(core: HomeAiCore): StoredProposal[] {
  return core.proposals.list({ includePersonal: true, limit: 200 }).filter((p) => p.agent_key === 'waste')
}

/** Promemoria (di qualunque stato) che riguardano una data di raccolta. */
function remindersFor(core: HomeAiCore, collectionDate: string): StoredProposal[] {
  const ids = new Set(occurrences(core).filter((o) => o.collection_date === collectionDate).map((o) => o.occurrence_id))
  return reminders(core).filter((p) => p.occurrence_id && ids.has(p.occurrence_id))
}

function expectUniqueNaturalKeys(core: HomeAiCore): void {
  const keys = live(core).map((o) => o.natural_key)
  expect(new Set(keys).size).toBe(keys.length)
}

const wrapIcs = (body: string) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prova//Rifiuti//IT', body.trim(), 'END:VCALENDAR'].join('\r\n')

/** Organico il martedì, tutto il giorno; il 20/10 escluso, il 27/10 spostato al 28, il 10/11 annullato. */
const ICS_ORGANICO = wrapIcs(`
BEGIN:VEVENT
UID:organico-1@prova.invalid
DTSTAMP:20260901T000000Z
DTSTART;VALUE=DATE:20261006
DTEND;VALUE=DATE:20261007
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;VALUE=DATE:20261020
SUMMARY:Organico
END:VEVENT
BEGIN:VEVENT
UID:organico-1@prova.invalid
DTSTAMP:20260901T000000Z
RECURRENCE-ID;VALUE=DATE:20261027
DTSTART;VALUE=DATE:20261028
DTEND;VALUE=DATE:20261029
SUMMARY:Organico (recupero)
END:VEVENT
BEGIN:VEVENT
UID:organico-1@prova.invalid
DTSTAMP:20260901T000000Z
RECURRENCE-ID;VALUE=DATE:20261110
DTSTART;VALUE=DATE:20261110
DTEND;VALUE=DATE:20261111
STATUS:CANCELLED
SUMMARY:Organico
END:VEVENT
`)

/** Carta il giovedì alle 07:00 di Roma; 15/10 escluso, 29/10 spostato al 30 (dopo il cambio d'ora). */
const ICS_CARTA_TZID = wrapIcs(`
BEGIN:VEVENT
UID:carta-1@prova.invalid
DTSTAMP:20260901T000000Z
DTSTART;TZID=Europe/Rome:20261001T070000
DTEND;TZID=Europe/Rome:20261001T080000
RRULE:FREQ=WEEKLY;BYDAY=TH
EXDATE;TZID=Europe/Rome:20261015T070000
SUMMARY:Carta e cartone
END:VEVENT
BEGIN:VEVENT
UID:carta-1@prova.invalid
DTSTAMP:20260901T000000Z
RECURRENCE-ID;TZID=Europe/Rome:20261029T070000
DTSTART;TZID=Europe/Rome:20261030T070000
DTEND;TZID=Europe/Rome:20261030T080000
SUMMARY:Carta e cartone
END:VEVENT
`)

const ICS_VETRO_ALL_DAY = wrapIcs(`
BEGIN:VEVENT
UID:vetro-1@prova.invalid
DTSTAMP:20260901T000000Z
DTSTART;VALUE=DATE:20261013
DTEND;VALUE=DATE:20261014
SUMMARY:Vetro
END:VEVENT
`)

const icsOptions = (patch: Partial<IcsImportOptions> = {}): IcsImportOptions => ({
  calendar_id: 'ics-prova',
  municipality: 'Comune di prova',
  area: 'Zona A',
  timezone: TZ,
  valid_from: '2026-10-01',
  valid_until: '2026-11-30',
  label_mapping: {},
  exposure: { start_day_offset: -1, start_time: '20:00', end_day_offset: -1, end_time: '22:00' },
  reminders: [{ day_offset: -1, at: '21:00' }],
  acquired_at: '2026-09-30T08:00:00Z',
  ...patch,
})

function icsDates(source: string, patch: Partial<IcsImportOptions> = {}): Record<string, string[]> {
  const preview = parseWasteIcs(source, icsOptions(patch))
  expect(preview.errors).toEqual([])
  const out: Record<string, string[]> = {}
  for (const rule of preview.calendar!.rules) {
    if (rule.recurrence.kind !== 'dates') throw new Error('attese date esplicite')
    out[rule.fraction_id] = rule.recurrence.dates
  }
  return out
}

/** Esegue `fn` con una timezone di processo diversa: il server non deve spostare le date civili. */
function withHostTimezone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = tz
  try { return fn() } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

describe('T22 — promemoria dimostrativo dell’organico', () => {
  it('T22 lunedì 12/10/2026 ore 21 locali, demo organico: una sola occorrenza per la raccolta di martedì 13/10', async () => {
    const { core } = await seededDemo()
    const tuesday = occurrences(core).filter((o) => o.fraction_id === 'organico' && o.collection_date === '2026-10-13')
    expect(tuesday).toHaveLength(1)
    const [occurrence] = tuesday
    // Raccolta, finestra di esposizione e promemoria restano tre cose distinte.
    expect(occurrence.collection_time).toBe('07:00')
    expect(occurrence.reminder_at).toBe('2026-10-12T19:00:00.000Z')
    expect(occurrence.exposure_from).toBe('2026-10-12T18:00:00.000Z')
    expect(occurrence.exposure_until).toBe('2026-10-12T20:00:00.000Z')
    expect(occurrence.time_resolution).toBe('exact')
    expect(['due', 'visible']).toContain(occurrence.state)

    // Altri giri del ciclo non creano altri promemoria per la stessa raccolta.
    await core.tick()
    await core.tick()
    const waste = reminders(core)
    expect(waste).toHaveLength(1)
    expect(waste[0].occurrence_id).toBe(occurrence.occurrence_id)
    expect(waste[0].title).toBe('Raccolta organico · martedì 13 ottobre')
    expect(waste[0].physical_execution).toBe('disabled')
    expect(live(core, 'organico').filter((o) => o.collection_date === '2026-10-13')).toHaveLength(1)

    // La carta di giovedì 15/10 resta programmata: nessun promemoria anticipato.
    const carta = live(core, 'carta').filter((o) => o.collection_date === '2026-10-15')
    expect(carta).toHaveLength(1)
    expect(carta[0].state).toBe('scheduled')
  }, 60_000)

  it('T22 il promemoria matura alle 21:00 locali, non prima, e scade con la finestra di esposizione', async () => {
    const { core, clock } = await newCore('2026-10-12T18:59:00Z', suggest)
    activate(core, demoWasteCalendar(DEMO_END, '2026-09-22T08:00:00Z'))
    await core.tick()
    expect(reminders(core)).toHaveLength(0)
    expect(live(core, 'organico').find((o) => o.collection_date === '2026-10-13')?.state).toBe('scheduled')

    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    clock.set('2026-10-12T19:30:00Z')
    await core.tick()
    const shown = reminders(core)
    expect(shown).toHaveLength(1)
    expect(shown[0].state).toBe('visible')
    expect(live(core, 'organico').find((o) => o.collection_date === '2026-10-13')?.state).toBe('visible')

    // Alle 22:00 locali la finestra consentita è chiusa: il promemoria non resta in giro.
    clock.set('2026-10-12T20:00:00Z')
    await core.tick()
    expect(live(core, 'organico').find((o) => o.collection_date === '2026-10-13')?.state).toBe('expired')
    expect(reminders(core).map((p) => p.state)).toEqual(['expired'])
  })
})

describe('T23 — festività', () => {
  it('T23 una festività senza eccezione pubblicata non sposta la raccolta (martedì 8 dicembre, venerdì 25 dicembre e 1° gennaio)', async () => {
    const cal = calendar({ rules: [ORGANICO, CARTA], approval: { state: 'approved', actor_id: 'test-admin', confirmed_at: '2026-11-01T08:00:00Z' } })
    const resolution = resolveOccurrences(cal, { today: '2026-11-30', horizonDays: 60, realHome: false })
    expect(resolution.certain).toBe(true)
    expect(resolution.issues).toEqual([])
    const organico = resolution.occurrences.filter((o) => o.fraction_id === 'organico').map((o) => o.collection_date)
    const carta = resolution.occurrences.filter((o) => o.fraction_id === 'carta').map((o) => o.collection_date)
    expect(organico).toContain('2026-12-08')
    expect(organico).not.toContain('2026-12-07')
    expect(organico).not.toContain('2026-12-09')
    expect(carta).toEqual(expect.arrayContaining(['2026-12-25', '2027-01-01']))
    expect(carta).not.toContain('2026-12-24')
    expect(carta).not.toContain('2026-12-26')
    expect(carta).not.toContain('2027-01-02')

    // Il sistema avvisa per l'8 dicembre come per ogni altro martedì.
    const { core, clock } = await newCore('2026-12-07T19:30:00Z', suggest)
    activate(core, cal)
    await core.tick()
    clock.set('2026-12-07T20:00:00Z') // 21:00 CET
    await core.tick()
    const shown = reminders(core)
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe('Raccolta organico · martedì 8 dicembre')
  })

  it('T23 lo spostamento avviene solo con un’eccezione inserita e confermata', () => {
    const base = calendar({ approval: { state: 'approved', actor_id: 'test-admin', confirmed_at: '2026-11-01T08:00:00Z' } })
    const withException = { ...base, exceptions: [{ rule_id: ORGANICO.rule_id, original_date: '2026-12-08', kind: 'replace' as const, replacement_date: '2026-12-09', collection_time: '07:00' }] }
    const moved = resolveOccurrences(withException, { today: '2026-11-30', horizonDays: 60, realHome: false })
      .occurrences.map((o) => o.collection_date)
    expect(moved).toContain('2026-12-09')
    expect(moved).not.toContain('2026-12-08')
    // Una bozza non ancora confermata non produce promemoria certi.
    const draft = resolveOccurrences({ ...withException, approval: { state: 'draft', actor_id: null, confirmed_at: null } }, { today: '2026-11-30', horizonDays: 60, realHome: false })
    expect(draft.certain).toBe(false)
    expect(draft.issues.map((i) => i.code)).toContain('CALENDAR_NOT_APPROVED')
  })
})

describe('T24 — cancellazioni e recuperi', () => {
  it('T24 cancellazione e recupero: occorrenze riconciliate una volta sola, nessun promemoria per le date annullate', async () => {
    const { core, clock } = await newCore('2026-10-10T10:00:00Z', suggest)
    activate(core, calendar())
    await core.tick()

    const revised = calendar({
      exceptions: [
        { rule_id: ORGANICO.rule_id, original_date: '2026-10-13', kind: 'replace', replacement_date: '2026-10-14', collection_time: '07:00' },
        { rule_id: ORGANICO.rule_id, original_date: '2026-10-20', kind: 'cancel' },
      ],
    })
    const { calendar: draft, preview } = core.waste.saveDraft(revised, OPTS)
    expect(preview.issues).toEqual([])
    expect(preview.diff.changed).toContain('Organico 2026-10-14 07:00')
    expect(preview.diff.removed).toContain('Organico 2026-10-20 07:00')

    // Prima dell'approvazione vale ancora la versione confermata.
    await core.tick()
    expect(live(core, 'organico').map((o) => o.collection_date)).toContain('2026-10-13')

    core.waste.approve(draft.calendar_id, draft.revision, 'test-admin', { ...OPTS, demo: false })
    core.waste.approve(draft.calendar_id, draft.revision, 'test-admin', { ...OPTS, demo: false })
    await core.tick()
    await core.tick()

    const dates = live(core, 'organico').map((o) => o.collection_date)
    expect(dates.filter((d) => d === '2026-10-14')).toHaveLength(1)
    expect(dates.filter((d) => d === '2026-10-27')).toHaveLength(1)
    expect(dates).not.toContain('2026-10-13')
    expect(dates).not.toContain('2026-10-20')
    expectUniqueNaturalKeys(core)

    // Lunedì 12 alle 21: la raccolta del 13 non esiste più.
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    expect(reminders(core)).toHaveLength(0)

    // Martedì 13 alle 21: un solo promemoria per il recupero di mercoledì 14.
    clock.set('2026-10-13T19:00:00Z')
    await core.tick()
    await core.tick()
    expect(reminders(core).map((p) => p.title)).toEqual(['Raccolta organico · mercoledì 14 ottobre'])

    // Lunedì 19: nessun promemoria per il 20 annullato.
    clock.set('2026-10-19T19:00:00Z')
    await core.tick()
    expect(reminders(core)).toHaveLength(1)

    // Lunedì 26 alle 21 (ora solare, 20:00Z): la regola ordinaria riprende.
    clock.set('2026-10-26T20:00:00Z')
    await core.tick()
    expect(reminders(core).map((p) => p.title).sort()).toEqual([
      'Raccolta organico · martedì 27 ottobre',
      'Raccolta organico · mercoledì 14 ottobre',
    ])
  })

  it('T24 una cancellazione approvata dopo la comparsa del promemoria lo ritira dall’inbox', async () => {
    const { core, clock } = await newCore('2026-10-10T10:00:00Z', suggest)
    activate(core, calendar())
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    expect(remindersFor(core, '2026-10-13').map((p) => p.state)).toEqual(['visible'])

    clock.set('2026-10-12T19:10:00Z')
    activate(core, calendar({ exceptions: [{ rule_id: ORGANICO.rule_id, original_date: '2026-10-13', kind: 'cancel' }] }))
    await core.tick()
    await core.tick()

    expect(live(core, 'organico').map((o) => o.collection_date)).not.toContain('2026-10-13')
    const open = remindersFor(core, '2026-10-13').filter((p) => OPEN.has(p.state))
    expect(open).toEqual([])
    expect(remindersFor(core, '2026-10-13').map((p) => p.state)).toEqual(['withdrawn'])
  })

  it('T24 una nuova revisione che non tocca un’occorrenza non ne ripete il promemoria', async () => {
    const { core, clock } = await newCore('2026-10-10T10:00:00Z', suggest)
    activate(core, calendar())
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    const [first] = remindersFor(core, '2026-10-13')
    expect(first.state).toBe('visible')

    // La revisione annulla solo il 27/10: il promemoria del 13 è ancora valido.
    clock.set('2026-10-12T19:10:00Z')
    activate(core, calendar({ exceptions: [{ rule_id: ORGANICO.rule_id, original_date: '2026-10-27', kind: 'cancel' }] }))
    await core.tick()
    clock.set('2026-10-12T19:20:00Z')
    await core.tick()

    const forTuesday = remindersFor(core, '2026-10-13')
    expect(forTuesday).toHaveLength(1)
    expect(forTuesday[0].proposal_id).toBe(first.proposal_id)
    expect(forTuesday[0].state).toBe('visible')
    expect(live(core, 'organico').filter((o) => o.collection_date === '2026-10-13')).toHaveLength(1)
    expect(live(core, 'organico').map((o) => o.collection_date)).not.toContain('2026-10-27')
    expectUniqueNaturalKeys(core)
  })

  it('T24 un promemoria segnato come fatto non risorge con la revisione successiva', async () => {
    const { core, clock } = await newCore('2026-10-10T10:00:00Z', suggest)
    activate(core, calendar())
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    const [shown] = remindersFor(core, '2026-10-13')
    core.waste.feedback(shown.occurrence_id!, 'done')

    clock.set('2026-10-12T19:15:00Z')
    activate(core, calendar({ exceptions: [{ rule_id: ORGANICO.rule_id, original_date: '2026-10-27', kind: 'cancel' }] }))
    await core.tick()

    const tuesday = live(core, 'organico').filter((o) => o.collection_date === '2026-10-13')
    expect(tuesday).toHaveLength(1)
    expect(tuesday[0].state).toBe('completed')
    expect(remindersFor(core, '2026-10-13')).toHaveLength(1)
  })
})

describe('T25 — fonte non verificabile', () => {
  it('T25 zona assente: nessun promemoria certo e una richiesta di verifica visibile', async () => {
    const { core, clock } = await newCore('2026-10-10T10:00:00Z', suggest)
    activate(core, calendar())
    await core.tick()
    expect(live(core, 'organico').map((o) => o.collection_date)).toContain('2026-10-13')

    const { calendar: draft, preview } = core.waste.saveDraft(calendar({ area: '' }), OPTS)
    expect(preview.issues.map((i) => i.code)).toContain('AREA_MISSING')
    core.waste.approve(draft.calendar_id, draft.revision, 'test-admin', { ...OPTS, demo: false })
    await core.tick()

    // I promemoria in sospeso della versione precedente si ritirano; nessuno nuovo.
    expect(live(core).filter((o) => o.state === 'scheduled')).toEqual([])
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    expect(reminders(core)).toEqual([])

    const { issues } = core.waste.reconcile(OPTS)
    expect(issues.map((i) => i.code)).toContain('AREA_MISSING')
    expect(issues.find((i) => i.code === 'AREA_MISSING')?.message).toMatch(/Zona/)

    const health = core.health({ haReachable: null, lastBackupAt: null, lastRestoreVerifiedAt: null })
    expect(health.waste_calendar).not.toBe('approved')
    expect(health.issues.map((i) => i.code)).toContain('AREA_MISSING')
  })

  it('T25 calendario scaduto: la regola non viene estrapolata oltre la validità e la salute lo segnala', async () => {
    const { core, clock } = await newCore('2026-10-05T10:00:00Z', suggest)
    activate(core, calendar({ valid_until: '2026-10-11' }))
    await core.tick()
    expect(live(core, 'organico').map((o) => o.collection_date)).toEqual(['2026-10-06'])

    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    await core.tick()
    expect(occurrences(core).filter((o) => o.collection_date > '2026-10-11')).toEqual([])
    expect(remindersFor(core, '2026-10-13')).toEqual([])

    const { issues } = core.waste.reconcile(OPTS)
    expect(issues.map((i) => i.code)).toContain('CALENDAR_EXPIRED')
    const health = core.health({ haReachable: null, lastBackupAt: null, lastRestoreVerifiedAt: null })
    expect(health.waste_calendar).toBe('expired')
    expect(health.issues.map((i) => i.code)).toContain('CALENDAR_EXPIRED')
  })

  it('T25 il calendario dimostrativo non vale per la casa reale: nessun promemoria certo', async () => {
    const { core, clock } = await newCore('2026-10-12T18:00:00Z', (config) => {
      suggest(config)
      config.runtime.demo = false
      config.sources.fixtures.enabled = false
    })
    activate(core, demoWasteCalendar(DEMO_END, '2026-09-22T08:00:00Z'), true)
    await core.tick()
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    expect(live(core).filter((o) => ['scheduled', 'due', 'visible'].includes(o.state))).toEqual([])
    expect(reminders(core)).toEqual([])
    expect(core.waste.reconcile({ ...OPTS, realHome: true }).issues.map((i) => i.code)).toContain('DEMO_CALENDAR')
  })
})

describe('T26–T27 — import ICS', () => {
  it('T26 ICS con EXDATE e RECURRENCE-ID: esclusione e override prevalgono sulla ricorrenza', () => {
    const { organico } = icsDates(ICS_ORGANICO)
    expect(organico).toEqual(['2026-10-06', '2026-10-13', '2026-10-28', '2026-11-03', '2026-11-17', '2026-11-24'])
    expect(organico).not.toContain('2026-10-20') // EXDATE
    expect(organico).not.toContain('2026-10-27') // sostituita dal RECURRENCE-ID
    expect(organico).not.toContain('2026-11-10') // override CANCELLED

    // Con TZID: stessa regola prima e dopo il cambio d'ora del 25/10, orario civile invariato.
    const preview = parseWasteIcs(ICS_CARTA_TZID, icsOptions())
    expect(preview.errors).toEqual([])
    const [rule] = preview.calendar!.rules
    expect(rule.fraction_id).toBe('carta')
    expect(rule.collection_time).toBe('07:00')
    expect(rule.recurrence).toEqual({
      kind: 'dates',
      dates: ['2026-10-01', '2026-10-08', '2026-10-22', '2026-10-30', '2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26'],
    })
  })

  it('T26 la bozza importata, una volta approvata, non avvisa per le date escluse o sostituite', async () => {
    const { core, clock } = await newCore('2026-10-18T10:00:00Z', suggest)
    const preview = parseWasteIcs(ICS_ORGANICO, icsOptions())
    // Una bozza non produce promemoria prima dell'approvazione.
    const { calendar: draft } = core.waste.saveDraft(preview.calendar, OPTS)
    await core.tick()
    expect(live(core)).toEqual([])
    core.waste.approve(draft.calendar_id, draft.revision, 'test-admin', { ...OPTS, demo: false })

    clock.set('2026-10-19T19:00:00Z') // lunedì 19 alle 21: il 20 è escluso
    await core.tick()
    expect(reminders(core)).toEqual([])
    clock.set('2026-10-26T20:00:00Z') // lunedì 26 alle 21 (ora solare): il 27 è spostato
    await core.tick()
    expect(reminders(core)).toEqual([])
    clock.set('2026-10-27T20:00:00Z') // martedì 27 alle 21: promemoria per il recupero del 28
    await core.tick()
    expect(reminders(core).map((p) => p.title)).toEqual(['Raccolta organico · mercoledì 28 ottobre'])
  })

  it('T27 evento all-day con DTEND esclusivo: nessuno slittamento di data, qualunque sia la timezone del server', () => {
    const hostOffsets: Record<string, number> = { UTC: 0, 'Europe/Rome': -120, 'America/Los_Angeles': 420, 'Pacific/Auckland': -780 }
    for (const [hostTz, offset] of Object.entries(hostOffsets)) {
      withHostTimezone(hostTz, () => {
        // La timezone del processo è davvero cambiata: la prova non è banale.
        expect(new Date(2026, 9, 13).getTimezoneOffset()).toBe(offset)
        expect(icsDates(ICS_VETRO_ALL_DAY)).toEqual({ vetro: ['2026-10-13'] })
        expect(icsDates(ICS_ORGANICO).organico.slice(0, 3)).toEqual(['2026-10-06', '2026-10-13', '2026-10-28'])
      })
    }
  })

  it('T27 una data intera non diventa mezzanotte UTC: raccolta senza orario, promemoria alle 21 del giorno civile precedente', () => {
    const preview = parseWasteIcs(ICS_VETRO_ALL_DAY, icsOptions())
    const [rule] = preview.calendar!.rules
    expect(rule.collection_time).toBeNull()
    const approved = { ...preview.calendar!, approval: { state: 'approved' as const, actor_id: 'test-admin', confirmed_at: '2026-10-01T08:00:00Z' } }
    const { occurrences: resolved } = resolveOccurrences(approved, { today: '2026-10-10', horizonDays: 60, realHome: false })
    expect(resolved).toHaveLength(1)
    expect(resolved[0].collection_date).toBe('2026-10-13')
    expect(resolved[0].collection_time).toBeNull()
    expect(resolved[0].reminder_at).toBe('2026-10-12T19:00:00.000Z')
    expect(resolved[0].exposure_until).toBe('2026-10-12T20:00:00.000Z')
  })
})

describe('T28 — import e approvazione ripetuti', () => {
  it('T28 import e approvazione della stessa revisione ripetuti: nessuna doppia attivazione', async () => {
    const { core, clock } = await newCore('2026-10-12T18:00:00Z', suggest)
    const first = parseWasteIcs(ICS_ORGANICO, icsOptions())
    const saved = core.waste.saveDraft(first.calendar, OPTS)
    for (let i = 0; i < 3; i += 1) core.waste.approve(saved.calendar.calendar_id, saved.calendar.revision, 'test-admin', { ...OPTS, demo: false })
    await core.tick()
    clock.set('2026-10-12T19:00:00Z')
    await core.tick()
    const [shown] = remindersFor(core, '2026-10-13')
    expect(shown.state).toBe('visible')

    // Stesso file, stesse opzioni: nessuna differenza in anteprima.
    const again = parseWasteIcs(ICS_ORGANICO, icsOptions())
    expect(again.checksum).toBe(first.checksum)
    const resaved = core.waste.saveDraft(again.calendar, OPTS)
    expect(resaved.preview.diff).toEqual({ added: [], removed: [], changed: [] })
    for (let i = 0; i < 2; i += 1) core.waste.approve(resaved.calendar.calendar_id, resaved.calendar.revision, 'test-admin', { ...OPTS, demo: false })
    // Riapprovare la revisione precedente non la riattiva.
    try {
      core.waste.approve(saved.calendar.calendar_id, saved.calendar.revision, 'test-admin', { ...OPTS, demo: false })
    } catch (error) {
      expect(error).toBeInstanceOf(CoreError)
      expect((error as CoreError).code).toBe('REVISION_CONFLICT')
    }
    clock.set('2026-10-12T19:05:00Z')
    await core.tick()
    await core.tick()

    const approvedRows = core.store.all("SELECT revision FROM waste_calendars WHERE calendar_id = 'ics-prova' AND state = 'approved'")
    expect(approvedRows).toHaveLength(1)
    expect(core.waste.active('ics-prova')?.revision).toBe(core.waste.latestRevision('ics-prova')?.revision)
    expectUniqueNaturalKeys(core)
    const forTuesday = remindersFor(core, '2026-10-13')
    expect(forTuesday).toHaveLength(1)
    expect(forTuesday[0].proposal_id).toBe(shown.proposal_id)
    expect(forTuesday[0].state).toBe('visible')
    expect(reminders(core)).toHaveLength(1)
  })
})

describe('T47 — riavvio', () => {
  it('T47 riavvio a ridosso della scadenza del promemoria: una sola occorrenza, nessun duplicato', async () => {
    const { core, store, clock } = await newCore('2026-10-12T18:58:00Z', suggest)
    activate(core, calendar())
    await core.tick()
    expect(reminders(core)).toEqual([])

    // Nuova istanza sullo stesso archivio, l'orologio supera la scadenza durante il fermo.
    clock.set('2026-10-12T19:00:30Z')
    const restarted = new HomeAiCore({ store, clock: new CoreClock(clock) })
    await restarted.tick()
    expect(reminders(restarted)).toHaveLength(1)

    const again = new HomeAiCore({ store, clock: new CoreClock(clock) })
    clock.set('2026-10-12T19:02:00Z')
    await again.tick()
    await again.tick()
    await core.tick() // istanza precedente ancora viva: stesso archivio, nessun nuovo promemoria
    expect(reminders(again)).toHaveLength(1)
    const tuesday = live(again, 'organico').filter((o) => o.collection_date === '2026-10-13')
    expect(tuesday).toHaveLength(1)
    expect(tuesday[0].state).toBe('visible')
  })

  it('T47 riavvio dopo un lungo fermo: i promemoria scaduti non vengono recuperati in blocco', async () => {
    const { core, store, clock } = await newCore('2026-09-28T08:00:00Z', suggest)
    activate(core, calendar({ rules: [ORGANICO, CARTA] }))
    await core.tick()
    expect(live(core).filter((o) => o.collection_date < '2026-10-12').length).toBeGreaterThanOrEqual(4)

    clock.set('2026-10-12T19:00:30Z')
    const restarted = new HomeAiCore({ store, clock: new CoreClock(clock) })
    await restarted.tick()

    const shown = reminders(restarted)
    expect(shown.map((p) => p.title)).toEqual(['Raccolta organico · martedì 13 ottobre'])
    const past = occurrences(restarted).filter((o) => o.collection_date < '2026-10-12')
    expect(past.length).toBeGreaterThanOrEqual(4)
    for (const occurrence of past) expect(occurrence.state).toBe('expired')
  })
})
