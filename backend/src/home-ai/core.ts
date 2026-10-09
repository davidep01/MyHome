import { ObservedEventSchema, type HealthStatus, type HomeContext, type KnowledgeFact, type ObservedEvent, type SimulationReport } from './domain/contracts.js'
import { CoreError } from './domain/errors.js'
import { parse } from './domain/schema.js'
import { localParts, systemClock, type Clock } from './domain/time.js'
import { defaultCoreConfig, validateCoreConfig, type CoreConfig } from './config.js'
import { CoreStore, StorageFailure, json } from './storage/db.js'
import { EventLog, type IngestResult } from './ingestion/event-log.js'
import { ManualTelemetry } from './ingestion/telemetry.js'
import { StateProjection } from './context/projection.js'
import { EntityCatalog, type CatalogEntry } from './context/catalog.js'
import { ContextBuilder } from './context/context.js'
import { ArrivalTracker } from './episodes/arrival.js'
import { PatternRepository } from './learning/patterns.js'
import { WasteService } from './waste/service.js'
import { calendarIssues } from './waste/calendar.js'
import { generateKnowledge } from './knowledge/generate.js'
import { KnowledgeNotes, noteToFact } from './knowledge/notes.js'
import { selectKnowledge, type KnowledgeQuery, type KnowledgeSelection } from './knowledge/retrieve.js'
import { ProposalService } from './suggestions/service.js'
import { PrivacyService } from './privacy/service.js'
import { AuditLog } from './observability/audit.js'
import { DryRunExecutor } from './simulation/dry-run.js'
import { DisabledReasoner } from './reasoner/disabled.js'
import { AGENTS, type AgentDeps } from './agents/agents.js'
import type { AgentTrigger, Candidate } from './agents/types.js'
import { arbitrate } from './policy/arbiter.js'
import { BUILTIN_POLICY_VERSION, decide, validateRules, type UserPolicyRule } from './policy/engine.js'
import { forecastValidity, noForecast, type ForecastReadPort } from './weather/forecast.js'
import { makeEvent, quality } from './ingestion/normalize.js'
import { buildDemoDataset, DEMO_ENTITIES } from './fixtures/demo-home.js'
import { addDays } from './domain/time.js'

/**
 * HOME AI CORE — monolite modulare locale (specifica §4, §15).
 *
 * Ciclo: osservare → normalizzare → conservare → aggiornare il contesto →
 * riconoscere episodi → cercare pattern → valutare utilità e policy →
 * proporre → raccogliere feedback → simulare → aggiornare la memoria.
 *
 * Elaborazione guidata da eventi e job limitati: nessun ciclo che "ragiona"
 * continuamente su tutta la casa, nessun polling indiscriminato. Non esiste
 * alcuna porta verso comandi fisici: l'unica `ExecutionPort` è il simulatore.
 */

/** Orologio commutabile: reale in esercizio, controllato durante il replay della demo. */
export class CoreClock implements Clock {
  override: Date | null = null
  constructor(private readonly base: Clock = systemClock) {}
  now(): Date { return this.override ? new Date(this.override) : this.base.now() }
}

const CONSUMERS = ['projection', 'episodes'] as const
const MINING_INTERVAL_MS = 6 * 3_600_000
const FORECAST_INTERVAL_MS = 30 * 60_000
const REVIEW_INTERVAL_MS = 15 * 60_000

export interface CoreDeps {
  store: CoreStore
  clock?: Clock
  forecast?: ForecastReadPort
  /** Etichette/aree delle entità reali selezionate (dal registry HA della dashboard). */
  entityInfo?: (entityId: string) => { label: string; area_id: string | null }
}

export class HomeAiCore {
  readonly store: CoreStore
  readonly clock: CoreClock
  readonly events: EventLog
  readonly projection: StateProjection
  readonly catalog: EntityCatalog
  readonly contexts: ContextBuilder
  readonly arrivals: ArrivalTracker
  readonly patterns: PatternRepository
  readonly waste: WasteService
  readonly proposals: ProposalService
  readonly privacy: PrivacyService
  readonly audit: AuditLog
  readonly telemetry: ManualTelemetry
  readonly simulator: DryRunExecutor
  readonly reasoner = new DisabledReasoner()
  readonly notes: KnowledgeNotes
  private forecastPort: ForecastReadPort
  private readonly entityInfo: CoreDeps['entityInfo']
  private processing = false
  private lastForecastAt = 0
  private lastReviewAt = 0
  readonly metrics = { ingested: 0, duplicates: 0, quarantined: 0, tombstoned: 0, degraded: 0, ticks: 0, lastTickMs: 0, decisions: {} as Record<string, number> }

