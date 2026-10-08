import { renameSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Context } from 'hono'
import { HomeAiCore } from './core.js'
import { openCoreStore } from './storage/db.js'
import { createBackup, listBackups, prepareRestore } from './storage/backup.js'
import { assertSafeEnvironment } from './config.js'
import { createHomeAiRouter } from './api/routes.js'
import { BridgeFeedAdapter, type BridgeEvent } from './adapters/ha-feed.js'
import { HAReadGateway } from './adapters/ha-gateway.js'
import { contextIdFromServiceResponse } from './ingestion/telemetry.js'
import { demoForecastPort, openWeatherPort } from './weather/ports.js'
import { noForecast } from './weather/forecast.js'
import { redactAll } from './domain/redact.js'
// Integrazione con il backend esistente: SOLO letture e ruoli. Il core non
// importa il proxy dei servizi né alcun client di comando.
import { subscribeHaStream } from '../lib/ha-stream.js'
import { getHABaseUrl, getHAConfig } from '../lib/ha-config.js'
import { authConfiguration, authRole } from '../lib/security.js'
import { readForecastForCore } from '../routes/weather.js'
import { db as dashboardDb } from '../db/client.js'

/**
 * Avvio supervisionato di HOME AI CORE dentro il backend MyHome.
 *
 * Il core è isolato: un suo guasto (archivio pieno, configurazione respinta,
 * `node:sqlite` assente) lo mette in stato "disattivo/degradato" ma non tocca
 * la dashboard né i comandi manuali (specifica §20, §28).
 */

let core: HomeAiCore | null = null
let disabledReason: string | null = 'Avvio in corso.'
let unsubscribeFeed: (() => void) | null = null
let feed: BridgeFeedAdapter | null = null
let timer: ReturnType<typeof setInterval> | null = null
let dbPath = ''
let lastRestoreVerifiedAt: string | null = null
let haReachable: boolean | null = null
let candidateCache: { at: number; list: { entity_id: string; label: string; state: string }[] } = { at: 0, list: [] }
let processScheduled = false
/** Dispositivi attivati nella dashboard (scorciatoia per la selezione opt-in). */
let dashboardSnapshot: string[] = []

// Stessa risoluzione di db/client.ts: il core vive accanto al db della dashboard
// sia con tsx (sorgenti) sia nel bundle tsup (dist/), dove import.meta.url cambia.
const backendRoot = basename(process.cwd()) === 'backend' ? process.cwd() : join(process.cwd(), 'backend')

function corePath(): string {
  if (process.env.HOME_AI_DB_PATH) return process.env.HOME_AI_DB_PATH
  const dashboard = process.env.MYHOME_DB_PATH ?? join(backendRoot, 'data/db.json')
  return join(dirname(dashboard), 'home-ai.sqlite')
}

const backupDir = () => join(dirname(dbPath), 'home-ai-backups')
// La chiave sta FUORI dalla cartella dei backup: mai nello stesso pacchetto.
const keyPath = () => join(dirname(dbPath), 'home-ai-backup.key')

function gateway(): HAReadGateway {
  return new HAReadGateway({
    baseUrl: getHABaseUrl,
    token: async () => (await getHAConfig()).haToken ?? '',
    audit: (entry) => core?.audit.record({ actor: 'gateway', action: entry.action, outcome: entry.outcome, detail: entry.detail }),
  })
}

async function refreshCandidates(): Promise<void> {
  if (Date.now() - candidateCache.at < 60_000) return
  try {
    const states = await gateway().readStates()
    haReachable = true
    if (!Array.isArray(states)) return
    candidateCache = {
      at: Date.now(),
      list: states.slice(0, 2_000).map((raw) => {
        const s = raw as { entity_id?: unknown; state?: unknown; attributes?: { friendly_name?: unknown } }
        return {
          entity_id: String(s.entity_id ?? '').slice(0, 128),
          label: typeof s.attributes?.friendly_name === 'string' ? s.attributes.friendly_name.slice(0, 80) : String(s.entity_id ?? ''),
          state: String(s.state ?? '').slice(0, 40),
        }
      }).filter((s) => /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/.test(s.entity_id)),
    }
  } catch {
    haReachable = false
  }
}

