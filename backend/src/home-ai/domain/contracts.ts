import {
  anyOf, arr, bool, enm, exportJsonSchema, lit, nul, nullable, num, obj, record, refine, str, tagged,
  type Infer, type JsonSchema, type Schema,
} from './schema.js'

/**
 * Contratti di dominio di HOME AI CORE (specifica §19), versione 1.
 *
 * Ogni contratto è una definizione runtime: lo stesso oggetto valida l'input
 * delle API, i record persistiti, le fixture e i test, ed esporta il JSON
 * Schema in `schemas/`. Una modifica incompatibile incrementa la versione;
 * un input di versione futura non viene mai reinterpretato come v1.
 */

export const SCHEMA_VERSION = 1 as const

// ── Mattoni ──────────────────────────────────────────────────────────────────

export const Id = str({ min: 1, max: 128, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/ })
export const EntityId = str({ max: 128, pattern: /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/ })
export const Instant = str({ max: 40, format: 'date-time' })
export const LocalDate = str({ max: 10, format: 'date' })
export const LocalTime = str({ max: 5, format: 'time' })
export const Timezone = str({ max: 64, format: 'iana-timezone' })
export const ReasonCode = str({ min: 1, max: 64, pattern: /^[A-Z][A-Z0-9_]*$/ })
export const ReasonCodes = arr(ReasonCode, { max: 20 })
export const ShortText = str({ max: 256 })
export const Scalar = anyOf(str({ max: 256 }), num(), bool(), nul())
export const ScalarMap = record(Scalar, { maxProperties: 20, keyMax: 80 })
export const Probability = num({ min: 0, max: 1 })
export const Count = num({ min: 0, integer: true })
export const Revision = num({ min: 1, max: 1_000_000, integer: true })

export const Attribution = enm(['manual_confirmed', 'manual_likely', 'automation', 'system', 'unknown'] as const)
export const Delivery = enm(['live', 'snapshot', 'backfill', 'replay'] as const)

export const ScopeSchema = tagged('kind', [
  obj({ kind: lit('household'), subject_id: nul() }),
  obj({ kind: lit('person'), subject_id: Id }),
  obj({ kind: lit('anonymous'), subject_id: nul() }),
])
export type Scope = Infer<typeof ScopeSchema>

export const QualitySchema = obj({
  attribution: Attribution,
  attribution_score: Probability,
  reason_codes: ReasonCodes,
  coverage: enm(['complete', 'partial', 'unknown'] as const),
  stale: bool(),
})
export type Quality = Infer<typeof QualitySchema>

export const StateValueSchema = obj({
  state: nullable(str({ max: 255 })),
  attributes: ScalarMap,
  source_updated_at: nullable(Instant),
  availability: enm(['available', 'unknown', 'unavailable'] as const),
})
export type StateValue = Infer<typeof StateValueSchema>

export const ForecastPointSchema = refine(obj({
  from: Instant,
  until: Instant,
  resolution: enm(['hourly', 'daily', 'other'] as const),
  condition: nullable(str({ max: 64 })),
  rain_probability: nullable(Probability),
  precipitation_mm: nullable(num({ min: 0, max: 1000 })),
  temperature_c: nullable(num({ min: -90, max: 70 })),
  wind_kmh: nullable(num({ min: 0, max: 500 })),
}), (point) => Date.parse(point.until) > Date.parse(point.from) ? null : 'until deve seguire from')
export type ForecastPoint = Infer<typeof ForecastPointSchema>

// ── Payload degli eventi ─────────────────────────────────────────────────────

export const ManualIntentPayload = obj({
  operation_id: Id,
  interaction_id: Id,
  control: enm(['button', 'toggle', 'slider', 'scene', 'other'] as const),
  action_key: str({ min: 1, max: 80, pattern: /^[a-z][a-z0-9_.-]*$/ }),
  target_entity_ids: arr(EntityId, { min: 1, max: 100, unique: true }),
  requested: ScalarMap,
}, { id: 'urn:home-ai-core:manual-intent-payload:v1' })

