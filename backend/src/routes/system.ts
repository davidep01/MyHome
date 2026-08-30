import { Hono } from 'hono'
import { db } from '../db/client.js'
import { getHABaseUrl, getHAConfig } from '../lib/ha-config.js'
import { getStreamStats } from '../lib/ha-stream.js'
import { desktopOnly } from '../lib/security.js'
import { configuredIntegrations } from '../lib/integration-config.js'
import { getAuditLog } from '../lib/audit-log.js'
import { getBridgeHealth, getServiceErrors, recordServiceError } from '../lib/service-health.js'
import { getUpdateInfo } from '../lib/update-check.js'

/**
 * Diagnostica per la regia desktop: salute HA (raggiungibilità + latenza),
 * stato del bridge stream, storage e chiavi integrazione presenti — sempre
 * come boolean, mai i valori.
 */
export const systemRouter = new Hono()

systemRouter.use('*', desktopOnly)

// Log amministrativo azioni critiche (§3): aperture, disarmi, sirene.
systemRouter.get('/audit', (c) => c.json({ entries: getAuditLog() }))

// Errori recenti del servizio: cosa è fallito, non solo cosa è riuscito.
systemRouter.get('/errors', (c) => c.json({ entries: getServiceErrors() }))

// Ultima versione pubblicata (cache 6h lato server). Il confronto lo fa il client.
systemRouter.get('/update', async (c) => c.json(await getUpdateInfo(c.req.query('force') === '1')))

systemRouter.get('/status', async (c) => {
  const ha = await getHAConfig()

  let haStatus: { reachable: boolean; latencyMs: number | null; message?: string }
  if (!ha.valid) {
    haStatus = { reachable: false, latencyMs: null, message: 'URL Home Assistant non valido' }
  } else if (!ha.haToken) {
    haStatus = { reachable: false, latencyMs: null, message: 'Token Home Assistant mancante' }
  } else {
    const t0 = Date.now()
    try {
      const res = await fetch(`${await getHABaseUrl()}/api/`, {
        headers: { Authorization: `Bearer ${ha.haToken}` },
        signal: AbortSignal.timeout(5000),
      })
      haStatus = {
        reachable: res.ok,
        latencyMs: Date.now() - t0,
        message: res.ok ? undefined : `Home Assistant risponde ${res.status}`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Home Assistant non raggiungibile'
      recordServiceError('ha', `Home Assistant non raggiungibile: ${message}`)
      haStatus = { reachable: false, latencyMs: null, message }
    }
  }

  return c.json({
    ha: { ...haStatus, url: ha.haUrl, source: ha.source, locked: ha.locked },
    stream: getStreamStats(),
    health: getBridgeHealth(),
    storage: { mode: db.mode, writable: db.writable },
    integrations: configuredIntegrations(),
    now: new Date().toISOString(),
  })
})
