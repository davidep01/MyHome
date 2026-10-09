import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { randomUUID } from 'node:crypto'
import { CoreError, physicalExecutionDisabled } from '../domain/errors.js'
import { redactAll } from '../domain/redact.js'
import { arr, bool, enm, nullable, num, obj, opt, parse, record, str, type Schema } from '../domain/schema.js'
import { EntityId, Id, LocalDate, Timezone, WasteRuleSchema } from '../domain/contracts.js'
import type { HomeAiCore } from '../core.js'
import { parseWasteIcs } from '../waste/ics.js'
import { StorageFailure } from '../storage/db.js'

/**
 * API locale di HOME AI CORE (specifica §21), montata su `/api/home-ai/v1`.
 *
 * - Ruoli dal backend autenticato di MyHome: `admin` = configuratore della
 *   regia, `kiosk` = tablet condiviso (vede solo lo scope del nucleo, mai
 *   episodi o abitudini personali — T44).
 * - Mutazioni con `Idempotency-Key` e revisione attesa; errori uniformi con
 *   codice, messaggio italiano e request ID.
 * - Nessun endpoint `/execute`, `/call-service`, `/publish-mqtt` o proxy
 *   generico: le richieste in tal senso sono bloccate e finiscono nell'audit.
 */

export type Role = 'admin' | 'kiosk'

export interface RouterDeps {
  core: () => HomeAiCore | null
  disabledReason: () => string | null
  role: (c: Context) => Role | null
  authMode: () => 'disabled' | 'required'
  haReachable: () => boolean | null
  backups: {
    list: () => { id: string; file: string; created_at: string; bytes: number }[]
    create: () => Promise<{ id: string; created_at: string }>
    restore: (id: string) => Promise<{ restored_from: string; tombstones_reapplied: number }>
    lastRestoreVerifiedAt: () => string | null
  }
  /** Entità HA selezionabili (sola lettura dal ponte della dashboard). */
  candidateEntities: () => { entity_id: string; label: string; state: string }[]
  /** Dispositivi attivati nel wizard della dashboard (scorciatoia di selezione). */
  dashboardEntities: () => string[]
  onConfigChanged: () => void
}

function requestId(): string { return `req-${randomUUID().slice(0, 12)}` }

function fail(c: Context, error: unknown) {
  const id = requestId()
  if (error instanceof CoreError) {
    return c.json({ error: error.message, code: error.code, request_id: id, details: error.details.map((d) => redactAll(d)) }, error.status as 400)
  }
  // Archivio non scrivibile (disco pieno, sola lettura): errore tipizzato, non un 500 generico (T48).
  if (error instanceof StorageFailure) {
    return c.json({ error: 'Archivio del core non scrivibile: la dashboard continua a funzionare.', code: 'STORAGE_UNAVAILABLE', request_id: id, details: [] }, 503)
  }
  console.error('[home-ai] errore', error instanceof Error ? error.name : 'Unknown', id)
  return c.json({ error: 'Errore interno del core.', code: 'INTERNAL', request_id: id, details: [] }, 500)
}

async function body<T>(c: Context, schema: Schema<T>): Promise<T> {
  let raw: unknown
  try { raw = await c.req.json() } catch { throw new CoreError('VALIDATION_ERROR', 'Corpo della richiesta non valido.') }
  const result = parse(schema, raw)
  if (!result.ok) throw new CoreError('VALIDATION_ERROR', 'Dati non validi.', result.issues.map((i) => `${i.path}: ${i.message}`))
  return result.value
}