function scheduleProcess(): void {
  if (processScheduled) return
  processScheduled = true
  setTimeout(() => {
    processScheduled = false
    try { core?.process() } catch { /* il core segnala il degrado nello stato */ }
  }, 250).unref?.()
}

/** Applica la configurazione corrente: fonte meteo e iscrizione al ponte HA. */
function applyRuntime(): void {
  if (!core) return
  const config = core.config()
  const weather = config.sources.weather
  core.setForecastPort(
    config.runtime.demo ? demoForecastPort
      : weather.adapter === 'myhome_openweather' && weather.external_network_enabled ? openWeatherPort(readForecastForCore, weather.forecast_ttl_minutes)
        : noForecast,
  )
  const observe = !config.runtime.demo && config.sources.home_assistant.enabled && config.privacy.real_observation_enabled
  if (observe && !unsubscribeFeed) {
    const instance = core
    feed = new BridgeFeedAdapter({
      clock: instance.clock,
      selected: () => instance.catalog.selectedIds(),
      presenceEntities: () => new Set(instance.config().sources.home_assistant.presence_entities),
      personalProfiles: () => instance.config().privacy.personal_profiles_enabled,
      currentState: (id) => instance.projection.get(id)?.value ?? null,
      operationForContext: (id) => instance.telemetry.operationForContext(id),
      emit: (event) => { instance.ingest(event, { demo: false }); scheduleProcess() },
    })
    unsubscribeFeed = subscribeHaStream((event) => {
      haReachable = event.type === 'error' ? false : event.type === 'status' ? Boolean((event as { connected?: boolean }).connected) : true
      try { feed?.handle(event as BridgeEvent) } catch { /* evento non valido: già in quarantena o scartato */ }
    })
  } else if (!observe && unsubscribeFeed) {
    unsubscribeFeed()
    unsubscribeFeed = null
    feed = null
  }
}

/**
 * `reapply`: tombstone da riapplicare subito dopo l'apertura dell'archivio,
 * prima di catalogo, ponte HA, demo e timer — cioè prima di ogni rielaborazione (T49).
 */
export async function startHomeAiCore(opts: { reapply?: ReturnType<HomeAiCore['privacy']['tombstones']> } = {}): Promise<number> {
  if (core || process.env.HOME_AI_CORE === 'off') {
    if (process.env.HOME_AI_CORE === 'off') disabledReason = 'Disattivato con HOME_AI_CORE=off.'
    return 0
  }
  try {
    assertSafeEnvironment(process.env)
  } catch (error) {
    disabledReason = redactAll(error instanceof Error ? error.message : 'configurazione respinta')
    console.error('[home-ai] avvio rifiutato:', disabledReason)
    return 0
  }
  dbPath = corePath()
  try {
    const store = await openCoreStore(dbPath)
    core = new HomeAiCore({
      store,
      entityInfo: (id) => ({ label: candidateCache.list.find((c) => c.entity_id === id)?.label ?? id, area_id: null }),
    })
    core.config() // validazione: una configurazione salvata non valida respinge l'avvio
    disabledReason = null
  } catch (error) {
    core = null
    disabledReason = `Archivio o configurazione del core non disponibili: ${redactAll(error instanceof Error ? error.message : 'errore')}`.slice(0, 280)
    console.error('[home-ai]', disabledReason)
    return 0
  }
  const reapplied = opts.reapply?.length ? core.privacy.reapplyTombstones(opts.reapply) : 0
  await refreshCandidates()
  core.rebuildCatalog()
  applyRuntime()
  const config = core.config()
  if (config.runtime.demo && config.sources.fixtures.enabled && !core.store.getMeta('demo_seeded_until')) {
    void core.seedDemo().catch((error) => console.error('[home-ai] demo non caricata', error instanceof Error ? error.name : 'errore'))
  }
  timer = setInterval(() => {
    void core?.tick().catch(() => { /* stato degradato già esposto */ })
    void refreshCandidates()
  }, 15_000)
  timer.unref?.()
  console.log(`🧠 HOME AI CORE attivo (${config.runtime.mode}${config.runtime.demo ? ', demo' : ''}) — nessun comando fisico.`)
  return reapplied
}

