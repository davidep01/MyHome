import { it,expect } from 'vitest'
import { agendaDays,agendaForDay } from './calendarAgenda'
import type { CalendarEvent } from './calendarEvents'
it('makes local midnight days and excludes the exclusive end of an all-day event',()=>{
 const days=agendaDays(new Date(2026,9,24,15))
 expect(days).toHaveLength(7)
 expect(days.every(d=>d.getHours()===0)).toBe(true)
 const event={id:'one',start:days[0].getTime(),end:days[1].getTime(),title:'Evento',calendar:'Casa',ongoing:false,allDay:true} satisfies CalendarEvent
 expect(agendaForDay([event],days[0])).toEqual([event])
 expect(agendaForDay([event],days[1])).toEqual([])
})