export const ManualResultPayload = obj({
  operation_id: Id,
  result: enm(['accepted', 'failed', 'unknown'] as const),
  reason_code: nullable(ReasonCode),
  ha_context_id: nullable(str({ max: 64 })),
})

export const StateChangedPayload = obj({
  entity_id: EntityId,
  before: nullable(StateValueSchema),
  after: nullable(StateValueSchema),
  effect_of_operation_id: nullable(Id),
})

export const PresenceSignalPayload = obj({
  presence_source_id: Id,
  status: enm(['home', 'away', 'unknown'] as const),
  subject_id: nullable(Id),
})

export const ForecastUpdatedPayload = obj({
  forecast_source_id: Id,
  issued_at: nullable(Instant),
  fetched_at: Instant,
  expires_at: Instant,
  points: arr(ForecastPointSchema, { max: 240 }),
})

export const CalendarUpdatedPayload = obj({
  calendar_id: Id,
  revision: Revision,
  status: enm(['draft', 'approved', 'expired', 'conflict'] as const),
})

export const CoverageGapPayload = obj({
  source_id: Id,
  from: Instant,
  until: nullable(Instant),
  reason_code: ReasonCode,
})

const EventSource = obj({
  id: Id,
  kind: enm(['ha', 'dashboard', 'calendar', 'weather', 'fixture'] as const),
  native_id: nullable(str({ max: 128 })),
})

const eventBase = {
  schema_version: lit(1),
  event_id: Id,
  source: EventSource,
  occurred_at: Instant,
  received_at: Instant,
  delivery: Delivery,
  scope: ScopeSchema,
  actor_id: nullable(Id),
  context: obj({ id: nullable(str({ max: 64 })), parent_id: nullable(str({ max: 64 })) }),
  quality: QualitySchema,
  causation_event_id: nullable(Id),
  privacy_scope_version: num({ min: 1, max: 1_000_000, integer: true }),
}

export const ObservedEventSchema = tagged('kind', [
  obj({ ...eventBase, kind: lit('manual.intent'), payload: ManualIntentPayload }),
  obj({ ...eventBase, kind: lit('manual.result'), payload: ManualResultPayload }),
  obj({ ...eventBase, kind: lit('state.changed'), payload: StateChangedPayload }),
  obj({ ...eventBase, kind: lit('presence.signal'), payload: PresenceSignalPayload }),
  obj({ ...eventBase, kind: lit('forecast.updated'), payload: ForecastUpdatedPayload }),
  obj({ ...eventBase, kind: lit('calendar.updated'), payload: CalendarUpdatedPayload }),
  obj({ ...eventBase, kind: lit('coverage.gap'), payload: CoverageGapPayload }),
])
export type ObservedEvent = Infer<typeof ObservedEventSchema>
export type EventKind = ObservedEvent['kind']
export type EventOf<K extends EventKind> = Extract<ObservedEvent, { kind: K }>

// ── Pattern, piani, proposte, approvazioni ───────────────────────────────────

export const ProspectiveStepSchema = obj({
  step_id: Id,
  capability_key: enm([
    'lighting.set', 'switch.set', 'climate.set_mode', 'climate.set_temperature', 'cover.set',
    'media.set', 'fan.set', 'scene.activate', 'vacuum.set', 'humidifier.set', 'reminder.show', 'preference.save',
  ] as const),
  target_entity_ids: arr(EntityId, { max: 20, unique: true }),
  desired: ScalarMap,
  after_step_id: nullable(Id),
  earliest_at: nullable(Instant),
  latest_at: nullable(Instant),
  required_state: ScalarMap,
})
export type ProspectiveStep = Infer<typeof ProspectiveStepSchema>