  constructor(deps: CoreDeps) {
    this.store = deps.store
    this.clock = deps.clock instanceof CoreClock ? deps.clock : new CoreClock(deps.clock ?? systemClock)
    this.events = new EventLog(this.store, this.clock)
    this.projection = new StateProjection(this.store)
    this.catalog = new EntityCatalog(this.store)
    this.contexts = new ContextBuilder(this.store, this.projection, this.catalog, this.clock)
    this.arrivals = new ArrivalTracker(this.store, this.projection, this.clock)
    this.patterns = new PatternRepository(this.store, this.arrivals, this.clock)
    this.waste = new WasteService(this.store, this.clock)
    this.proposals = new ProposalService(this.store, this.clock)
    this.privacy = new PrivacyService(this.store, this.clock)
    this.audit = new AuditLog(this.store, this.clock)
    this.notes = new KnowledgeNotes(this.store, this.clock)
    this.forecastPort = deps.forecast ?? noForecast
    this.entityInfo = deps.entityInfo
    this.telemetry = new ManualTelemetry({
      clock: this.clock,
      ingest: (event) => this.ingest(event, { demo: false }),
      selected: () => this.catalog.selectedIds(),
      enabled: () => {
        const config = this.config()
        return !config.runtime.demo && config.sources.home_assistant.enabled && config.privacy.real_observation_enabled
      },
    })
    this.simulator = new DryRunExecutor({
      clock: this.clock,
      proposal: (id) => this.proposals.get(id),
      snapshot: (id) => this.contexts.snapshot(id),
      automationTargets: () => new Set(this.arrivals.list({ limit: 20, finalizedOnly: true }).flatMap((e) => e.automation_effects)),
      save: (report) => this.store.run('INSERT INTO simulation_reports (report_id, proposal_id, created_at, body) VALUES (?, ?, ?, ?)',
        report.report_id, report.proposal_id, report.created_at, JSON.stringify(report)),
    })
    if (!this.store.get("SELECT key FROM settings WHERE key = 'config'")) this.writeConfig(defaultCoreConfig(), 'bootstrap')
  }

  // ── Configurazione ─────────────────────────────────────────────────────────

  config(): CoreConfig {
    const row = this.store.get("SELECT body FROM settings WHERE key = 'config'")
    return row ? validateCoreConfig(json(row.body)) : defaultCoreConfig()
  }

  configRevision(): number {
    return Number(this.store.get("SELECT revision FROM settings WHERE key = 'config'")?.revision ?? 0)
  }

  private writeConfig(config: CoreConfig, actor: string): void {
    const revision = this.configRevision() + 1
    this.store.run(
      `INSERT INTO settings (key, revision, body, updated_at) VALUES ('config', ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET revision = excluded.revision, body = excluded.body, updated_at = excluded.updated_at`,
      revision, JSON.stringify(config), this.clock.now().toISOString(),
    )
    this.audit.record({ actor, action: 'config.update', outcome: 'ok', detail: `revisione ${revision}` })
  }

  /** Aggiorna la configurazione: valida, rifiuta invece di correggere, revisione attesa. */
  updateConfig(input: unknown, expectedRevision: number, actor: string): CoreConfig {
    if (expectedRevision !== this.configRevision()) throw new CoreError('REVISION_CONFLICT', 'Configurazione modificata nel frattempo: ricarica.')
    let next: CoreConfig
    try { next = validateCoreConfig(input) } catch (error) {
      throw new CoreError('VALIDATION_ERROR', 'Configurazione non valida.', error instanceof Error && 'issues' in error ? (error as { issues: string[] }).issues : [])
    }
    const previous = this.config()
    this.writeConfig(next, actor)
    // Consensi: ogni cambio è registrato con una nuova versione dello scope privacy.
    const consentChanges: [keyof CoreConfig['privacy'], 'observation' | 'learning' | 'personalization'][] = [
      ['real_observation_enabled', 'observation'], ['real_learning_enabled', 'learning'], ['personal_profiles_enabled', 'personalization'],
    ]
    for (const [key, purpose] of consentChanges) {
      if (previous.privacy[key] !== next.privacy[key]) {
        this.privacy.recordConsent(purpose, Boolean(next.privacy[key]), actor)
        // Revoca dell'apprendimento: stop inferenze e rimozione dei derivati reali (T43).
        if (purpose === 'learning' && !next.privacy[key]) this.forgetLearnedReal()
      }
    }
    if (previous.sources.home_assistant.selected_entities.join() !== next.sources.home_assistant.selected_entities.join()
      || previous.sources.home_assistant.presence_entities.join() !== next.sources.home_assistant.presence_entities.join()
      || previous.sources.home_assistant.window_entities.join() !== next.sources.home_assistant.window_entities.join()
      || previous.sources.home_assistant.door_entities.join() !== next.sources.home_assistant.door_entities.join()
      || previous.runtime.demo !== next.runtime.demo) {
      this.rebuildCatalog(next)
    }
    return next
  }

