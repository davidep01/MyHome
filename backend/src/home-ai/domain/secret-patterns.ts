/**
 * Riconoscimento dei segreti SOLO per forma (JWT, Bearer, `token=`, campi
 * JSON sensibili). Modulo puro, senza accesso all'ambiente: può usarlo anche
 * codice che non deve mai vedere le credenziali (manuale, futuro reasoner).
 * La redazione che conosce anche i segreti del processo è in `redact.ts`.
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

/** true se il testo contiene qualcosa che ha la forma di una credenziale. */
export function looksLikeSecret(text: string): boolean {
  return redact(text) !== text
}