export const HabitPatternSchema = obj({
  schema_version: lit(1),
  pattern_id: Id,
  revision: Revision,
  scope: ScopeSchema,
  state: enm(['candidate', 'supported', 'accepted', 'suppressed', 'retired'] as const),
  context_rule_id: Id,
  steps: arr(ProspectiveStepSchema, { min: 1, max: 5 }),
  period: obj({ from: Instant, until: Instant }),
  counts: obj({
    eligible_opportunities: Count,
    successes: Count,
    counterexamples: Count,
    distinct_days: Count,
  }),
  confidence: nullable(Probability),
  wilson_lower: nullable(Probability),
  coverage: Probability,
  weighted_score: num({ min: 0 }),
  baseline_frequency: nullable(Probability),
  temporal_validation: enm(['pending', 'passed', 'failed'] as const),
  evidence_episode_ids: arr(Id, { max: 500 }),
  algorithm: obj({ name: str({ max: 64 }), version: str({ max: 32 }) }),
  reviewed_at: nullable(Instant),
  expires_at: Instant,
  privacy_scope_version: num({ min: 1, integer: true }),
  /** Motivo dell'ultimo cambio di stato (promozione, sospensione, ritiro). */
  status_reason: ReasonCodes,
})
export type HabitPattern = Infer<typeof HabitPatternSchema>

export const RiskLevel = enm(['information', 'low', 'medium', 'high'] as const)
export const PolicyOutcome = enm(['allow_local', 'defer', 'reject', 'simulate_only'] as const)

export const ProposalSchema = obj({
  schema_version: lit(1),
  proposal_id: Id,
  revision: Revision,
  agent_key: enm(['arrival', 'waste', 'weather', 'comfort', 'energy'] as const),
  scope: ScopeSchema,
  kind: enm(['reminder', 'preference', 'contextual_suggestion'] as const),
  topic: Id,
  title: str({ min: 1, max: 140 }),
  explanation: str({ min: 1, max: 1_000 }),
  context_snapshot_id: Id,
  evidence_ids: arr(Id, { max: 200 }),
  pattern_id: nullable(Id),
  occurrence_id: nullable(Id),
  risk: RiskLevel,
  resources: arr(str({ max: 128 }), { max: 20 }),
  steps: arr(ProspectiveStepSchema, { max: 5 }),
  policy_version: num({ min: 1, integer: true }),
  policy_result: PolicyOutcome,
  reason_codes: ReasonCodes,
  state: enm([
    'candidate', 'policy_checked', 'visible', 'dismissed', 'snoozed', 'preference_saved',
    'simulation_authorized', 'simulated', 'simulation_failed', 'expired', 'superseded', 'withdrawn',
  ] as const),
  snoozed_until: nullable(Instant),
  created_at: Instant,
  expires_at: Instant,
  plan_hash: str({ min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }),
  physical_execution: lit('disabled'),
})
export type Proposal = Infer<typeof ProposalSchema>

export const ApprovalSchema = obj({
  approval_id: Id,
  proposal_id: Id,
  proposal_revision: Revision,
  plan_hash: str({ min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }),
  actor_id: Id,
  scope: ScopeSchema,
  purpose: enm(['save_preference', 'simulate_once'] as const),
  granted_at: Instant,
  expires_at: Instant,
  revoked_at: nullable(Instant),
})
export type Approval = Infer<typeof ApprovalSchema>

// ── Calendario rifiuti ───────────────────────────────────────────────────────

export const WasteRuleSchema = obj({
  rule_id: Id,
  fraction_id: Id,
  recurrence: tagged('kind', [
    obj({ kind: lit('dates'), dates: arr(LocalDate, { min: 1, max: 400, unique: true }) }),
    obj({ kind: lit('rrule'), dtstart: LocalDate, value: str({ min: 1, max: 200 }) }),
  ]),
  collection_time: nullable(LocalTime),
  exposure: obj({
    start_day_offset: num({ min: -7, max: 0, integer: true }),
    start_time: LocalTime,
    end_day_offset: num({ min: -7, max: 0, integer: true }),
    end_time: LocalTime,
  }),
  reminders: arr(obj({ day_offset: num({ min: -7, max: 0, integer: true }), at: LocalTime }), { max: 4 }),
})
export type WasteRule = Infer<typeof WasteRuleSchema>

export const WasteExceptionSchema = tagged('kind', [
  obj({ rule_id: Id, original_date: LocalDate, kind: lit('cancel') }),
  obj({
    rule_id: Id,
    original_date: LocalDate,
    kind: lit('replace'),
    replacement_date: LocalDate,
    collection_time: nullable(LocalTime),
  }),
])
export type WasteException = Infer<typeof WasteExceptionSchema>

