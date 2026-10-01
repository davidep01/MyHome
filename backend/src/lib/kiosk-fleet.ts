import { randomUUID } from 'node:crypto'
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
  fully?: 'available' | 'unavailable' | 'blocked'
  nativeAudio?: boolean
  audioChannel?: 'initializing' | 'ready' | 'needs-interaction' | 'error'
  audioPlaying?: boolean
}

/**
 * Esito dell'ultimo comando remoto. Serve perché l'invio è un broadcast SSE:
 * il server sa di averlo trasmesso, non che qualcuno l'abbia eseguito. Senza
 * questo la regia dichiarava "Comando inviato" anche quando sul tablet non
 * poteva succedere nulla.
 */
export interface KioskCommandResult {
  commandId: string
  status: 'pending' | 'accepted' | 'completed' | 'failed'
  command: string
  ok: boolean
  /** Perché non è stato eseguito ('no-bridge' | 'unsupported'). */
  reason?: string
  at: string
}

export interface KioskDeviceStatus extends KioskHeartbeat {
  lastSeenAt: string
  online: boolean
  lastCommand?: KioskCommandResult
}

export const KIOSK_ONLINE_WINDOW_MS = 150_000
const MAX_DEVICES = 20
export const DEVICE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i

interface StoredDevice extends KioskHeartbeat {
  lastSeen: number
  lastCommand?: KioskCommandResult
}

const devices = new Map<string, StoredDevice>()
const pendingCommands = new Map<string, { command: string; targets: Set<string>; expires: number }>()

export function issueKioskCommand(input: KioskCommand, now = Date.now()): string | null {
  for (const [id, item] of pendingCommands) if (item.expires <= now) pendingCommands.delete(id)
  const targets = input.target === 'all' ? [...devices.keys()] : devices.has(input.target) ? [input.target] : []
  if (!targets.length || pendingCommands.size >= 100) return null
  const commandId = randomUUID()
  pendingCommands.set(commandId, { command: input.command, targets: new Set(targets), expires: now + 90_000 })
  for (const target of targets) devices.get(target)!.lastCommand = {
    commandId, command: input.command, status: 'pending', ok: false, at: new Date(now).toISOString(),
  }
  return commandId
}

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
  // L'heartbeat non deve cancellare l'esito dell'ultimo comando.
  const previous = devices.get(heartbeat.deviceId)
  devices.set(heartbeat.deviceId, { ...heartbeat, lastSeen: now, lastCommand: previous?.lastCommand })
  return true
}

/** Riscontro dal tablet: eseguito, oppure perché no. */
export function recordKioskCommandResult(
  deviceId: string,
  result: { commandId: string; command: string; ok: boolean; reason?: string; status?: 'accepted' | 'completed' },
  now = Date.now(),
): boolean {
  const device = devices.get(deviceId)
  const pending = pendingCommands.get(result.commandId)
  if (!device || !pending || pending.expires <= now || pending.command !== result.command
    || !pending.targets.has(deviceId) || device.lastCommand?.commandId !== result.commandId) return false
  if (device.lastCommand.status === 'completed' || device.lastCommand.status === 'failed') return false
  device.lastCommand = {
    commandId: result.commandId,
    status: result.ok ? result.status ?? 'completed' : 'failed',
    command: result.command.slice(0, 40),
    ok: result.ok,
    ...(result.reason ? { reason: result.reason.slice(0, 40) } : {}),
    at: new Date(now).toISOString(),
  }
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
  pendingCommands.clear()
}

// ── Comandi remoti (§4.5/§12) ────────────────────────────────────────────────

export const KIOSK_COMMANDS = ['reload', 'screenOn', 'screenOff', 'brightness', 'say', 'screensaverStart', 'screensaverStop', 'audioTest', 'restart'] as const
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