  private forgetLearnedReal(): void {
    this.store.tx(() => {
      for (const row of this.store.all('SELECT pattern_id FROM patterns WHERE demo = 0')) {
        this.store.run('DELETE FROM patterns WHERE pattern_id = ?', String(row.pattern_id))
      }
      for (const row of this.store.all("SELECT proposal_id FROM proposals WHERE demo = 0 AND agent_key = 'arrival'")) {
        this.store.run('DELETE FROM proposals WHERE proposal_id = ?', String(row.proposal_id))
      }
    })
    this.audit.record({ actor: 'system', action: 'privacy.learning_revoked', outcome: 'ok', reason_codes: ['DERIVED_PATTERNS_REMOVED'] })
  }

  userRules(): UserPolicyRule[] {
    const row = this.store.get("SELECT body FROM settings WHERE key = 'policy_rules'")
    return row ? validateRules(json(row.body)) : []
  }

  setUserRules(input: unknown, actor: string): UserPolicyRule[] {
    let rules: UserPolicyRule[]
    try { rules = validateRules(input) } catch (error) { throw new CoreError('VALIDATION_ERROR', error instanceof Error ? error.message : 'regole non valide') }
    const revision = Number(this.store.get("SELECT revision FROM settings WHERE key = 'policy_rules'")?.revision ?? 0) + 1
    this.store.run(`INSERT INTO settings (key, revision, body, updated_at) VALUES ('policy_rules', ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET revision = excluded.revision, body = excluded.body, updated_at = excluded.updated_at`,
      revision, JSON.stringify(rules), this.clock.now().toISOString())
    this.store.setMeta('policy_version', String(BUILTIN_POLICY_VERSION * 1_000 + revision))
    this.audit.record({ actor, action: 'policy.rules.update', outcome: 'ok', detail: `${rules.length} regole` })
    return rules
  }

  /** Catalogo = solo entità selezionate (o le entità della demo). */
  rebuildCatalog(config = this.config()): void {
    const now = this.clock.now().toISOString()
    if (config.runtime.demo) {
      this.catalog.replace(DEMO_ENTITIES, now)
      return
    }
    const ha = config.sources.home_assistant
    const roles = { presence: ha.presence_entities, door: ha.door_entities, window: ha.window_entities }
    const ids = [...new Set([...ha.selected_entities, ...ha.presence_entities, ...ha.door_entities, ...ha.window_entities])]
    const entries: CatalogEntry[] = ids.map((id) => {
      const info = this.entityInfo?.(id) ?? { label: id, area_id: null }
      const domain = id.split('.')[0]
      const role = roles.presence.includes(id) ? 'presence' : roles.door.includes(id) ? 'door' : roles.window.includes(id) ? 'window'
        : domain === 'light' ? 'light' : domain === 'climate' ? 'climate' : domain === 'switch' || domain === 'input_boolean' ? 'switch'
          : domain === 'cover' ? 'cover' : domain === 'media_player' ? 'media' : domain === 'sensor' || domain === 'binary_sensor' ? 'sensor' : 'other'
      const caps: Record<string, string[]> = { light: ['lighting.set'], switch: ['switch.set'], input_boolean: ['switch.set'], climate: ['climate.set_mode', 'climate.set_temperature'], cover: ['cover.set'], media_player: ['media.set'], fan: ['fan.set'] }
      return { entity_id: id, domain, label: info.label, area_id: info.area_id, role, capabilities: caps[domain] ?? [] }
    })
    this.catalog.replace(entries, now)
  }

  setForecastPort(port: ForecastReadPort): void { this.forecastPort = port; this.lastForecastAt = 0 }

  // ── Ingestione ─────────────────────────────────────────────────────────────

