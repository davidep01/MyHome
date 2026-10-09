/**
 * Redazione dei segreti per log, audit, export ed errori. Si applica a ogni
 * testo che esce dal core: un token HA in un'eccezione non deve mai arrivare
 * a un log o al browser (test T45).
 */
import { redact } from './secret-patterns.js'

export { redact }

/** Segreti noti del processo, da cercare anche in forma letterale. */
export function knownSecrets(): string[] {
  return [process.env.HA_TOKEN, process.env.SUPERVISOR_TOKEN, process.env.HOME_AI_HA_TOKEN, process.env.MYHOME_ADMIN_TOKEN, process.env.MYHOME_KIOSK_TOKEN]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
}

export function redactAll(text: string): string {
  return redact(text, knownSecrets())
}