export const WasteCalendarSchema = refine(obj({
  schema_version: lit(1),
  calendar_id: Id,
  revision: Revision,
  municipality: str({ max: 120 }),
  area: str({ max: 120 }),
  timezone: Timezone,
  valid_from: LocalDate,
  valid_until: LocalDate,
  source: obj({
    kind: enm(['manual', 'local_ics', 'ha_calendar'] as const),
    reference: str({ min: 1, max: 256 }),
    document_url: nullable(str({ max: 512, pattern: /^https:\/\/[^\s]+$/ })),
    checksum: nullable(str({ max: 128 })),
    acquired_at: Instant,
  }),
  approval: obj({
    state: enm(['draft', 'approved', 'expired', 'conflict'] as const),
    actor_id: nullable(Id),
    confirmed_at: nullable(Instant),
  }),
  fractions: arr(obj({ id: Id, label: str({ min: 1, max: 60 }) }), { min: 1, max: 12 }),
  rules: arr(WasteRuleSchema, { max: 40 }),
  exceptions: arr(WasteExceptionSchema, { max: 400 }),
  /** Demo: mai valido come approvazione per una casa reale. */
  demo: bool(),
}), (calendar) => {
  if (calendar.valid_until < calendar.valid_from) return 'valid_until precede valid_from'
  const fractions = new Set(calendar.fractions.map((fraction) => fraction.id))
  if (calendar.rules.some((rule) => !fractions.has(rule.fraction_id))) return 'regola con frazione sconosciuta'
  const rules = new Set(calendar.rules.map((rule) => rule.rule_id))
  if (calendar.exceptions.some((exception) => !rules.has(exception.rule_id))) return 'eccezione su regola sconosciuta'
  return null
})
export type WasteCalendar = Infer<typeof WasteCalendarSchema>

export const ReminderOccurrenceSchema = obj({
  occurrence_id: Id,
  calendar_id: Id,
  calendar_revision: Revision,
  rule_id: Id,
  fraction_id: Id,
  fraction_label: str({ max: 60 }),
  collection_date: LocalDate,
  collection_time: nullable(LocalTime),
  exposure_from: Instant,
  exposure_until: Instant,
  reminder_at: Instant,
  /** Come è stata risolta un'ora civile inesistente/ambigua (cambio d'ora). */
  time_resolution: enm(['exact', 'shifted_forward', 'first_of_ambiguous'] as const),
  state: enm(['scheduled', 'due', 'visible', 'snoozed', 'completed', 'dismissed', 'expired', 'superseded'] as const),
  snoozed_until: nullable(Instant),
  updated_at: Instant,
})
export type ReminderOccurrence = Infer<typeof ReminderOccurrenceSchema>

// ── Contesto, episodi, preferenze, feedback ─────────────────────────────────

export const HomeContextSchema = obj({
  schema_version: lit(1),
  snapshot_id: Id,
  version: num({ min: 1, integer: true }),
  taken_at: Instant,
  timezone: Timezone,
  local_date: LocalDate,
  local_time: LocalTime,
  weekday: num({ min: 1, max: 7, integer: true }),
  daypart: enm(['night', 'morning', 'afternoon', 'evening'] as const),
  mode: enm(['observe', 'shadow', 'suggest'] as const),
  demo: bool(),
  occupancy: enm(['home', 'away', 'unknown'] as const),
  guests: bool(),
  quiet_hours: bool(),
  states: arr(obj({ entity_id: EntityId, value: StateValueSchema, stale: bool() }), { max: 1_000 }),
  forecast: nullable(obj({ source_id: Id, fetched_at: Instant, expires_at: Instant, valid: bool(), points: arr(ForecastPointSchema, { max: 240 }) })),
  open_gaps: arr(obj({ source_id: Id, from: Instant, reason_code: ReasonCode }), { max: 50 }),
  missing_capabilities: arr(str({ max: 64 }), { max: 50 }),
  policy_version: num({ min: 1, integer: true }),
  privacy_scope_version: num({ min: 1, integer: true }),
})
export type HomeContext = Infer<typeof HomeContextSchema>

