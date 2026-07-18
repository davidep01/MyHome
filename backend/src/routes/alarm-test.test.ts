import { afterEach, describe, expect, it } from 'vitest'
import { app } from '../app.js'
import { stopSharedAlarmTest, subscribeHaStream, type HaStreamEvent } from '../lib/ha-stream.js'

const desktop = { 'Content-Type': 'application/json', 'X-MyHome-Client': 'desktop' }

function lastAlarmEvent(events: HaStreamEvent[]) {
  return events.findLast((event) => event.type === 'alarm-test')
}

afterEach(() => {
  stopSharedAlarmTest()
})

describe.sequential('shared alarm test', () => {
  it('broadcasts start and stop to every connected kiosk and hydrates late subscribers', async () => {
    const first: HaStreamEvent[] = []
    const second: HaStreamEvent[] = []
    const unsubscribeFirst = subscribeHaStream((event) => first.push(event))
    const unsubscribeSecond = subscribeHaStream((event) => second.push(event))

    const late: HaStreamEvent[] = []
    let unsubscribeLate = () => undefined
    try {
      const start = await app.request('/api/alarm/test', {
        method: 'POST',
        headers: desktop,
        body: JSON.stringify({ scenario: 'intrusion' }),
      })
      expect(start.status).toBe(200)
      const started = await start.json() as { id: string }

      expect(lastAlarmEvent(first)).toMatchObject({ type: 'alarm-test', active: true, id: started.id, scenario: 'intrusion' })
      expect(lastAlarmEvent(second)).toMatchObject({ type: 'alarm-test', active: true, id: started.id, scenario: 'intrusion' })

      unsubscribeLate = subscribeHaStream((event) => late.push(event))
      expect(lastAlarmEvent(late)).toMatchObject({ type: 'alarm-test', active: true, id: started.id })

      const stop = await app.request('/api/alarm/test', { method: 'DELETE', headers: { 'X-MyHome-Client': 'tablet' } })
      expect(stop.status).toBe(200)
      expect(lastAlarmEvent(first)).toMatchObject({ type: 'alarm-test', active: false, id: started.id })
      expect(lastAlarmEvent(second)).toMatchObject({ type: 'alarm-test', active: false, id: started.id })
      expect(lastAlarmEvent(late)).toMatchObject({ type: 'alarm-test', active: false, id: started.id })
    } finally {
      unsubscribeFirst()
      unsubscribeSecond()
      unsubscribeLate()
    }
  })

  it('exposes active state for REST fallback and rejects unknown scenarios', async () => {
    const invalid = await app.request('/api/alarm/test', {
      method: 'POST',
      headers: desktop,
      body: JSON.stringify({ scenario: 'earthquake' }),
    })
    expect(invalid.status).toBe(400)

    await app.request('/api/alarm/test', {
      method: 'POST',
      headers: desktop,
      body: JSON.stringify({ scenario: 'smoke' }),
    })
    const status = await app.request('/api/alarm/test', { headers: { 'X-MyHome-Client': 'tablet' } })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ active: true, scenario: 'smoke' })
  })
})
