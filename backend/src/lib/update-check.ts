import { fetchWithLimits } from './request-safety.js'
import { recordServiceError } from './service-health.js'

/**
 * Controllo aggiornamenti (§4.4): la regia mostrava la versione installata e
 * nient'altro, quindi non c'era modo di sapere di essere indietro.
 *
 * La sorgente è il manifest dell'add-on su `main`, che la CI riallinea a ogni
 * rilascio: URL fisso, nessun input utente, nessuna credenziale. Il confronto
 * lo fa il client, che è l'unico a conoscere la propria `__APP_VERSION__`.
 */

const MANIFEST_URL = 'https://raw.githubusercontent.com/davidep01/MyHome/main/ha-addon/config.yaml'
const ALLOWED_HOSTS = new Set(['raw.githubusercontent.com'])
const TTL_MS = 6 * 60 * 60 * 1_000
const TIMEOUT_MS = 6_000
const MAX_BYTES = 32_768
const VERSION_LINE = /^version:\s*"?(\d+\.\d+\.\d+)"?\s*$/m

export interface UpdateInfo {
  /** Ultima versione pubblicata, o null se il controllo non è riuscito. */
  latest: string | null
  checkedAt: string
  error?: string
}

let cached: { at: number; value: UpdateInfo } | null = null
let inFlight: Promise<UpdateInfo> | null = null

/** Estrae la versione dal manifest YAML senza aggiungere un parser YAML. */
export function parseAddonVersion(manifest: string): string | null {
  return VERSION_LINE.exec(manifest)?.[1] ?? null
}

async function check(): Promise<UpdateInfo> {
  try {
    const { bytes } = await fetchWithLimits(MANIFEST_URL, { method: 'GET' }, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      maxRedirects: 2,
      requirePublicHttps: true,
      allowedHosts: ALLOWED_HOSTS,
    })
    const latest = parseAddonVersion(new TextDecoder('utf-8').decode(bytes))
    if (!latest) throw new Error('manifest senza versione')
    return { latest, checkedAt: new Date().toISOString() }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'controllo non riuscito'
    recordServiceError('ha', `Controllo aggiornamenti non riuscito: ${message}`)
    return { latest: null, checkedAt: new Date().toISOString(), error: message }
  }
}

/**
 * Una sola richiesta in volo e risposta in cache 6h: N schede di regia aperte
 * non diventano N chiamate a GitHub.
 */
export async function getUpdateInfo(force = false): Promise<UpdateInfo> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value
  if (inFlight) return inFlight
  inFlight = check().then((value) => {
    cached = { at: Date.now(), value }
    inFlight = null
    return value
  }).catch((error) => {
    inFlight = null
    throw error
  })
  return inFlight
}

export function resetUpdateCheck(): void {
  cached = null
  inFlight = null
}