export const ArrivalEpisodeSchema = obj({
  schema_version: lit(1),
  episode_id: Id,
  state: enm(['arrival_candidate', 'present_stable', 'ambiguous', 'cancelled'] as const),
  scope: ScopeSchema,
  subject_id: nullable(Id),
  absent_since: Instant,
  arrived_at: Instant,
  stable_at: nullable(Instant),
  window_from: Instant,
  window_until: Instant,
  local_date: LocalDate,
  weekday: num({ min: 1, max: 7, integer: true }),
  daypart: enm(['night', 'morning', 'afternoon', 'evening'] as const),
  coverage: enm(['complete', 'partial', 'unknown'] as const),
  others_present: bool(),
  guests: bool(),
  door_evidence: bool(),
  action_operation_ids: arr(Id, { max: 50 }),
  automation_effects: arr(EntityId, { max: 50 }),
  late_corrected: bool(),
})
export type ArrivalEpisode = Infer<typeof ArrivalEpisodeSchema>

export const PreferenceSchema = obj({
  schema_version: lit(1),
  preference_id: Id,
  revision: Revision,
  scope: ScopeSchema,
  kind: enm(['never_suggest', 'routine', 'quiet', 'guest_rule', 'reminder_time'] as const),
  topic: Id,
  description: str({ min: 1, max: 280 }),
  pattern_id: nullable(Id),
  plan_hash: nullable(str({ min: 64, max: 64 })),
  created_by: Id,
  created_at: Instant,
  revoked_at: nullable(Instant),
})
export type Preference = Infer<typeof PreferenceSchema>

export const FeedbackKind = enm([
  'not_useful', 'wrong_context', 'never_suggest', 'forget', 'snooze', 'dismiss', 'done',
] as const)

export const FeedbackSchema = obj({
  feedback_id: Id,
  target_kind: enm(['proposal', 'reminder', 'pattern'] as const),
  target_id: Id,
  kind: FeedbackKind,
  actor_id: Id,
  scope: ScopeSchema,
  note: nullable(str({ max: 280 })),
  created_at: Instant,
})
export type Feedback = Infer<typeof FeedbackSchema>

export const PolicyDecisionSchema = obj({
  decision_id: Id,
  candidate_key: str({ min: 1, max: 200 }),
  outcome: PolicyOutcome,
  reason_codes: ReasonCodes,
  constraints: arr(str({ max: 200 }), { max: 20 }),
  missing_data: arr(str({ max: 120 }), { max: 20 }),
  policy_version: num({ min: 1, integer: true }),
  evaluated_at: Instant,
  context_snapshot_id: Id,
})
export type PolicyDecision = Infer<typeof PolicyDecisionSchema>

export const SimulationReportSchema = obj({
  report_id: Id,
  proposal_id: Id,
  proposal_revision: Revision,
  context_snapshot_id: Id,
  plan_hash: str({ min: 64, max: 64 }),
  seed: num({ min: 0, max: 2_147_483_647, integer: true }),
  status: enm(['simulated', 'failed', 'blocked'] as const),
  steps: arr(obj({
    step_id: Id,
    outcome: enm(['would_apply', 'already_satisfied', 'redundant_automation', 'conflict', 'precondition_missing', 'not_reached', 'simulated_failure'] as const),
    diff: ScalarMap,
    note: str({ max: 280 }),
  }), { max: 5 }),
  risk: RiskLevel,
  uncertainty: arr(str({ max: 200 }), { max: 20 }),
  physical_effects: lit(false),
  external_notifications: lit(false),
  reason_codes: ReasonCodes,
  created_at: Instant,
})
export type SimulationReport = Infer<typeof SimulationReportSchema>

export const PrivacyConsentSchema = obj({
  consent_id: Id,
  source_id: Id,
  subject_id: nullable(Id),
  purpose: enm(['observation', 'learning', 'personalization'] as const),
  granted: bool(),
  granted_by: nullable(Id),
  updated_at: Instant,
  scope_version: num({ min: 1, integer: true }),
})
export type PrivacyConsent = Infer<typeof PrivacyConsentSchema>

