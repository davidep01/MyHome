/**
 * Salute del servizio nel tempo (§4.3): la regia deve poter rispondere a
 * "regge?" e non solo a "risponde adesso?". Due ring buffer in memoria, zero
 * persistenza: dopo un riavvio si riparte puliti, ed è corretto così — la
 * domanda è sempre "com'è andata da quando è acceso".
 */

export type ErrorScope = 'ha' | 'stream' | 'storage' | 'ai' | 'weather'

export interface ServiceError {
  at: string
  scope: ErrorScope
  message: string
  /** Ripetizioni consecutive dello stesso errore, collassate in una voce. */
  count: number
}

export interface BridgeHealth {
  startedAt: string
  connectedSince: string | null
  /** Cadute del ponte dati da quando il servizio è acceso. */
  disconnections: number
  lastDisconnectAt: string | null
  lastDisconnectReason: string | null
}

const MAX_ERRORS = 60
const MAX_MESSAGE = 200

const startedAt = new Date().toISOString()
let connectedSince: string | null = null
let disconnections = 0
let lastDisconnectAt: string | null = null
let lastDisconnectReason: string | null = null
let errors: ServiceError[] = []

export function recordBridgeUp(): void {
  if (connectedSince) return
  connectedSince = new Date().toISOString()
}

/** Idempotente: il ponte segnala la caduta da più punti (WS, poll, teardown). */
export function recordBridgeDown(reason: string): void {
  if (!connectedSince) return
  connectedSince = null
  disconnections += 1
  lastDisconnectAt = new Date().toISOString()
  lastDisconnectReason = reason.slice(0, MAX_MESSAGE)
}

export function getBridgeHealth(): BridgeHealth {
  return { startedAt, connectedSince, disconnections, lastDisconnectAt, lastDisconnectReason }
}

/**
 * Errori consecutivi identici collassano in una voce con contatore: un HA
 * irraggiungibile per un'ora deve restare UNA riga, non riempire il buffer
 * nascondendo tutto il resto.
 */
export function recordServiceError(scope: ErrorScope, message: unknown): void {
  const text = (message instanceof Error ? message.message : String(message ?? 'errore sconosciuto'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE)
  if (!text) return
  const last = errors[errors.length - 1]
  if (last && last.scope === scope && last.message === text) {
    last.count += 1
    last.at = new Date().toISOString()
    return
  }
  errors.push({ at: new Date().toISOString(), scope, message: text, count: 1 })
  if (errors.length > MAX_ERRORS) errors = errors.slice(errors.length - MAX_ERRORS)
}

/** Più recenti per primi. */
export function getServiceErrors(): ServiceError[] {
  return [...errors].reverse()
}

export function resetServiceHealth(): void {
  connectedSince = null
  disconnections = 0
  lastDisconnectAt = null
  lastDisconnectReason = null
  errors = []
}
