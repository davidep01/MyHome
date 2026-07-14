import { afterEach, describe, expect, it } from 'vitest'
import { getHAConfig, homeAssistantWebSocketUrl, normalizeHAUrl } from './ha-config.js'

const previousHaUrl = process.env.HA_URL

afterEach(() => {
  if (previousHaUrl === undefined) delete process.env.HA_URL
  else process.env.HA_URL = previousHaUrl
})

describe.sequential('Home Assistant LAN URL validation', () => {
  it.each([
    'http://127.0.0.1:8123',
    'http://10.0.0.2:8123',
    'https://172.16.4.2',
    'http://192.168.1.20:8123',
    'http://[fd12:3456::1]:8123',
    'http://[fe80::1]:8123',
    'http://[::1]:8123',
    'http://homeassistant.local:8123',
    'http://ha.home.arpa:8123',
    'http://supervisor/core',
  ])('accepts a local HA destination: %s', (url) => {
    expect(normalizeHAUrl(url)).not.toBeNull()
  })

  it.each([
    'https://fc.attacker.example',
    'https://fdevil.example',
    'https://fe80.attacker.example',
    'https://8.8.8.8:8123',
    'https://[2001:4860:4860::8888]:8123',
    'http://homeassistant:8123',
    'http://supervisor',
    'http://supervisor/core/api',
    'https://supervisor/core',
    'https://example.com',
  ])('rejects a non-LAN or ambiguous destination: %s', (url) => {
    expect(normalizeHAUrl(url)).toBeNull()
  })

  it('does not silently fall back when HA_URL is present but invalid', async () => {
    process.env.HA_URL = 'https://fc.attacker.example'
    const config = await getHAConfig()
    expect(config).toMatchObject({ haUrl: '', valid: false, source: { url: 'invalid' }, locked: { haUrl: true } })
  })

  it('uses the dedicated Supervisor websocket proxy without duplicating /api', () => {
    expect(homeAssistantWebSocketUrl('http://supervisor/core')).toBe('ws://supervisor/core/websocket')
    expect(homeAssistantWebSocketUrl('http://192.168.1.20:8123')).toBe('ws://192.168.1.20:8123/api/websocket')
    expect(homeAssistantWebSocketUrl('https://ha.home.arpa')).toBe('wss://ha.home.arpa/api/websocket')
  })
})