  ingest(raw: unknown, opts: { demo: boolean }): IngestResult {
    const parsed = parse(ObservedEventSchema, raw)
    if (parsed.ok && this.privacy.isTombstoned(parsed.value)) {
      this.metrics.tombstoned += 1
      return { status: 'tombstoned' }
    }
    const result = this.events.ingest(raw, opts)
    if (result.status === 'stored') this.metrics.ingested += 1
    else if (result.status === 'duplicate') this.metrics.duplicates += 1
    else if (result.status === 'quarantined') this.metrics.quarantined += 1
    else if (result.status === 'degraded') this.metrics.degraded += 1
    return result
  }

  /** Consumer idempotenti con checkpoint persistenti; budget limitato per chiamata. */
  process(maxBatches = 20): void {
    if (this.processing) return
    this.processing = true
    try {
      const config = this.config()
      for (let i = 0; i < maxBatches; i += 1) {
        const a = this.events.consume('projection', (event, demo) => this.projection.apply(event, demo))
        const b = this.events.consume('episodes', (event, demo) => this.onEpisodeEvent(event, demo, config))
        if (a === 0 && b === 0) break
      }
      this.events.compactOutbox([...CONSUMERS])
    } finally {
      this.processing = false
    }
  }

  private onEpisodeEvent(event: ObservedEvent, demo: boolean, config: CoreConfig): void {
    if (event.kind === 'presence.signal') {
      this.arrivals.onPresence(event, demo, config)
      return
    }
    if (event.kind === 'manual.intent' && event.quality.reason_codes.includes('LATE_EVENT')) {
      const corrected = this.arrivals.correctLate(event)
      if (corrected) this.audit.record({ actor: 'system', action: 'episode.late_correction', outcome: 'ok', reason_codes: ['LATE_EVENT'] })
    }
  }

  // ── Job a tempo ────────────────────────────────────────────────────────────

  async tick(opts: { allowMining?: boolean; agents?: boolean; light?: boolean } = {}): Promise<void> {
    const started = Date.now()
    const config = this.config()
    const now = this.clock.now()
    this.process()
    const flags = this.contexts.flags()
    const finalized = this.arrivals.advance(config, flags.guests)
    // Replay: solo transizioni a tempo degli episodi, il resto alla fine.
    if (opts.light) return
    if (finalized.length && opts.allowMining !== false) this.refreshPatterns(config)
    else if (opts.allowMining !== false && now.getTime() - Number(this.store.getMeta('last_mined_at') ?? 0) > MINING_INTERVAL_MS) this.refreshPatterns(config)

    if (opts.agents !== false) {
      // Solo gli episodi chiusi "in tempo" possono generare suggerimenti live (T11).
      for (const episode of finalized) {
        if (!episode.late_corrected && now.getTime() - Date.parse(episode.window_until) < 10 * 60_000) {
          this.evaluate({ kind: 'episode_finalized', episode_id: episode.episode_id }, config)
        }
      }
    }

    // Promemoria: riconciliazione e maturazione, una volta per occorrenza.
    const realHome = !config.runtime.demo
    this.waste.reconcile({ tz: config.runtime.timezone, horizonDays: config.waste.expansion_horizon_days, realHome })
    this.withdrawSupersededReminders()
    const matured = this.waste.tick()
    if (matured.length && opts.agents !== false) {
      this.evaluate({ kind: 'reminders_due', occurrence_ids: matured.map((o) => o.occurrence_id) }, config)
    }

    if (now.getTime() - this.lastForecastAt > FORECAST_INTERVAL_MS) {
      this.lastForecastAt = now.getTime()
      await this.refreshForecast(config)
    }
    if (opts.agents !== false && now.getTime() - this.lastReviewAt > REVIEW_INTERVAL_MS) {
      this.lastReviewAt = now.getTime()
      this.evaluate({ kind: 'review' }, config)
    }
    this.proposals.housekeeping()
    this.withdrawResolvedWeather(config)

    const day = localParts(now, config.runtime.timezone).date
    if (this.store.getMeta('last_retention_day') !== day) {
      this.store.setMeta('last_retention_day', day)
      this.privacy.applyRetention(config.privacy.retention_days)
    }
    this.metrics.ticks += 1
    this.metrics.lastTickMs = Date.now() - started
  }