const FeedbackBody = obj({
  kind: enm(['not_useful', 'wrong_context', 'never_suggest', 'forget', 'snooze', 'dismiss', 'done'] as const),
  note: opt(nullable(str({ max: 280 }))),
  snooze_minutes: opt(num({ min: 5, max: 1_440, integer: true })),
})
const ApproveBody = obj({
  purpose: enm(['save_preference', 'simulate_once'] as const),
  expected_revision: num({ min: 1, integer: true }),
  plan_hash: str({ min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }),
})
const SimulateBody = obj({ seed: opt(num({ min: 0, max: 2_147_483_647, integer: true })), inject_failure: opt(bool()) })
const ReminderFeedbackBody = obj({ kind: enm(['done', 'snooze', 'dismiss'] as const), snooze_minutes: opt(num({ min: 5, max: 1_440, integer: true })) })
const RevokeBody = obj({ revoke: bool(), expected_revision: num({ min: 1, integer: true }) })
const PrivacyBody = obj({
  expected_revision: num({ min: 0, integer: true }),
  real_observation_enabled: opt(bool()),
  real_learning_enabled: opt(bool()),
  personal_profiles_enabled: opt(bool()),
})
const DeleteBody = obj({
  entity_ids: arr(EntityId, { max: 100 }),
  subject_id: nullable(Id),
  pattern_id: nullable(Id),
  before: nullable(str({ max: 40, format: 'date-time' })),
  all: bool(),
  confirm: bool(),
})
const IcsImportBody = obj({
  kind: enm(['ics'] as const),
  content: str({ min: 1, max: 2 * 1_024 * 1_024 }),
  calendar_id: Id,
  municipality: str({ min: 1, max: 120 }),
  area: str({ min: 1, max: 120 }),
  timezone: Timezone,
  valid_from: LocalDate,
  valid_until: LocalDate,
  label_mapping: record(str({ max: 30, pattern: /^[a-z_]{1,30}$/ }), { maxProperties: 30, keyMax: 80 }),
  exposure: WasteRuleSchema.shape.exposure,
  reminders: WasteRuleSchema.shape.reminders,
})
const FlagsBody = obj({ guests: opt(bool()), away_mode: opt(bool()) })

