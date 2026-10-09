import {
  arr, bool, enm, lit, num, nul, obj, parse, str, refine, type Infer,
} from './domain/schema.js'
import { EntityId, LocalTime, Timezone } from './domain/contracts.js'

/**
 * Configurazione rigorosa del core (specifica §5, §24).
 *
 * Ogni chiave è prevista; una chiave sconosciuta o un valore incoerente è un
 * errore, mai un ripiego silenzioso. `physical_execution`,
 * `external_notifications`, `capture_audio/video` e il reasoner accettano UN
 * solo valore: non esiste un ramo "esecuzione reale" dormiente.
 *
 * Formato JSON (non YAML): il progetto non ha un parser YAML e una dipendenza
 * nuova per un file di configurazione non è giustificata (ADR-003).
 */

const Days = (max: number) => num({ min: 1, max, integer: true })

export const CoreConfigSchema = refine(obj({
  schema_version: lit(1),
  runtime: obj({
    mode: enm(['observe', 'shadow', 'suggest'] as const),
    timezone: Timezone,
    demo: bool(),
    workers: num({ min: 1, max: 4, integer: true }),
    physical_execution: lit('disabled'),
    external_notifications: lit('disabled'),
  }),
  sources: obj({
    fixtures: obj({ enabled: bool(), dataset: enm(['demo-home-v1'] as const) }),
    home_assistant: obj({
      enabled: bool(),
      selected_entities: arr(EntityId, { max: 1_000, unique: true }),
      selected_event_types: arr(lit('state_changed'), { min: 1, max: 1 }),
      rest_fallback_seconds: num({ min: 10, max: 3_600, integer: true }),
      presence_entities: arr(EntityId, { max: 20, unique: true }),
      door_entities: arr(EntityId, { max: 10, unique: true }),
      window_entities: arr(EntityId, { max: 50, unique: true }),
    }),
    weather: obj({
      adapter: enm(['fixture', 'none', 'myhome_openweather'] as const),
      forecast_ttl_minutes: num({ min: 10, max: 1_440, integer: true }),
      external_network_enabled: bool(),
    }),
  }),
  privacy: obj({
    real_observation_enabled: bool(),
    real_learning_enabled: bool(),
    personal_profiles_enabled: bool(),
    capture_audio: lit(false),
    capture_video: lit(false),
    retention_days: obj({
      events: Days(365), episodes: Days(730), statistics: Days(730), audit: Days(365), quarantine: Days(7),
    }),
  }),
  learning: obj({
    confirmed_manual_only: lit(true),
    min_opportunities: num({ min: 3, max: 1_000, integer: true }),
    min_successes: num({ min: 2, max: 1_000, integer: true }),
    min_distinct_days: num({ min: 1, max: 365, integer: true }),
    min_observation_days: num({ min: 1, max: 365, integer: true }),
    min_coverage: num({ min: 0, max: 1 }),
    min_frequency: num({ min: 0, max: 1 }),
    min_wilson_lower: num({ min: 0, max: 1 }),
    decay_half_life_days: num({ min: 1, max: 365 }),
    max_sequence_steps: num({ min: 1, max: 5, integer: true }),
  }),
  arrival: obj({
    previous_absence_minutes: num({ min: 1, max: 1_440, integer: true }),
    presence_stability_seconds: num({ min: 0, max: 3_600, integer: true }),
    episode_before_minutes: num({ min: 0, max: 60, integer: true }),
    episode_after_minutes: num({ min: 1, max: 240, integer: true }),
    duplicate_cooldown_minutes: num({ min: 0, max: 1_440, integer: true }),
  }),
  attention: obj({
    proactive_daily_budget: num({ min: 0, max: 50, integer: true }),
    topic_cooldown_hours: num({ min: 0, max: 168 }),
    quiet_hours: obj({ from: LocalTime, until: LocalTime }),
  }),
  agents: obj({ arrival: bool(), waste: bool(), weather: bool(), comfort: bool(), energy: bool() }),
  waste: obj({ expansion_horizon_days: num({ min: 1, max: 120, integer: true }) }),
  policy: obj({
    weights: obj({
      utility: num({ min: 0, max: 10 }),
      imminence: num({ min: 0, max: 10 }),
      support: num({ min: 0, max: 10 }),
      attention_cost: num({ min: 0, max: 10 }),
      uncertainty: num({ min: 0, max: 10 }),
    }),
    min_score: num({ min: -100, max: 100 }),
  }),
  reasoner: obj({ adapter: lit('disabled'), network_enabled: lit(false), model_path: nul() }),
  /** Riservato: identifica la persona amministratrice locale nel log. */
  operator_label: str({ min: 1, max: 40 }),
}), (config) => {
  if (config.learning.min_successes > config.learning.min_opportunities) return 'min_successes supera min_opportunities'
  if (config.runtime.demo && config.sources.home_assistant.enabled && config.privacy.real_learning_enabled) {
    return 'la demo non può apprendere da dati reali: disattiva demo o l’apprendimento reale'
  }
  if (config.sources.weather.adapter === 'myhome_openweather' && !config.sources.weather.external_network_enabled) {
    return 'il meteo OpenWeather richiede external_network_enabled: true (uso dichiarato di Internet)'
  }
  return null
})

