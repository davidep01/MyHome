import { it,expect } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { timerRemaining } from './timerPresentation'
const entity={entity_id:'timer.cooking',state:'active',attributes:{finishes_at:'2026-10-04T18:05:00Z',remaining:'00:05:00'},last_changed:'2026-10-04T18:00:00Z',last_updated:'2026-10-04T18:00:00Z',context:{id:'test',parent_id:null,user_id:null}} satisfies HassEntity
it('counts live deadlines without inventing a timer completion and keeps paused duration',()=>{
 expect(timerRemaining(entity,Date.parse('2026-10-04T18:01:01Z'))).toBe('03:59')
 expect(timerRemaining(entity,Date.parse('2026-10-04T18:06:00Z'))).toBe('00:00')
 expect(timerRemaining({...entity,state:'paused'},Date.parse('2026-10-04T18:06:00Z'))).toBe('05:00')
 expect(timerRemaining({...entity,state:'idle'},0)).toBeUndefined()
 expect(timerRemaining({...entity,attributes:{remaining:'invalid'}},0)).toBeUndefined()
})
