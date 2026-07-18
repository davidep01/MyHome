import { describe, expect, it } from 'vitest'
import { calendarEventsFromBackend } from './calendarEvents'

describe('calendarEventsFromBackend', () => {
  it('shows only valid current and future events supplied by the backend feed', () => {
    const now = Date.parse('2026-07-18T12:00:00Z')
    const events = calendarEventsFromBackend([
      {
        id: 'past',
        title: 'Evento passato',
        start: '2026-07-17T08:00:00Z',
        end: '2026-07-17T09:00:00Z',
        allDay: false,
        calendar: 'Famiglia',
      },
      {
        id: 'future',
        title: 'Cena',
        start: '2026-07-18T18:00:00Z',
        end: '2026-07-18T20:00:00Z',
        allDay: false,
        calendar: 'Famiglia',
      },
      {
        id: 'ongoing',
        title: 'Compleanno',
        start: '2026-07-18T00:00:00Z',
        end: '2026-07-19T00:00:00Z',
        allDay: true,
        calendar: 'Personale',
      },
      {
        id: 'invalid',
        title: 'Dati non validi',
        start: 'not-a-date',
        end: 'not-a-date',
        allDay: false,
        calendar: 'Famiglia',
      },
    ], now)

    expect(events.map((event) => event.id)).toEqual(['ongoing', 'future'])
    expect(events[0].ongoing).toBe(true)
    expect(events[1].ongoing).toBe(false)
  })
})
