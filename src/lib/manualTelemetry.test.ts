import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportManualIntent } from './manualTelemetry'
import { callService } from '../api/ha-websocket'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('telemetria dei gesti manuali', () => {
  it('due click producono due operation id distinti; lo slider è riconosciuto', async () => {
    const fetchMock = vi.fn(async () => json({ status: 'stored' }, 202))
    vi.stubGlobal('fetch', fetchMock)
    const a = reportManualIntent('light', 'turn_on', { entity_id: 'light.ingresso' })
    const b = reportManualIntent('light', 'turn_on', { entity_id: 'light.ingresso', brightness_pct: 40 })
    await flush()
    expect(a).toMatch(/^op-[0-9a-f]{24}$/)
    expect(b).not.toBe(a)
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)))
    expect(bodies.map((body) => body.control)).toEqual(['toggle', 'slider'])
    expect(bodies[1].requested).toEqual({ brightness_pct: 40 })
  })

  it('senza entità non c’è nulla da osservare e non parte alcuna richiesta', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(reportManualIntent('homeassistant', 'restart')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un guasto della telemetria non blocca, non ripete e non altera il comando', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/home-ai/')) throw new TypeError('rete giù')
      return json([])
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(callService('light', 'turn_on', { entity_id: 'light.ingresso' })).resolves.toBeUndefined()
    await flush()
    const serviceCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/ha/services/light/turn_on'))
    expect(serviceCalls).toHaveLength(1)
    const init = (serviceCalls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body))).toEqual({ entity_id: 'light.ingresso' })
    expect(new Headers(init.headers).get('X-MyHome-Operation')).toMatch(/^op-/)
  })

  it('un comando rifiutato resta un errore per l’utente anche con la telemetria attiva', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (String(input).includes('/home-ai/') ? json({ status: 'stored' }, 202) : json({ error: 'no' }, 403))))
    await expect(callService('lock', 'unlock', { entity_id: 'lock.porta' })).rejects.toThrow()
  })
})