  refreshPatterns(config = this.config()): void {
    const demo = config.runtime.demo
    // Senza consenso all'apprendimento i dati reali non producono ipotesi.
    if (!demo && !config.privacy.real_learning_enabled) return
    this.patterns.refresh(config, demo)
    this.store.setMeta('last_mined_at', String(this.clock.now().getTime()))
    // Un'abitudine non più supportata (ritirata, soppressa, già accettata) non resta suggerita (§11, T20/T21).
    const reasons: Record<string, string> = { suppressed: 'PATTERN_SUPPRESSED', accepted: 'PATTERN_ACCEPTED', retired: 'PATTERN_RETIRED' }
    for (const proposal of this.proposals.list({ states: ['candidate', 'policy_checked', 'visible', 'snoozed'], includePersonal: true, demo, limit: 200 })) {
      if (!proposal.pattern_id) continue
      const state = this.patterns.get(proposal.pattern_id)?.state
      if (state !== 'supported') this.proposals.withdraw(proposal.proposal_id, (state && reasons[state]) ?? 'PATTERN_NOT_SUPPORTED')
    }
  }

  private async refreshForecast(config: CoreConfig): Promise<void> {
    try {
      const snapshot = await this.forecastPort.read(this.clock.now())
      if (!snapshot) return
      const now = this.clock.now().toISOString()
      this.ingest(makeEvent({
        kind: 'forecast.updated',
        source: { id: `weather-${this.forecastPort.id}`, kind: 'weather', native_id: `${this.forecastPort.id}:${snapshot.fetched_at}` },
        occurred_at: snapshot.fetched_at,
        received_at: now,
        delivery: 'live',
        quality: quality('system', 1, ['FORECAST_SOURCE']),
        payload: {
          forecast_source_id: snapshot.source_id,
          issued_at: snapshot.issued_at,
          fetched_at: snapshot.fetched_at,
          expires_at: snapshot.expires_at,
          points: snapshot.points.slice(0, 240),
        },
      }), { demo: config.runtime.demo })
      this.process()
      this.evaluate({ kind: 'forecast_updated' }, config)
    } catch {
      this.audit.record({ actor: 'system', action: 'forecast.read', outcome: 'failed', reason_codes: ['SOURCE_UNAVAILABLE'] })
    }
  }

  /** Dopo una revisione approvata il promemoria di un'occorrenza annullata o spostata lascia l'inbox (§13, T24). */
  private withdrawSupersededReminders(): void {
    for (const proposal of this.proposals.list({ states: ['candidate', 'policy_checked', 'visible', 'snoozed'], includePersonal: true, limit: 200 })) {
      if (proposal.agent_key !== 'waste' || !proposal.occurrence_id) continue
      if (this.waste.get(proposal.occurrence_id)?.state === 'superseded') this.proposals.withdraw(proposal.proposal_id, 'OCCURRENCE_SUPERSEDED')
    }
  }

  /** Isteresi meteo: si ritira solo quando la condizione è chiaramente finita. */
  private withdrawResolvedWeather(config: CoreConfig): void {
    const open = this.proposals.list({ states: ['visible', 'snoozed', 'policy_checked'], includePersonal: true, limit: 50 }).filter((p) => p.agent_key === 'weather')
    if (!open.length) return
    const context = this.contexts.build(config)
    for (const proposal of open) {
      const entityId = proposal.resources[0]
      const state = context.states.find((s) => s.entity_id === entityId)
      const closed = state && !state.stale && state.value.availability === 'available' && state.value.state !== 'on' && state.value.state !== 'open'
      const forecastGone = !context.forecast?.valid || !context.forecast.points.some((p) => (p.rain_probability ?? 0) >= 0.35 && Date.parse(p.until) > this.clock.now().getTime())
      if (closed) this.proposals.withdraw(proposal.proposal_id, 'CONDITION_RESOLVED')
      else if (forecastGone) this.proposals.withdraw(proposal.proposal_id, 'FORECAST_NO_LONGER_VALID')
    }
  }

  // ── Agenti → arbitraggio → policy → proposte ───────────────────────────────

  agentDeps(config: CoreConfig): AgentDeps {
    const labels = new Map(this.catalog.list().map((entry) => [entry.entity_id, entry.label]))
    return {
      config,
      now: this.clock.now(),
      demo: config.runtime.demo,
      label: (id) => labels.get(id) ?? id,
      patterns: () => this.patterns.list({ demo: config.runtime.demo }),
      episode: (id) => this.arrivals.get(id),
      occurrence: (id) => this.waste.get(id),
      windowEntities: () => this.catalog.byRole('window').map((entry) => entry.entity_id),
    }
  }

