import { Hono } from 'hono'
import { adminOnly } from '../lib/security.js'
import { broadcastKioskCommand } from '../lib/ha-stream.js'
import {
  DEVICE_ID_PATTERN, listKioskDevices, parseKioskCommand, recordKioskHeartbeat,
} from '../lib/kiosk-fleet.js'

/**
 * Flotta kiosk (§4.5/§12): heartbeat dai tablet, elenco per la regia e comandi
 * remoti (via lo stream SSE già aperto da ogni client — nessun canale nuovo).
 */
export const kioskRouter = new Hono()

function cleanLabel(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, max)
  return text || undefined
}

function boundedInt(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : undefined
}

kioskRouter.post('/heartbeat', async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body || typeof body.deviceId !== 'string' || !DEVICE_ID_PATTERN.test(body.deviceId)) {
    return c.json({ error: 'deviceId non valido' }, 400)
  }
  const accepted = recordKioskHeartbeat({
    deviceId: body.deviceId,
    name: cleanLabel(body.name, 60),
    battery: boundedInt(body.battery, 0, 100),
    charging: typeof body.charging === 'boolean' ? body.charging : undefined,
    screenOn: typeof body.screenOn === 'boolean' ? body.screenOn : undefined,
    brightness: boundedInt(body.brightness, 0, 255),
    screensaver: typeof body.screensaver === 'boolean' ? body.screensaver : undefined,
    page: cleanLabel(body.page, 120),
    memoryMb: boundedInt(body.memoryMb, 0, 1_000_000),
    fully: enumValue(body.fully, ['available', 'unavailable', 'blocked']),
    nativeAudio: typeof body.nativeAudio === 'boolean' ? body.nativeAudio : undefined,
    audioChannel: enumValue(body.audioChannel, ['initializing', 'ready', 'needs-interaction', 'error']),
    audioPlaying: typeof body.audioPlaying === 'boolean' ? body.audioPlaying : undefined,
  })
  return accepted ? c.json({ ok: true as const }) : c.json({ error: 'Heartbeat rifiutato' }, 400)
})

kioskRouter.get('/devices', adminOnly, (c) => c.json({ devices: listKioskDevices() }))

kioskRouter.post('/command', adminOnly, async (c) => {
  const body = await c.req.json<unknown>().catch(() => null)
  const command = parseKioskCommand(body)
  if (!command) return c.json({ error: 'Comando non valido' }, 400)
  broadcastKioskCommand(command.target, command.command, command.value)
  return c.json({ ok: true as const })
})
