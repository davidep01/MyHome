/**
 * Redazione dei segreti per log, audit, export ed errori. Si applica a ogni
 * testo che esce dal core: un token HA in un'eccezione non deve mai arrivare
 * a un log o al browser (test T45).
 */
const SECRET_PATTERNS: RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWT (token HA long-lived)
  /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(access_token|token|authSig|api[_-]?key|password|secret)=([^&\s"']+)/gi,
  /"(access_token|token|password|secret|api_key)"\s*:\s*"[^"]*"/gi,
]

export function redact(text: string, extraSecrets: string[] = []): string {
  let out = text
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('[REDATTO]')
  }
  out = out
    .replace(SECRET_PATTERNS[0], '[REDATTO]')
    .replace(SECRET_PATTERNS[1], '$1 [REDATTO]')
    .replace(SECRET_PATTERNS[2], '$1=[REDATTO]')
    .replace(SECRET_PATTERNS[3], '"$1":"[REDATTO]"')
  return out
}

/** Segreti noti del processo, da cercare anche in forma letterale. */
export function knownSecrets(): string[] {
  return [process.env.HA_TOKEN, process.env.SUPERVISOR_TOKEN, process.env.HOME_AI_HA_TOKEN, process.env.MYHOME_ADMIN_TOKEN, process.env.MYHOME_KIOSK_TOKEN]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
}

export function redactAll(text: string): string {
  return redact(text, knownSecrets())
}
