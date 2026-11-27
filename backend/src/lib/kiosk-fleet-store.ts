import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { persistableKioskFleet, restoreKioskFleet } from './kiosk-fleet.js'

/**
 * Memoria dei tablet conosciuti, accanto a `db.json` (add-on: `/data`).
 * File separato di proposito: un heartbeat non deve fare read-modify-write
 * dell'intero documento di configurazione, né incrementarne la versione.
 */

/** Un nuovo `lastSeen` si scrive al più ogni 10 minuti: "offline da" non ha bisogno del secondo. */
export const KIOSK_PERSIST_INTERVAL_MS = 10 * 60_000

export function kioskFleetPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MYHOME_KIOSK_FLEET_PATH?.trim()) return resolve(env.MYHOME_KIOSK_FLEET_PATH.trim())
  if (env.MYHOME_DB_PATH?.trim()) return join(dirname(resolve(env.MYHOME_DB_PATH.trim())), 'kiosk-devices.json')
  const cwd = process.cwd()
  const backendRoot = basename(cwd) === 'backend' ? cwd : join(cwd, 'backend')
  return join(backendRoot, 'data/kiosk-devices.json')
}

function writesAllowed(env: NodeJS.ProcessEnv): boolean {
  // In test non si sporca la cartella dati del repository: chi testa lo store passa un percorso esplicito.
  return env.MYHOME_READ_ONLY !== 'true' && (env.NODE_ENV !== 'test' || Boolean(env.MYHOME_KIOSK_FLEET_PATH))
}

let loaded = false
let lastWrite = 0
let lastSignature = ''

/** Carica una sola volta i tablet ricordati. Un file assente o corrotto vale come "nessun tablet". */
export function ensureKioskFleetLoaded(path = kioskFleetPath(), now = Date.now()): void {
  if (loaded) return
  loaded = true
  try {
    if (!existsSync(path)) return
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { devices?: unknown }
    restoreKioskFleet(parsed?.devices, now)
    lastSignature = signature()
  } catch (error) {
    console.warn('[kiosk] elenco tablet illeggibile, si riparte da vuoto:', error instanceof Error ? error.message : error)
  }
}

function signature(): string {
  return persistableKioskFleet().map((device) => `${device.deviceId}:${device.name ?? ''}`).sort().join('|')
}

/**
 * Scrive se è comparso un tablet nuovo o rinominato, oppure se l'ultimo
 * salvataggio è più vecchio di {@link KIOSK_PERSIST_INTERVAL_MS}. Scrittura
 * atomica (tmp + rename); un errore di disco non tocca mai l'heartbeat.
 */
export function persistKioskFleetIfNeeded(path = kioskFleetPath(), now = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  if (!writesAllowed(env)) return false
  const current = signature()
  if (current === lastSignature && now - lastWrite < KIOSK_PERSIST_INTERVAL_MS) return false
  try {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, devices: persistableKioskFleet() }), { mode: 0o600 })
    renameSync(tmp, path)
    lastWrite = now
    lastSignature = current
    return true
  } catch (error) {
    console.warn('[kiosk] impossibile salvare l\'elenco tablet:', error instanceof Error ? error.message : error)
    return false
  }
}

/** Solo test: dimentica lo stato del caricamento. */
export function resetKioskFleetStore(): void {
  loaded = false
  lastWrite = 0
  lastSignature = ''
}