export const PrivacyDeletionJobSchema = obj({
  job_id: Id,
  requested_by: Id,
  selector: obj({
    entity_ids: arr(EntityId, { max: 100 }),
    subject_id: nullable(Id),
    pattern_id: nullable(Id),
    before: nullable(Instant),
    all: bool(),
  }),
  state: enm(['pending', 'running', 'completed', 'failed'] as const),
  removed: obj({
    events: Count, episodes: Count, patterns: Count, snapshots: Count, proposals: Count, preferences: Count,
  }),
  requested_at: Instant,
  completed_at: nullable(Instant),
})
export type PrivacyDeletionJob = Infer<typeof PrivacyDeletionJobSchema>

export const HealthStatusSchema = obj({
  service: enm(['running', 'degraded', 'disabled', 'misconfigured'] as const),
  mode: enm(['observe', 'shadow', 'suggest'] as const),
  demo: bool(),
  storage: enm(['ok', 'read_only', 'unavailable'] as const),
  ha_source: enm(['not_configured', 'reachable', 'unreachable', 'disabled'] as const),
  coverage: enm(['complete', 'partial', 'unknown'] as const),
  learner: enm(['active', 'stopped_no_consent', 'demo_only'] as const),
  waste_calendar: enm(['not_configured', 'draft', 'approved', 'expired', 'conflict'] as const),
  forecast: enm(['available', 'current_only', 'unavailable'] as const),
  reasoner: lit('not_configured'),
  physical_execution: lit('disabled'),
  last_backup_at: nullable(Instant),
  last_restore_verified_at: nullable(Instant),
  queue_depth: Count,
  issues: arr(obj({ code: ReasonCode, message: str({ max: 280 }) }), { max: 30 }),
})
export type HealthStatus = Infer<typeof HealthStatusSchema>

/** Ogni contratto esportato in `schemas/` (nome file → schema). */
export const EXPORTED_SCHEMAS: Record<string, { schema: Schema<unknown>; title: string }> = {
  'observed-event.v1': { schema: ObservedEventSchema, title: 'ObservedEvent' },
  'manual-intent-payload.v1': { schema: ManualIntentPayload, title: 'ManualIntentPayload' },
  'habit-pattern.v1': { schema: HabitPatternSchema, title: 'HabitPattern' },
  'proposal.v1': { schema: ProposalSchema, title: 'Proposal' },
  'approval.v1': { schema: ApprovalSchema, title: 'Approval' },
  'waste-calendar.v1': { schema: WasteCalendarSchema, title: 'WasteCalendar' },
  'reminder-occurrence.v1': { schema: ReminderOccurrenceSchema, title: 'ReminderOccurrence' },
  'home-context.v1': { schema: HomeContextSchema, title: 'HomeContext' },
  'arrival-episode.v1': { schema: ArrivalEpisodeSchema, title: 'ArrivalEpisode' },
  'preference.v1': { schema: PreferenceSchema, title: 'Preference' },
  'feedback.v1': { schema: FeedbackSchema, title: 'Feedback' },
  'policy-decision.v1': { schema: PolicyDecisionSchema, title: 'PolicyDecision' },
  'simulation-report.v1': { schema: SimulationReportSchema, title: 'SimulationReport' },
  'privacy-consent.v1': { schema: PrivacyConsentSchema, title: 'PrivacyConsent' },
  'privacy-deletion-job.v1': { schema: PrivacyDeletionJobSchema, title: 'PrivacyDeletionJob' },
  'health-status.v1': { schema: HealthStatusSchema, title: 'HealthStatus' },
}

export function exportedSchemaFiles(): Record<string, JsonSchema> {
  return Object.fromEntries(Object.entries(EXPORTED_SCHEMAS).map(([name, entry]) => [
    `${name}.schema.json`,
    exportJsonSchema(entry.schema, `urn:home-ai-core:${name}`, entry.title),
  ]))
}
