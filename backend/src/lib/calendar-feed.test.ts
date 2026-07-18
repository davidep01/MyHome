import { describe, expect, it } from 'vitest'
import { parseCalendarFeed } from './calendar-feed.js'

const HEADER = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//MyHome//Calendar Test//IT',
  'X-WR-CALNAME:Famiglia',
]

function calendar(...lines: string[]): string {
  return [...HEADER, ...lines, 'END:VCALENDAR'].join('\r\n')
}

describe('iCalendar feed parser', () => {
  it('reads upcoming events and calendar metadata', async () => {
    const events = await parseCalendarFeed(calendar(
      'BEGIN:VEVENT',
      'UID:dinner-1',
      'DTSTAMP:20260701T100000Z',
      'DTSTART:20260719T183000Z',
      'DTEND:20260719T200000Z',
      'SUMMARY:Cena in famiglia',
      'LOCATION:Casa',
      'END:VEVENT',
    ), new Date('2026-07-18T12:00:00Z'))

    expect(events).toEqual([expect.objectContaining({
      id: 'dinner-1-2026-07-19T18:30:00.000Z',
      title: 'Cena in famiglia',
      location: 'Casa',
      calendar: 'Famiglia',
      allDay: false,
    })])
  })

  it('expands recurring events and honors exclusions', async () => {
    const events = await parseCalendarFeed(calendar(
      'BEGIN:VEVENT',
      'UID:gym-1',
      'DTSTAMP:20260701T100000Z',
      'DTSTART:20260720T070000Z',
      'DTEND:20260720T080000Z',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'EXDATE:20260727T070000Z',
      'SUMMARY:Palestra',
      'END:VEVENT',
    ), new Date('2026-07-18T12:00:00Z'))

    expect(events.map((event) => event.start)).toEqual([
      '2026-07-20T07:00:00.000Z',
      '2026-08-03T07:00:00.000Z',
    ])
  })

  it('keeps all-day events as all-day entries', async () => {
    const events = await parseCalendarFeed(calendar(
      'BEGIN:VEVENT',
      'UID:holiday-1',
      'DTSTAMP:20260701T100000Z',
      'DTSTART;VALUE=DATE:20260720',
      'DTEND;VALUE=DATE:20260721',
      'SUMMARY:Festa',
      'END:VEVENT',
    ), new Date('2026-07-18T12:00:00Z'))

    expect(events[0]).toMatchObject({ title: 'Festa', allDay: true })
  })
})