export type CoreConfig = Infer<typeof CoreConfigSchema>

export function defaultCoreConfig(): CoreConfig {
  return {
    schema_version: 1,
    runtime: {
      mode: 'shadow', timezone: 'Europe/Rome', demo: true, workers: 2,
      physical_execution: 'disabled', external_notifications: 'disabled',
    },
    sources: {
      fixtures: { enabled: true, dataset: 'demo-home-v1' },
      home_assistant: {
        enabled: false, selected_entities: [], selected_event_types: ['state_changed'], rest_fallback_seconds: 60,
        presence_entities: [], door_entities: [], window_entities: [],
      },
      weather: { adapter: 'fixture', forecast_ttl_minutes: 180, external_network_enabled: false },
    },
    privacy: {
      real_observation_enabled: false, real_learning_enabled: false, personal_profiles_enabled: false,
      capture_audio: false, capture_video: false,
      retention_days: { events: 30, episodes: 90, statistics: 90, audit: 90, quarantine: 1 },
    },
    learning: {
      confirmed_manual_only: true, min_opportunities: 10, min_successes: 7, min_distinct_days: 3,
      min_observation_days: 14, min_coverage: 0.9, min_frequency: 0.75, min_wilson_lower: 0.45,
      decay_half_life_days: 30, max_sequence_steps: 5,
    },
    arrival: {
      previous_absence_minutes: 10, presence_stability_seconds: 60, episode_before_minutes: 2,
      episode_after_minutes: 20, duplicate_cooldown_minutes: 30,
    },
    attention: { proactive_daily_budget: 3, topic_cooldown_hours: 6, quiet_hours: { from: '22:30', until: '07:30' } },
    agents: { arrival: true, waste: true, weather: true, comfort: false, energy: false },
    waste: { expansion_horizon_days: 60 },
    policy: { weights: { utility: 1, imminence: 1, support: 1, attention_cost: 1, uncertainty: 1 }, min_score: 0 },
    reasoner: { adapter: 'disabled', network_enabled: false, model_path: null },
    operator_label: 'amministratore',
  }
}

export class ConfigRejected extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(`Configurazione HOME AI CORE respinta: ${issues.join('; ')}`)
    this.name = 'ConfigRejected'
    this.issues = issues
  }
}

/** Valida una configurazione completa; respinge invece di correggere. */
export function validateCoreConfig(input: unknown): CoreConfig {
  const result = parse(CoreConfigSchema, input)
  if (!result.ok) throw new ConfigRejected(result.issues.map((issue) => `${issue.path}: ${issue.message}`))
  return result.value
}

/**
 * Variabili d'ambiente che tentano di attivare effetti reali: l'avvio del core
 * viene rifiutato (T41). Non esiste un valore che le abiliti.
 */
const FORBIDDEN_ENV = /^HOME_AI_(PHYSICAL|EXECUT|EXECUTION|ACTUATOR|AUTONOM|NOTIFY|NOTIFICATION|REASONER|LLM|MODEL)/

export function assertSafeEnvironment(env: Readonly<Record<string, string | undefined>>): void {
  const offending = Object.entries(env)
    .filter(([key, value]) => FORBIDDEN_ENV.test(key) && value !== undefined && value !== '' && value !== 'disabled' && value !== 'false')
    .map(([key]) => key)
  if (offending.length) throw new ConfigRejected(offending.map((key) => `${key}: esecuzione reale, notifiche e modelli non sono disponibili in questa release`))
}
