import { Hono } from 'hono'
import { db } from '../db/client.js'
import { getHABaseUrl, getHAConfig } from '../lib/ha-config.js'
import { getStreamStats } from '../lib/ha-stream.js'
import { desktopOnly } from '../lib/security.js'
import { configuredIntegrations } from '../lib/integration-config.js'
import { getAuditLog } from '../lib/audit-log.js'

/**
 * Diagnostica per la regia desktop: salute HA (raggiungibilità + latenza),
 * stato del bridge stream, storage e chiavi integrazione presenti — sempre
 * come boolean, mai i valori.
 */
export const systemRouter = new Hono()

systemRouter.use('*', desktopOnly)

// Log amministrativo azioni critiche (§3): aperture, disarmi, sirene.
systemRouter.get('/audit', (c) => c.json({ entries: getAuditLog() }))

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
      haStatus = {
        reachable: false,
        latencyMs: null,
        message: error instanceof Error ? error.message : 'Home Assistant non raggiungibile',
      }
    }
  }

  return c.json({
    ha: { ...haStatus, url: ha.haUrl, source: ha.source, locked: ha.locked },
    stream: getStreamStats(),
    storage: { mode: db.mode, writable: db.writable },
    integrations: configuredIntegrations(),
    now: new Date().toISOString(),
  })
})
