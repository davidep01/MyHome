import { Hono } from 'hono'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../lib/security.js', () => ({ authRole: () => 'kiosk', adminOnly: vi.fn() }))
vi.mock('../lib/ha-config.js', () => ({
  getHAConfig: vi.fn(async () => ({ haUrl: 'http://ha-fixture.invalid:8123', haToken: 'fixture', valid: true })),
  getHABaseUrl: vi.fn(async () => 'http://ha-fixture.invalid:8123'),
}))
import { haRouter } from './ha.js'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
it('permits targeted fan direction and oscillation from the kiosk, while rejecting other services', async () => {
  const fetchMock = vi.fn(async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } }))
  globalThis.fetch = fetchMock as unknown as typeof fetch
  const app = new Hono()
  app.route('/api/ha', haRouter)
  for (const [service, payload] of [['oscillate', { oscillating: true }], ['set_direction', { direction: 'reverse' }]] as const) {
    const response = await app.request(`/api/ha/services/fan/${service}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: 'fan.room', ...payload }),
    })
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenLastCalledWith(`http://ha-fixture.invalid:8123/api/services/fan/${service}`, expect.objectContaining({ body: JSON.stringify({ entity_id: 'fan.room', ...payload }) }))
  }
  expect((await app.request('/api/ha/services/fan/restart', { method: 'POST', body: JSON.stringify({ entity_id: 'fan.room' }) })).status).toBe(403)
  expect((await app.request('/api/ha/services/fan/oscillate', { method: 'POST', body: JSON.stringify({ oscillating: true }) })).status).toBe(400)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('permits only targeted timer controls from the kiosk', async () => {
 const fetchMock=vi.fn(async()=>new Response('[]',{headers:{'Content-Type':'application/json'}}))
 globalThis.fetch=fetchMock as unknown as typeof fetch
 const app=new Hono();app.route('/api/ha',haRouter)
 for(const service of ['start','pause','cancel']) expect((await app.request(`/api/ha/services/timer/${service}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entity_id:'timer.cooking'})})).status).toBe(200)
 expect((await app.request('/api/ha/services/timer/start',{method:'POST',body:'{}'})).status).toBe(400)
 expect((await app.request('/api/ha/services/timer/finish',{method:'POST',body:JSON.stringify({entity_id:'timer.cooking'})})).status).toBe(403)
 expect(fetchMock).toHaveBeenCalledTimes(3)
})
