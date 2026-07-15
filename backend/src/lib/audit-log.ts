/**
 * Log amministrativo delle azioni critiche (§3): chi ha aperto cosa, quando.
 * Ring buffer in memoria (200 voci) esposto alla regia via /api/system/audit —
 * non è un sistema di audit forense, è la risposta a "chi ha aperto il
 * cancello alle 15:04?" senza andare a scavare nel logbook di HA.
 */

export interface AuditEntry {
  at: string
  role: 'admin' | 'kiosk'
  domain: string
  service: string
  entityIds: string[]
}

const MAX_ENTRIES = 200
let entries: AuditEntry[] = []

/** Domini/servizi che aprono, disarmano o spengono: quelli che vale la pena ricordare. */
const CRITICAL_SERVICES: Record<string, Set<string>> = {
  lock: new Set(['unlock', 'open']),
  cover: new Set(['open_cover']),
  valve: new Set(['open_valve']),
  alarm_control_panel: new Set(['alarm_disarm']),
  siren: new Set(['turn_on', 'turn_off', 'toggle']),
  homeassistant: new Set(['turn_off']),
}

export function isCriticalAction(domain: string, service: string): boolean {
  return CRITICAL_SERVICES[domain]?.has(service) ?? false
}

export function recordCriticalAction(role: 'admin' | 'kiosk', domain: string, service: string, entityIds: string[]): void {
  entries.push({ at: new Date().toISOString(), role, domain, service, entityIds })
  if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES)
}

/** Più recenti per prime. */
export function getAuditLog(): AuditEntry[] {
  return [...entries].reverse()
}

export function resetAuditLog(): void {
  entries = []
}
