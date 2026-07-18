import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authenticateRequest } from '../lib/security.js'
import { aiRouter } from './ai.js'

afterEach(() => vi.unstubAllEnvs())

function testApp() {
  vi.stubEnv('MYHOME_AUTH_MODE', '')
  vi.stubEnv('MYHOME_ADMIN_TOKEN', '')
  vi.stubEnv('MYHOME_ACCESS_TOKEN', '')
  vi.stubEnv('MYHOME_KIOSK_TOKEN', '')
  const app = new Hono()
  app.use('/api/*', authenticateRequest)
  app.route('/api/ai', aiRouter)
  return app
}

describe('screensaver AI recap', () => {
  it('is available to the kiosk role and validates its context', async () => {
    const response = await testApp().request('/api/ai/recap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MyHome-Client': 'tablet' },
      body: JSON.stringify({ context: [] }),
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Contesto recap non valido' })
  })

  it('fails safely when Gemini is not configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const response = await testApp().request('/api/ai/recap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MyHome-Client': 'tablet' },
      body: JSON.stringify({
        context: [{ entity_id: 'sensor.recap_luci_accese', name: 'Luci accese', state: '2' }],
      }),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Servizio AI non configurato' })
  })
})