function param(c: Context, name: string): string {
  return c.req.param(name) ?? ''
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createHomeAiRouter(deps: RouterDeps): Hono {
  const router = new Hono()

  const core = (): HomeAiCore => {
    const instance = deps.core()
    if (!instance) throw new CoreError('CORE_DISABLED', deps.disabledReason() ?? 'HOME AI CORE non è attivo.')
    return instance
  }
  const actorOf = (c: Context) => (deps.role(c) === 'admin' ? 'device-admin' : 'device-kiosk')
  const requireAdmin = (c: Context) => {
    if (deps.role(c) !== 'admin') throw new CoreError('FORBIDDEN_SCOPE', 'Serve il ruolo di configurazione della regia.')
  }
  const includePersonal = (c: Context) => deps.role(c) === 'admin' && Boolean(deps.core()?.config().privacy.personal_profiles_enabled)
  /** Un rientro è del nucleo, ma con `subject_id` identifica una persona: è un dato personale (T44). */
  const personalEpisode = (episode: { scope: { kind: string }; subject_id?: string | null }) => episode.scope.kind === 'person' || Boolean(episode.subject_id)
  const changed = () => deps.onConfigChanged()

  /** Le note del manuale non devono contenere i segreti del processo (es. il token HA scritto per errore). */
  const rejectProcessSecrets = (raw: unknown) => {
    const text = JSON.stringify(raw ?? null)
    if (redactAll(text) !== text) throw new CoreError('VALIDATION_ERROR', 'La nota sembra contenere una credenziale: il manuale non deve mai contenerne.')
  }

  /** Idempotency-Key obbligatoria per le mutazioni: la stessa chiave restituisce la stessa risposta. */
  const idempotent = async (c: Context, handler: () => Promise<{ status: number; body: unknown }>) => {
    const key = c.req.header('Idempotency-Key')
    if (!key || !/^[A-Za-z0-9_.:-]{8,100}$/.test(key)) throw new CoreError('VALIDATION_ERROR', 'Header Idempotency-Key mancante o non valido.')
    const store = core().store
    const route = `${c.req.method} ${c.req.path}`
    const previous = store.get('SELECT route, status, response FROM idempotency WHERE key = ?', key)
    if (previous) {
      if (String(previous.route) !== route) throw new CoreError('VALIDATION_ERROR', 'Idempotency-Key già usata per un’altra operazione.')
      return c.json(JSON.parse(String(previous.response)), Number(previous.status) as 200)
    }
    const result = await handler()
    // Archivio corrente: un ripristino da backup chiude e sostituisce quello letto prima.
    core().store.run('INSERT OR IGNORE INTO idempotency (key, route, status, response, created_at) VALUES (?, ?, ?, ?, ?)',
      key, route, result.status, JSON.stringify(result.body), core().clock.now().toISOString())
    return c.json(result.body, result.status as 200)
  }

  const wrap = (fn: (c: Context) => Promise<Response> | Response) => async (c: Context) => {
    try { return await fn(c) } catch (error) { return fail(c, error) }
  }

  // ── Barriera esplicita: nessuna esecuzione, mai (T40) ──────────────────────
  for (const path of [
    '/execute', '/execute/*', '/call-service', '/call-service/*', '/call_service', '/call_service/*',
    '/fire-event', '/fire-event/*', '/fire_event', '/fire_event/*',
    '/publish-mqtt', '/publish-mqtt/*', '/publish_mqtt', '/publish_mqtt/*', '/mqtt', '/mqtt/*',
    '/ha/*', '/services/*', '/proxy/*',
  ]) {
    router.all(path, (c) => {
      deps.core()?.audit.record({ actor: actorOf(c), action: `blocked:${c.req.method}`, outcome: 'blocked', reason_codes: ['PHYSICAL_EXECUTION_DISABLED'], detail: c.req.path.slice(0, 80) })
      return fail(c, physicalExecutionDisabled(c.req.path))
    })
  }

  router.get('/health', (c) => {
    const instance = deps.core()
    return c.json({
      status: instance ? (instance.store.degraded ? 'degraded' : 'ok') : 'disabled',
      reason: instance ? null : deps.disabledReason(),
      physical_execution: 'disabled',
      reasoner: 'not_configured',
    })
  })

  router.get('/status', wrap((c) => {
    const instance = core()
    const lastBackup = deps.backups.list()[0]?.created_at ?? null
    return c.json({
      health: instance.health({ haReachable: deps.haReachable(), lastBackupAt: lastBackup, lastRestoreVerifiedAt: deps.backups.lastRestoreVerifiedAt() }),
      coverage: instance.coverageReport(),
      metrics: deps.role(c) === 'admin' ? { ...instance.metrics, quarantine: instance.events.quarantineCount() } : undefined,
      reasoner: instance.reasoner.capabilities(),
      flags: instance.contexts.flags(),
      demo_seeded_until: instance.store.getMeta('demo_seeded_until'),
    })
  }))

  router.get('/context', wrap((c) => {
    const context = core().contexts.build(core().config())
    // Il tablet vede il contesto del nucleo; nessun dato personale è nel contesto.
    return c.json(deps.role(c) === 'admin' ? context : { ...context, states: context.states.map((s) => ({ entity_id: s.entity_id, value: { state: s.value.state, availability: s.value.availability }, stale: s.stale })) })
  }))

  router.get('/events', wrap((c) => {
    requireAdmin(c)
    const kinds = c.req.query('kinds')?.split(',').filter((k) => /^[a-z.]{3,40}$/.test(k))
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 100) || 100))
    const before = c.req.query('before')
    const instance = core()
    // Demo e dati reali non si mescolano mai nella stessa timeline.
    const demo = instance.config().runtime.demo
    return c.json({
      events: instance.events.list({ kinds, limit, before: before && /^\d{4}-/.test(before) ? before : undefined, includePersonal: includePersonal(c), demo }),
      gaps: instance.projection.openGaps(),
      demo,
    })
  }))

  router.post('/telemetry/manual-intents', wrap(async (c) => {
    const role = deps.role(c)
    if (!role) throw new CoreError('FORBIDDEN_SCOPE', 'Accesso richiesto.')
    let raw: unknown
    try { raw = await c.req.json() } catch { throw new CoreError('VALIDATION_ERROR', 'Corpo non valido.') }
    const instance = deps.core()
    if (!instance) return c.json({ status: 'disabled' }, 202)
    const result = instance.telemetry.recordIntent(raw, { role, authMode: deps.authMode() })
    // La ricevuta non dipende dall'elaborazione: un archivio degradato è già esposto in /status.
    try { instance.process() } catch { /* stato degradato già dichiarato */ }
    return c.json({ status: result.status }, 202)
  }))

  router.post('/telemetry/manual-results', wrap(async (c) => {
    if (!deps.role(c)) throw new CoreError('FORBIDDEN_SCOPE', 'Accesso richiesto.')
    let raw: unknown
    try { raw = await c.req.json() } catch { throw new CoreError('VALIDATION_ERROR', 'Corpo non valido.') }
    const instance = deps.core()
    if (!instance) return c.json({ status: 'disabled' }, 202)
    const result = instance.telemetry.recordResult(raw)
    return c.json({ status: result.status }, 202)
  }))

  router.get('/episodes', wrap((c) => {
    const instance = core()
    const demo = instance.config().runtime.demo
    const episodes = instance.arrivals.list({ demo, limit: 60 })
      .filter((episode) => includePersonal(c) || !personalEpisode(episode))
      .map((episode) => deps.role(c) === 'admin' ? episode : { ...episode, actions: episode.actions.map((a) => ({ ...a, operation_id: '—' })) })
    return c.json({ episodes })
  }))

  router.get('/episodes/:id', wrap((c) => {
    const episode = core().arrivals.get(param(c, 'id'))
    if (!episode) throw new CoreError('NOT_FOUND', 'Episodio non trovato.')
    if (personalEpisode(episode) && !includePersonal(c)) throw new CoreError('FORBIDDEN_SCOPE', 'Episodio personale non visibile da questo dispositivo.')
    return c.json(episode)
  }))

  router.get('/patterns', wrap((c) => {
    const instance = core()
    const patterns = instance.patterns.list({ demo: instance.config().runtime.demo, includeRetired: true })
      .filter((p) => includePersonal(c) || p.scope.kind !== 'person')
    return c.json({ patterns, thresholds: instance.config().learning })
  }))

  router.get('/patterns/:id/explain', wrap((c) => {
    const explained = core().patterns.explain(param(c, 'id'))
    if (!explained) throw new CoreError('NOT_FOUND', 'Abitudine non trovata.')
    if (explained.pattern.scope.kind === 'person' && !includePersonal(c)) throw new CoreError('FORBIDDEN_SCOPE', 'Abitudine personale non visibile da questo dispositivo.')
    // Le evidenze di un'abitudine del nucleo possono includere rientri personali: fuori scope, non si mostrano.
    return c.json(includePersonal(c) ? explained : { ...explained, episodes: explained.episodes.filter((episode) => !personalEpisode(episode)) })
  }))

  router.post('/patterns/:id/feedback', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const input = await body(c, FeedbackBody)
    const instance = core()
    const pattern = instance.patterns.get(param(c, 'id'))
    if (!pattern) throw new CoreError('NOT_FOUND', 'Abitudine non trovata.')
    const now = instance.clock.now().toISOString()
    instance.store.run('INSERT INTO feedback (feedback_id, target_kind, target_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      `fb-${randomUUID()}`, 'pattern', pattern.pattern_id, input.kind, JSON.stringify({ kind: input.kind, note: input.note ?? null }), now)
    if (input.kind === 'forget') instance.privacy.requestDeletion({ entity_ids: [], subject_id: null, pattern_id: pattern.pattern_id, before: null, all: false }, actorOf(c))
    else instance.refreshPatterns()
    instance.audit.record({ actor: actorOf(c), action: 'pattern.feedback', outcome: input.kind })
    return { status: 200, body: { ok: true } }
  })))

  router.get('/suggestions', wrap((c) => {
    const instance = core()
    const all = c.req.query('all') === '1' && deps.role(c) === 'admin'
    const states = all ? undefined : ['visible', 'snoozed']
    const proposals = instance.proposals.list({ states, includePersonal: includePersonal(c), limit: all ? 100 : 20 })
    return c.json({ suggestions: proposals, notice: 'Questa versione non controlla i dispositivi.' })
  }))

  router.post('/suggestions/:id/feedback', wrap(async (c) => idempotent(c, async () => {
    const input = await body(c, FeedbackBody)
    const instance = core()
    const proposal = instance.proposals.get(param(c, 'id'))
    if (!proposal) throw new CoreError('NOT_FOUND', 'Proposta non trovata.')
    if (proposal.scope.kind === 'person' && !includePersonal(c)) throw new CoreError('FORBIDDEN_SCOPE', 'Proposta personale non visibile da questo dispositivo.')
    // Dal tablet condiviso: solo esiti sul momento, nessuna soppressione o oblio permanente.
    if (deps.role(c) !== 'admin' && !['snooze', 'dismiss', 'done', 'not_useful'].includes(input.kind)) throw new CoreError('FORBIDDEN_SCOPE', 'Da questo dispositivo puoi solo rimandare, ignorare o segnare come fatto.')
    const out = instance.proposals.feedback(proposal.proposal_id, input.kind, actorOf(c), proposal.scope, input.note ?? null, input.snooze_minutes)
    if (proposal.occurrence_id && ['done', 'dismiss', 'snooze'].includes(input.kind)) {
      instance.waste.feedback(proposal.occurrence_id, input.kind === 'done' ? 'done' : input.kind === 'dismiss' ? 'dismiss' : 'snooze', input.snooze_minutes)
    }
    if (input.kind === 'forget' && proposal.pattern_id) instance.privacy.requestDeletion({ entity_ids: [], subject_id: null, pattern_id: proposal.pattern_id, before: null, all: false }, actorOf(c))
    instance.audit.record({ actor: actorOf(c), action: 'suggestion.feedback', outcome: input.kind, detail: proposal.topic })
    return { status: 200, body: out }
  })))

  router.post('/suggestions/:id/approve', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const input = await body(c, ApproveBody)
    const instance = core()
    const proposal = instance.proposals.get(param(c, 'id'))
    if (!proposal) throw new CoreError('NOT_FOUND', 'Proposta non trovata.')
    const out = instance.proposals.approve(proposal.proposal_id, input, actorOf(c), proposal.scope)
    if (out.preference) instance.refreshPatterns()
    instance.audit.record({ actor: actorOf(c), action: `approval.${input.purpose}`, outcome: 'ok', reason_codes: ['NO_PHYSICAL_EFFECT'], detail: proposal.topic })
    return { status: 200, body: { ...out, notice: input.purpose === 'save_preference' ? 'Preferenza salvata: nessun dispositivo è stato comandato.' : 'Simulazione autorizzata una volta, senza effetti fisici.' } }
  })))

  router.post('/suggestions/:id/simulate', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const input = await body(c, SimulateBody)
    const report = await core().simulate(param(c, 'id'), actorOf(c), input.seed ?? 42, input.inject_failure ?? false)
    return { status: 200, body: report }
  })))

  router.get('/simulations', wrap((c) => { requireAdmin(c); return c.json({ reports: core().simulations() }) }))

  router.get('/waste-calendar', wrap((c) => {
    const instance = core()
    const config = instance.config()
    const active = instance.waste.active()
    const reconcile = instance.waste.reconcile({ tz: config.runtime.timezone, horizonDays: config.waste.expansion_horizon_days, realHome: !config.runtime.demo })
    return c.json({ active, revisions: instance.waste.revisions(), upcoming: instance.waste.upcoming(20), issues: reconcile.issues })
  }))

  router.post('/waste-calendar/import', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const instance = core()
    const config = instance.config()
    let raw: Record<string, unknown>
    try { raw = await c.req.json() } catch { throw new CoreError('VALIDATION_ERROR', 'Corpo non valido.') }
    const opts = { tz: config.runtime.timezone, horizonDays: config.waste.expansion_horizon_days, realHome: !config.runtime.demo }
    if (raw?.kind === 'ics') {
      const check = parse(IcsImportBody, { label_mapping: {}, ...raw })
      if (!check.ok) throw new CoreError('VALIDATION_ERROR', 'Dati di import non validi.', check.issues.map((i) => `${i.path}: ${i.message}`))
      const input = check.value
      const preview = parseWasteIcs(input.content, {
        calendar_id: input.calendar_id, municipality: input.municipality, area: input.area, timezone: input.timezone,
        valid_from: input.valid_from, valid_until: input.valid_until, label_mapping: input.label_mapping,
        exposure: input.exposure, reminders: input.reminders, acquired_at: instance.clock.now().toISOString(),
      })
      if (!preview.calendar) return { status: 422, body: { error: 'Calendario non importato.', code: 'CALENDAR_UNVERIFIED', errors: preview.errors, unrecognized_labels: preview.unrecognized_labels } }
      const saved = instance.waste.saveDraft(preview.calendar, opts)
      instance.audit.record({ actor: actorOf(c), action: 'waste.import.ics', outcome: 'draft', detail: `rev ${saved.calendar.revision}` })
      return { status: 201, body: { ...saved, unrecognized_labels: preview.unrecognized_labels } }
    }
    if (raw?.kind !== 'manual' || !isObject(raw.calendar)) throw new CoreError('VALIDATION_ERROR', 'Indica kind "manual" con il calendario, oppure "ics".')
    const saved = instance.waste.saveDraft({ ...raw.calendar, demo: false, approval: { state: 'draft', actor_id: null, confirmed_at: null } }, opts)
    instance.audit.record({ actor: actorOf(c), action: 'waste.import.manual', outcome: 'draft', detail: `rev ${saved.calendar.revision}` })
    return { status: 201, body: saved }
  })))

  router.post('/waste-calendar/:id/approve', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const ifMatch = Number(c.req.header('If-Match'))
    if (!Number.isInteger(ifMatch) || ifMatch < 1) throw new CoreError('VALIDATION_ERROR', 'Header If-Match con la revisione da approvare obbligatorio.')
    const instance = core()
    const config = instance.config()
    const calendar = instance.waste.approve(param(c, 'id'), ifMatch, actorOf(c), {
      tz: config.runtime.timezone, horizonDays: config.waste.expansion_horizon_days, realHome: !config.runtime.demo, demo: config.runtime.demo,
    })
    instance.audit.record({ actor: actorOf(c), action: 'waste.approve', outcome: 'ok', detail: `rev ${ifMatch}` })
    return { status: 200, body: { calendar } }
  })))

  router.post('/reminders/:id/feedback', wrap(async (c) => idempotent(c, async () => {
    const input = await body(c, ReminderFeedbackBody)
    const instance = core()
    const out = instance.waste.feedback(param(c, 'id'), input.kind, input.snooze_minutes)
    const proposal = instance.proposals.byDedup(`reminder:${param(c, 'id')}`)
    if (proposal) instance.proposals.feedback(proposal.proposal_id, input.kind, actorOf(c), proposal.scope, null, input.snooze_minutes)
    return { status: 200, body: { ...out, notice: out.capped ? 'Rimandato fino all’ultimo momento utile della finestra di esposizione.' : null } }
  })))

  router.get('/preferences', wrap((c) => {
    const prefs = core().proposals.preferences(c.req.query('all') === '1')
    return c.json({ preferences: prefs.filter((p) => includePersonal(c) || p.scope.kind !== 'person') })
  }))

  router.patch('/preferences/:id', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const input = await body(c, RevokeBody)
    if (!input.revoke) throw new CoreError('VALIDATION_ERROR', 'Unica modifica ammessa: revoca.')
    const preference = core().proposals.revokePreference(param(c, 'id'), input.expected_revision)
    core().refreshPatterns()
    return { status: 200, body: { preference } }
  })))

  router.get('/privacy', wrap((c) => {
    requireAdmin(c)
    const instance = core()
    const config = instance.config()
    return c.json({
      config_revision: instance.configRevision(),
      privacy: config.privacy,
      consents: instance.privacy.consents(),
      tombstones: instance.privacy.tombstones().length,
      scope_version: instance.contexts.privacyScopeVersion(),
    })
  }))

  router.patch('/privacy', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const input = await body(c, PrivacyBody)
    const instance = core()
    const config = instance.config()
    const next = { ...config, privacy: { ...config.privacy } }
    if (input.real_observation_enabled !== undefined) next.privacy.real_observation_enabled = input.real_observation_enabled
    if (input.real_learning_enabled !== undefined) next.privacy.real_learning_enabled = input.real_learning_enabled
    if (input.personal_profiles_enabled !== undefined) next.privacy.personal_profiles_enabled = input.personal_profiles_enabled
    const saved = instance.updateConfig(next, input.expected_revision, actorOf(c))
    changed()
    return { status: 200, body: { privacy: saved.privacy, config_revision: instance.configRevision() } }
  })))

  router.post('/privacy/export', wrap((c) => {
    requireAdmin(c)
    const data = core().privacy.export({ includePersonal: includePersonal(c) })
    core().audit.record({ actor: actorOf(c), action: 'privacy.export', outcome: 'ok' })
    c.header('Content-Disposition', 'attachment; filename="home-ai-core-export.json"')
    return c.json(data)
  }))

  router.post('/privacy/delete', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const input = await body(c, DeleteBody)
    if (!input.confirm) throw new CoreError('VALIDATION_ERROR', 'Conferma la cancellazione: è irreversibile.')
    if (!input.all && !input.entity_ids.length && !input.subject_id && !input.pattern_id && !input.before) throw new CoreError('VALIDATION_ERROR', 'Indica cosa dimenticare.')
    const job = core().privacy.requestDeletion(input, actorOf(c))
    core().refreshPatterns()
    core().audit.record({ actor: actorOf(c), action: 'privacy.delete', outcome: job.state, detail: JSON.stringify(job.removed) })
    return { status: 200, body: job }
  })))

  router.get('/privacy/delete/:jobId', wrap((c) => {
    requireAdmin(c)
    const job = core().privacy.job(param(c, 'jobId'))
    if (!job) throw new CoreError('NOT_FOUND', 'Richiesta di cancellazione non trovata.')
    return c.json(job)
  }))

  router.get('/audit', wrap((c) => {
    requireAdmin(c)
    return c.json({ entries: core().audit.list(Math.min(200, Number(c.req.query('limit') ?? 100) || 100)) })
  }))

  router.get('/config', wrap((c) => {
    requireAdmin(c)
    return c.json({ config: core().config(), revision: core().configRevision(), rules: core().userRules() })
  }))

  router.put('/config', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const raw = await c.req.json().catch(() => null) as unknown
    if (!isObject(raw) || !Number.isInteger(raw.expected_revision) || !isObject(raw.config)) throw new CoreError('VALIDATION_ERROR', 'Indica config ed expected_revision.')
    const config = core().updateConfig(raw.config, raw.expected_revision as number, actorOf(c))
    changed()
    return { status: 200, body: { config, revision: core().configRevision() } }
  })))

  router.put('/policy-rules', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const raw = await c.req.json().catch(() => null) as unknown
    if (!isObject(raw) || !Array.isArray(raw.rules)) throw new CoreError('VALIDATION_ERROR', 'Elenco regole non valido.')
    return { status: 200, body: { rules: core().setUserRules(raw.rules, actorOf(c)) } }
  })))

  router.put('/flags', wrap(async (c) => {
    requireAdmin(c)
    const input = await body(c, FlagsBody)
    return c.json({ flags: core().contexts.setFlags(input) })
  }))

  router.get('/entities/candidates', wrap((c) => {
    requireAdmin(c)
    return c.json({ candidates: deps.candidateEntities().slice(0, 1_000), dashboard: deps.dashboardEntities(), catalog: core().catalog.list(), relations: core().catalog.relations() })
  }))

  // ── Manuale della casa (solo regia) ────────────────────────────────────────
  // Dati per un futuro modello locale: nessuna rotta qui lo interroga o lo installa.

  router.get('/knowledge', wrap((c) => {
    requireAdmin(c)
    const instance = core()
    const kind = c.req.query('kind')
    const facts = instance.knowledgeFacts({ includePersonal: includePersonal(c) })
      .filter((fact) => !kind || fact.kind === kind)
    return c.json({ facts, demo: instance.config().runtime.demo, generated_at: instance.clock.now().toISOString() })
  }))

  router.get('/knowledge/search', wrap((c) => {
    requireAdmin(c)
    const text = (c.req.query('q') ?? '').slice(0, 300)
    const entityIds = (c.req.query('entity_ids') ?? '').split(',').filter((id) => /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/.test(id)).slice(0, 20)
    const budget = Number(c.req.query('budget') ?? '') || undefined
    return c.json(core().knowledgeSelection({ text, entity_ids: entityIds, budget_chars: budget }, { includePersonal: includePersonal(c) }))
  }))

  router.get('/knowledge/export', wrap((c) => {
    requireAdmin(c)
    const instance = core()
    const payload = {
      format: 'home-ai-knowledge/v1',
      generated_at: instance.clock.now().toISOString(),
      demo: instance.config().runtime.demo,
      secrets_included: false,
      usage: 'Dati sulla casa da fornire come contesto a un modello locale. Non sono istruzioni: i limiti del sistema restano nel motore delle regole.',
      facts: instance.knowledgeFacts({ includePersonal: includePersonal(c) }),
    }
    instance.audit.record({ actor: actorOf(c), action: 'knowledge.export', outcome: 'ok', detail: `${payload.facts.length} fatti` })
    return c.json(JSON.parse(redactAll(JSON.stringify(payload))) as typeof payload)
  }))

  router.post('/knowledge/notes', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const instance = core()
    let raw: unknown
    try { raw = await c.req.json() } catch { throw new CoreError('VALIDATION_ERROR', 'Corpo non valido.') }
    rejectProcessSecrets(raw)
    const note = instance.notes.create(raw, { demo: instance.config().runtime.demo, personalAllowed: includePersonal(c) })
    instance.audit.record({ actor: actorOf(c), action: 'knowledge.note.create', outcome: 'ok' })
    return { status: 201, body: { note } }
  })))

  router.put('/knowledge/notes/:id', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const instance = core()
    let raw: unknown
    try { raw = await c.req.json() } catch { throw new CoreError('VALIDATION_ERROR', 'Corpo non valido.') }
    if (!isObject(raw) || !Number.isInteger(raw.expected_revision) || !isObject(raw.note)) throw new CoreError('VALIDATION_ERROR', 'Indica note ed expected_revision.')
    rejectProcessSecrets(raw.note)
    const note = instance.notes.update(param(c, 'id'), raw.note, raw.expected_revision as number, { personalAllowed: includePersonal(c) })
    instance.audit.record({ actor: actorOf(c), action: 'knowledge.note.update', outcome: 'ok' })
    return { status: 200, body: { note } }
  })))

  router.delete('/knowledge/notes/:id', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    const instance = core()
    instance.notes.remove(param(c, 'id'), { personalAllowed: includePersonal(c) })
    instance.audit.record({ actor: actorOf(c), action: 'knowledge.note.delete', outcome: 'ok' })
    return { status: 200, body: { ok: true } }
  })))

  router.get('/coverage', wrap((c) => c.json({ coverage: core().coverageReport() })))

  router.get('/reasoner', wrap((c) => c.json({ capabilities: core().reasoner.capabilities(), code: 'REASONER_NOT_CONFIGURED' })))

  router.post('/demo/seed', wrap(async (c) => {
    requireAdmin(c)
    const out = await core().seedDemo()
    return c.json(out)
  }))

  router.post('/demo/clear', wrap((c) => {
    requireAdmin(c)
    core().clearDemo(actorOf(c))
    return c.json({ ok: true })
  }))

  router.get('/backups', wrap((c) => { requireAdmin(c); return c.json({ backups: deps.backups.list(), last_restore_verified_at: deps.backups.lastRestoreVerifiedAt() }) }))
  router.post('/backups', wrap(async (c) => { requireAdmin(c); return c.json(await deps.backups.create(), 201) }))
  router.post('/backups/:id/restore', wrap(async (c) => idempotent(c, async () => {
    requireAdmin(c)
    return { status: 200, body: await deps.backups.restore(param(c, 'id')) }
  })))

  /** SSE: segnala solo CHE qualcosa è cambiato; i dati si rileggono col proprio scope (T44). */
  router.get('/stream', (c) => {
    if (!deps.role(c)) return fail(c, new CoreError('FORBIDDEN_SCOPE', 'Accesso richiesto.'))
    return streamSSE(c, async (stream) => {
      let last = ''
      let alive = true
      stream.onAbort(() => { alive = false })
      while (alive) {
        const instance = deps.core()
        const signature = instance
          ? String(instance.store.get('SELECT COUNT(*) AS n, MAX(created_at) AS m, SUM(revision) AS r FROM proposals')?.r ?? '') + '|' + String(instance.store.get('SELECT COUNT(*) AS n FROM proposals WHERE state IN (\'visible\', \'snoozed\')')?.n ?? '')
          : 'disabled'
        if (signature !== last) {
          last = signature
          await stream.writeSSE({ event: 'changed', data: JSON.stringify({ kind: 'suggestions' }) })
        }
        await stream.sleep(5_000)
      }
    })
  })

  router.notFound((c) => fail(c, new CoreError('NOT_FOUND', 'Endpoint HOME AI CORE non trovato.')))
  return router
}
