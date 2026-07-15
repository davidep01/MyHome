/**
 * Registro della flotta kiosk (§4.5): ogni tablet manda un heartbeat periodico
 * con il proprio stato (batteria, schermo, luminosità, pagina); la regia lo
 * legge da /api/kiosk/devices. Solo memoria: a ogni riavvio del servizio i
 * tablet ricompaiono al primo heartbeat (≤60s), niente da persistere.
 */

export interface KioskHeartbeat {
  deviceId: string
  name?: string
  battery?: number
  charging?: boolean
  screenOn?: boolean
  brightness?: number
  screensaver?: boolean
  page?: string
  memoryMb?: number
}

export interface KioskDeviceStatus extends KioskHeartbeat {
  lastSeenAt: string
  online: boolean
}

export const KIOSK_ONLINE_WINDOW_MS = 150_000
const MAX_DEVICES = 20
export const DEVICE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i

interface StoredDevice extends KioskHeartbeat {
  lastSeen: number
}

const devices = new Map<string, StoredDevice>()

export function recordKioskHeartbeat(heartbeat: KioskHeartbeat, now = Date.now()): boolean {
  if (!DEVICE_ID_PATTERN.test(heartbeat.deviceId)) return false
  if (!devices.has(heartbeat.deviceId) && devices.size >= MAX_DEVICES) {
    // Fa spazio scartando il dispositivo più stantio: una flotta domestica
    // reale non arriva mai a 20, ma un client difettoso non deve saturare.
    let stalest: string | null = null
    let stalestSeen = Infinity
    for (const [id, device] of devices) {
      if (device.lastSeen < stalestSeen) { stalest = id; stalestSeen = device.lastSeen }
    }
    if (stalest) devices.delete(stalest)
  }
  devices.set(heartbeat.deviceId, { ...heartbeat, lastSeen: now })
  return true
}

export function listKioskDevices(now = Date.now()): KioskDeviceStatus[] {
  return [...devices.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map(({ lastSeen, ...device }) => ({
      ...device,
      lastSeenAt: new Date(lastSeen).toISOString(),
      online: now - lastSeen < KIOSK_ONLINE_WINDOW_MS,
    }))
}

export function resetKioskFleet(): void {
  devices.clear()
}

// ── Comandi remoti (§4.5/§12) ────────────────────────────────────────────────

export const KIOSK_COMMANDS = ['reload', 'screenOn', 'screenOff', 'brightness', 'say', 'screensaverStart', 'screensaverStop', 'restart'] as const
export type KioskCommandName = typeof KIOSK_COMMANDS[number]

export interface KioskCommand {
  target: string
  command: KioskCommandName
  value?: number | string
}

/** Valida e normalizza un comando dalla regia; null se malformato. */
export function parseKioskCommand(input: unknown): KioskCommand | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  if (!Object.keys(record).every((key) => ['target', 'command', 'value'].includes(key))) return null
  const target = record.target
  const command = record.command
  if (typeof target !== 'string' || (target !== 'all' && !DEVICE_ID_PATTERN.test(target))) return null
  if (typeof command !== 'string' || !(KIOSK_COMMANDS as readonly string[]).includes(command)) return null

  if (command === 'brightness') {
    const value = record.value
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) return null
    return { target, command, value }
  }
  if (command === 'say') {
    const value = record.value
    if (typeof value !== 'string') return null
    const text = value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim()
    if (!text || text.length > 200) return null
    return { target, command, value: text }
  }
  if (record.value !== undefined) return null
  return { target, command: command as KioskCommandName }
}