export function stopHomeAiCore(): void {
  if (timer) clearInterval(timer)
  timer = null
  unsubscribeFeed?.()
  unsubscribeFeed = null
  core?.store.close()
  core = null
  disabledReason = 'Fermato.'
}

/**
 * Esito del percorso manuale esistente (proxy servizi della dashboard).
 * Fire-and-forget: non ritarda né ripete il comando, non lo reinvia mai.
 */
export function recordManualResultFromProxy(operationId: string | undefined, response: Response): void {
  if (!core || !operationId || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(operationId)) return
  const instance = core
  const status = response.status
  const result = response.ok ? 'accepted' : status >= 500 || status === 0 ? 'unknown' : 'failed'
  void response.clone().json().catch(() => null).then((body) => {
    try { instance.telemetry.recordResult({ operation_id: operationId, result, ha_status: status }, contextIdFromServiceResponse(body)) } catch { /* telemetria best effort */ }
  })
}

const roleOf = (c: Context): 'admin' | 'kiosk' | null => authRole(c.req.raw)

export const homeAiRouter = createHomeAiRouter({
  core: () => core,
  disabledReason: () => disabledReason,
  role: roleOf,
  authMode: () => (authConfiguration().mode === 'required' ? 'required' : 'disabled'),
  haReachable: () => haReachable,
  candidateEntities: () => { void refreshCandidates(); return candidateCache.list },
  dashboardEntities: () => {
    // Ultima configurazione nota della dashboard (aggiornata in background): i dispositivi attivati nel wizard.
    void refreshDashboardSnapshot()
    return dashboardSnapshot
  },
  onConfigChanged: () => { core?.rebuildCatalog(); applyRuntime() },
  backups: {
    list: () => (dbPath ? listBackups(backupDir()) : []),
    create: async () => {
      if (!core) throw new Error('core non attivo')
      const info = await createBackup(core.store, backupDir(), keyPath(), new Date())
      core.audit.record({ actor: 'device-admin', action: 'backup.create', outcome: 'ok', detail: info.id })
      return { id: info.id, created_at: info.created_at }
    },
    restore: async (id: string) => {
      if (!core) throw new Error('core non attivo')
      const tombstones = core.privacy.tombstones()
      const prepared = await prepareRestore(core.store, backupDir(), keyPath(), id, dbPath, new Date())
      stopHomeAiCore()
      for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true })
      renameSync(prepared.restoredFile, dbPath)
      // Le cancellazioni già richieste valgono anche dopo il ripristino (T49).
      const reapplied = await startHomeAiCore({ reapply: tombstones })
      lastRestoreVerifiedAt = new Date().toISOString()
      ;(core as HomeAiCore | null)?.audit.record({ actor: 'device-admin', action: 'backup.restore', outcome: 'ok', detail: `${id}; copia precedente salvata` })
      return { restored_from: id, tombstones_reapplied: reapplied }
    },
    lastRestoreVerifiedAt: () => lastRestoreVerifiedAt,
  },
})

async function refreshDashboardSnapshot(): Promise<void> {
  try {
    const store = await dashboardDb.read()
    dashboardSnapshot = Object.entries(store.config.deviceOverrides ?? {})
      .filter(([, override]) => (override as { enabled?: boolean }).enabled === true)
      .map(([id]) => id)
      .slice(0, 1_000)
  } catch { /* lettura best effort */ }
}
export function homeAiCoreForTests(): HomeAiCore | null { return core }