  evaluate(trigger: AgentTrigger, config = this.config()): { context: HomeContext; candidates: Candidate[] } {
    const context = this.contexts.build(config)
    const deps = this.agentDeps(config)
    const candidates: Candidate[] = []
    for (const agent of AGENTS) {
      try { candidates.push(...agent(context, trigger, deps)) } catch {
        this.audit.record({ actor: 'system', action: 'agent.error', outcome: 'failed', reason_codes: ['AGENT_QUARANTINED'] })
      }
    }
    // Preferenza esplicita > abitudine inferita (T35): le routine salvate dichiarano
    // l'azione voluta su ciascuna risorsa; l'arbitro scarta i candidati appresi opposti.
    const preferences = this.proposals.preferences()
    const preferredTargets = new Map<string, string>()
    for (const preference of preferences) {
      if (preference.kind !== 'routine' || !preference.pattern_id) continue
      for (const step of this.patterns.get(preference.pattern_id)?.steps ?? []) {
        const action = String(step.desired.action ?? step.desired.state ?? '')
        if (action) for (const target of step.target_entity_ids) preferredTargets.set(target, action)
      }
    }
    const { kept, dropped } = arbitrate(candidates, preferredTargets)
    for (const entry of dropped) this.audit.record({ actor: 'policy', action: 'arbiter.drop', outcome: entry.reason, detail: entry.candidate.topic })
    const now = this.clock.now()
    for (const candidate of kept) {
      const decision = decide(candidate, context, {
        config,
        now,
        learningConsent: config.privacy.real_learning_enabled,
        personalConsent: config.privacy.personal_profiles_enabled,
        preferences,
        proactiveToday: this.proposals.proactiveVisibleToday(config.runtime.timezone, candidate.dedup_key),
        lastShownForTopic: (topic) => this.proposals.lastShownForTopic(topic, candidate.dedup_key),
        factIsValid: (fact) => this.factIsValid(fact, context),
        userRules: this.userRules(),
        policyVersion: this.contexts.policyVersion(),
      })
      this.metrics.decisions[decision.outcome] = (this.metrics.decisions[decision.outcome] ?? 0) + 1
      const proposal = this.proposals.upsert(candidate, decision)
      if (proposal?.occurrence_id && decision.outcome === 'allow_local') this.waste.markVisible(proposal.occurrence_id)
      this.audit.record({ actor: 'policy', action: `decision.${candidate.agent_key}`, outcome: decision.outcome, reason_codes: decision.reason_codes, detail: candidate.topic })
    }
    return { context, candidates: kept }
  }

  private factIsValid(fact: string, context: HomeContext): boolean {
    if (fact === 'forecast.valid') return Boolean(context.forecast?.valid)
    if (fact === 'calendar.approved') return this.waste.active() !== null
    if (fact.startsWith('entity:')) {
      const state = context.states.find((s) => s.entity_id === fact.slice(7))
      return Boolean(state && !state.stale && state.value.availability === 'available')
    }
    return false
  }

  // ── Manuale della casa ─────────────────────────────────────────────────────

  /**
   * Fatti del manuale: generati dallo stato corrente + note dell'utente.
   * Sono dati per un futuro modello locale, mai istruzioni (§25).
   */
  knowledgeFacts(opts: { includePersonal: boolean }): KnowledgeFact[] {
    const config = this.config()
    const demo = config.runtime.demo
    const now = this.clock.now()
    const calendar = this.waste.active()
    const today = localParts(now, config.runtime.timezone).date
    const generated = generateKnowledge({
      now,
      config,
      demo,
      catalog: this.catalog.list(),
      patterns: this.patterns.list({ demo }),
      preferences: this.proposals.preferences(),
      calendar,
      calendarIssues: calendar ? calendarIssues(calendar, today, !demo) : [],
      upcoming: calendar ? this.waste.upcoming(40) : [],
      userRules: this.userRules(),
      coverage: this.coverageReport(),
      guests: this.contexts.flags().guests,
      includePersonal: opts.includePersonal,
    })
    const notes = this.notes.list({ demo, includePersonal: opts.includePersonal }).map(noteToFact)
    return [...generated, ...notes]
  }

  knowledgeSelection(query: Omit<KnowledgeQuery, 'now'>, opts: { includePersonal: boolean }): KnowledgeSelection {
    return selectKnowledge(this.knowledgeFacts(opts), { ...query, now: this.clock.now() })
  }

  // ── Simulazione ────────────────────────────────────────────────────────────

