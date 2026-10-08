/**
 * Ponte minimo verso il Supervisor di Home Assistant.
 *
 * "Controlla e aggiorna ora" chiedeva a HA di rileggere l'entità `update.*`,
 * ma HA si limita a ripetere ciò che sa il Supervisor: finché il Supervisor
 * non rilegge il repository (lo fa da solo ogni qualche ora) la nuova
 * versione non esiste e l'aggiornamento "non parte". Qui si forza quella
 * rilettura: `POST /store/reload`, che richiede `hassio_api: true` e il ruolo
 * `manager` nel manifest dell'add-on. Fuori dall'add-on (Docker standalone)
 * non c'è Supervisor e la funzione lo dice invece di fingere un successo.
 */

const SUPERVISOR_URL = 'http://supervisor'
const RELOAD_TIMEOUT_MS = 60_000

export type StoreReloadResult =
  | { ok: true }
  | { ok: false; reason: 'no-supervisor' | 'forbidden' | 'failed' }

export async function reloadAddonStore(
  fetchImpl: typeof fetch = fetch,
  token: string | undefined = process.env.SUPERVISOR_TOKEN,
): Promise<StoreReloadResult> {
  if (!token) return { ok: false, reason: 'no-supervisor' }
  try {
    const res = await fetchImpl(`${SUPERVISOR_URL}/store/reload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(RELOAD_TIMEOUT_MS),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'forbidden' }
    return res.ok ? { ok: true } : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