  async simulate(proposalId: string, actor: string, seed: number, injectFailure: boolean): Promise<SimulationReport> {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) throw new CoreError('NOT_FOUND', 'Proposta non trovata.')
    const approval = this.proposals.validSimulationApproval(proposal)
    if (!approval) throw new CoreError('REVISION_CONFLICT', 'Serve un’approvazione di simulazione valida per questa revisione del piano.')
    const report = this.simulator.run({
      proposal_id: proposal.proposal_id,
      proposal_revision: proposal.revision,
      context_snapshot_id: proposal.context_snapshot_id,
      plan_hash: proposal.plan_hash,
      seed,
      inject_failure: injectFailure,
    })
    this.store.run('INSERT INTO simulation_reports (report_id, proposal_id, created_at, body) VALUES (?, ?, ?, ?)',
      report.report_id, report.proposal_id, report.created_at, JSON.stringify(report))
    this.proposals.consumeSimulationApproval(approval.approval_id)
    this.proposals.markSimulated(proposal.proposal_id, report.status === 'simulated')
    this.audit.record({ actor, action: 'simulation.run', outcome: report.status, reason_codes: report.reason_codes, detail: 'physical_effects=false' })
    return report
  }

  simulations(limit = 50): SimulationReport[] {
    return this.store.all('SELECT body FROM simulation_reports ORDER BY created_at DESC LIMIT ?', limit).map((row) => json<SimulationReport>(row.body))
  }

  // ── Demo ───────────────────────────────────────────────────────────────────

  /**
   * Replay deterministico della demo (fixture) con orologio controllato. Non
   * tocca Home Assistant; i dati restano marcati demo e separati dai reali.
   */
  async seedDemo(opts: { endDate?: string; until?: Date } = {}): Promise<{ events: number; stored: number }> {
    const config = this.config()
    if (!config.runtime.demo || !config.sources.fixtures.enabled) throw new CoreError('VALIDATION_ERROR', 'La demo non è attiva nella configurazione.')
    const realNow = this.clock.now()
    const until = opts.until ?? realNow
    const endDate = opts.endDate ?? localParts(until, config.runtime.timezone).date
    const dataset = buildDemoDataset(endDate, until)
    this.catalog.replace(dataset.entities, realNow.toISOString())
    let stored = 0
    const previousOverride = this.clock.override
    try {
      for (const event of dataset.events) {
        this.clock.override = new Date(event.received_at)
        await this.tick({ allowMining: false, agents: false, light: true })
        const result = this.ingest(event, { demo: true })
        if (result.status === 'stored') stored += 1
        this.process()
      }
      this.clock.override = new Date(until)
      await this.tick({ allowMining: false, agents: false })
      const draft = this.waste.latestRevision(dataset.calendar.calendar_id)
      if (!draft) {
        const { calendar } = this.waste.saveDraft(dataset.calendar, { tz: config.runtime.timezone, horizonDays: config.waste.expansion_horizon_days, realHome: false })
        this.waste.approve(calendar.calendar_id, calendar.revision, 'demo-admin', { tz: config.runtime.timezone, horizonDays: config.waste.expansion_horizon_days, realHome: false, demo: true })
      }
      this.refreshPatterns(config)
      this.lastForecastAt = Date.now()
      this.lastReviewAt = 0
      await this.tick()
    } finally {
      this.clock.override = previousOverride
    }
    this.store.setMeta('demo_seeded_until', until.toISOString())
    this.audit.record({ actor: 'system', action: 'demo.seed', outcome: 'ok', detail: `${stored} eventi sintetici` })
    return { events: dataset.events.length, stored }
  }

  clearDemo(actor: string): void {
    this.privacy.purge({ entity_ids: [], subject_id: null, pattern_id: null, before: null, all: true, demo_only: true })
    this.store.run("DELETE FROM waste_occurrences WHERE json_extract(body, '$.demo') = 1")
    this.store.run("DELETE FROM waste_calendars WHERE calendar_id = 'demo-waste'")
    this.store.run('DELETE FROM meta WHERE key IN (?, ?)', 'arrival_state', 'demo_seeded_until')
    this.store.run('DELETE FROM consumer_checkpoints')
    this.audit.record({ actor, action: 'demo.clear', outcome: 'ok' })
  }

  // ── Stato ──────────────────────────────────────────────────────────────────

  health(extra: { haReachable: boolean | null; lastBackupAt: string | null; lastRestoreVerifiedAt: string | null }): HealthStatus {
    const config = this.config()
    const issues: HealthStatus['issues'] = []
    const storage: HealthStatus['storage'] = this.store.degraded ? 'read_only' : 'ok'
    if (this.store.degraded) issues.push({ code: 'STORAGE_DEGRADED', message: 'Archivio del core non scrivibile: la dashboard continua a funzionare, il core non registra nuovi dati.' })
    const ha = config.sources.home_assistant
    const haSource: HealthStatus['ha_source'] = config.runtime.demo || !ha.enabled ? (config.runtime.demo ? 'disabled' : 'not_configured')
      : extra.haReachable === null ? 'not_configured' : extra.haReachable ? 'reachable' : 'unreachable'
    if (haSource === 'unreachable') issues.push({ code: 'HA_UNREACHABLE', message: 'Home Assistant non raggiungibile: nuove inferenze rinviate.' })
    const gaps = this.projection.openGaps()
    const coverage: HealthStatus['coverage'] = config.runtime.demo ? 'complete' : !ha.enabled ? 'unknown' : gaps.length ? 'partial' : 'complete'
    const learner: HealthStatus['learner'] = config.runtime.demo ? 'demo_only' : config.privacy.real_learning_enabled ? 'active' : 'stopped_no_consent'
    if (learner === 'stopped_no_consent' && ha.enabled) issues.push({ code: 'LEARNING_CONSENT_OFF', message: 'Apprendimento fermo: il consenso non è stato dato.' })
    const active = this.waste.active()
    const latestDraft = this.store.get("SELECT state FROM waste_calendars ORDER BY created_at DESC LIMIT 1")
    const today = localParts(this.clock.now(), config.runtime.timezone).date
    // Confermato non vuol dire valido: zona o comune mancanti sospendono i promemoria certi (§13, §28, T25).
    const verification = active && active.valid_until >= today ? calendarIssues(active, today, !config.runtime.demo) : []
    const waste: HealthStatus['waste_calendar'] = active ? (active.valid_until < today ? 'expired' : verification.length ? 'conflict' : 'approved') : latestDraft ? 'draft' : 'not_configured'
    if (waste === 'expired') issues.push({ code: 'CALENDAR_EXPIRED', message: 'Calendario della raccolta scaduto: niente promemoria certi.' })
    for (const issue of verification) issues.push({ code: issue.code, message: issue.message.slice(0, 280) })
    const forecast = this.contexts.latestForecast()
    const validity = forecastValidity(forecast, this.clock.now(), config.sources.weather.forecast_ttl_minutes)
    // "Solo meteo corrente": un'entità weather.* osservata e disponibile, ma nessuna previsione valida (§28).
    const currentWeather = this.catalog.list().some((entry) => entry.domain === 'weather' && this.projection.get(entry.entity_id)?.value.availability === 'available')
    const forecastState: HealthStatus['forecast'] = validity === 'valid' ? 'available' : currentWeather ? 'current_only' : 'unavailable'
    const queue = CONSUMERS.reduce((sum, consumer) => sum + this.events.pending(consumer), 0)
    if (!extra.lastBackupAt) issues.push({ code: 'NO_BACKUP', message: 'Nessun backup del core ancora creato.' })
    return {
      service: this.store.degraded ? 'degraded' : 'running',
      mode: config.runtime.mode,
      demo: config.runtime.demo,
      storage,
      ha_source: haSource,
      coverage,
      learner,
      waste_calendar: waste,
      forecast: forecastState,
      reasoner: 'not_configured',
      physical_execution: 'disabled',
      last_backup_at: extra.lastBackupAt,
      last_restore_verified_at: extra.lastRestoreVerifiedAt,
      queue_depth: queue,
      issues: issues.slice(0, 30),
    }
  }

  /** Riepilogo della copertura dichiarata (la verità sulla copertura è un requisito). */
  coverageReport(): { channel: string; status: string }[] {
    const config = this.config()
    const t = this.telemetry.stats()
    const ha = config.sources.home_assistant
    return [
      { channel: 'Click della dashboard S.I.M.I.', status: config.runtime.demo ? 'demo: dati sintetici' : ha.enabled && config.privacy.real_observation_enabled ? `coperti (intenzioni ${t.intents}, fuori scope ${t.outOfScope})` : 'non osservati: osservazione reale spenta' },
      { channel: 'Altre app e interfacce di Home Assistant', status: 'attribuzione parziale: solo indizi (user_id/contesto), mai azione manuale certa' },
      { channel: 'Pulsanti fisici e app dei produttori', status: 'non attribuibili: registrati come origine incerta' },
      { channel: 'Azioni senza cambio di stato da altri client', status: 'non osservabili' },
      { channel: 'Automazioni esistenti', status: 'riconosciute solo se HA riporta il contesto padre' },
    ]
  }

  /** Scadenza di un dataset di prova: utilità per i test del tempo. */
  static addDays = addDays
}

export { StorageFailure }
