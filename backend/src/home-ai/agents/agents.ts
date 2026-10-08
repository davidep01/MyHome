import type { HomeContext, ProspectiveStep } from '../domain/contracts.js'
import { localParts } from '../domain/time.js'
import type { CoreConfig } from '../config.js'
import type { StoredEpisode } from '../episodes/arrival.js'
import type { StoredPattern } from '../learning/patterns.js'
import { containsInOrder } from '../learning/miner.js'
import { riskOfCapability } from '../policy/engine.js'
import type { StoredOccurrence } from '../waste/service.js'
import { reminderText } from '../waste/calendar.js'
import { rainSpans, RAIN_PROBABILITY_THRESHOLD } from '../weather/forecast.js'
import type { AgentTrigger, Candidate } from './types.js'

/**
 * Agenti deterministici (specifica §15). Ricevono contesto, trigger e porte
 * di SOLA lettura; producono candidati. Le frasi sono template con dati reali
 * o di fixture etichettate: mai "ho chiuso", "ho acceso", "ho notificato".
 */

export interface AgentDeps {
  config: CoreConfig
  now: Date
  demo: boolean
  label: (entityId: string) => string
  patterns: () => StoredPattern[]
  episode: (episodeId: string) => StoredEpisode | null
  occurrence: (occurrenceId: string) => StoredOccurrence | null
  windowEntities: () => string[]
}

const RISK_ORDER = ['information', 'low', 'medium', 'high'] as const
const maxRisk = (steps: ProspectiveStep[]) => steps.reduce((acc, step) => {
  const r = riskOfCapability(step.capability_key)
  return RISK_ORDER.indexOf(r) > RISK_ORDER.indexOf(acc) ? r : acc
}, 'information' as Candidate['risk'])

const ACTION_LABEL: Record<string, string> = {
  on: 'acceso', off: 'spento', toggle: 'commutato', mode: 'impostato la modalità di', temperature: 'regolato la temperatura di',
  open: 'aperto', close: 'chiuso', play: 'avviato', pause: 'messo in pausa', activate: 'attivato', run: 'avviato',
  position: 'regolato', speed: 'regolato', volume: 'regolato il volume di', preset: 'scelto il preset di',
}

function describeSteps(steps: ProspectiveStep[], label: (id: string) => string): string {
  const parts = steps.map((step) => {
    const verb = ACTION_LABEL[String(step.desired.action)] ?? 'usato'
    return `${verb} ${step.target_entity_ids.map(label).join(', ')}`
  })
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', poi ')} e poi ${parts[parts.length - 1]}`
}

function weeksLabel(fromIso: string, untilIso: string): string {
  const days = Math.max(1, Math.round((Date.parse(untilIso) - Date.parse(fromIso)) / 86_400_000))
  return days >= 14 ? `Nelle ultime ${Math.round(days / 7)} settimane` : `Negli ultimi ${days} giorni`
}

/** Rientro: propone di salvare come preferenza una routine supportata dai dati. */
export function arrivalAgent(context: HomeContext, trigger: AgentTrigger, deps: AgentDeps): Candidate[] {
  if (!deps.config.agents.arrival) return []
  if (trigger.kind !== 'episode_finalized' && trigger.kind !== 'review') return []
  let daypart: string | null = null
  let episode: StoredEpisode | null = null
  if (trigger.kind === 'episode_finalized') {
    episode = deps.episode(trigger.episode_id)
    // Un episodio corretto in ritardo non genera suggerimenti "live" retroattivi (T11).
    if (!episode || episode.late_corrected || episode.state !== 'present_stable') return []
    daypart = episode.daypart
  }
  const supported = deps.patterns().filter((p) => p.demo === deps.demo && p.state === 'supported' && (!daypart || p.context_rule_id.endsWith(`.${daypart}`)))
  // Solo i pattern massimali: una sottosequenza di un'altra routine supportata non si propone a parte.
  const maximal = supported.filter((p) => !supported.some((other) => other !== p && other.tokens.length > p.tokens.length && containsInOrder(other.tokens, p.tokens)))
  return maximal.map((pattern) => {
    const { counts } = pattern
    const automationOverlap = episode
      ? pattern.steps.flatMap((s) => s.target_entity_ids).filter((id) => episode!.automation_effects.includes(id))
      : []
    const dayparts: Record<string, string> = { evening: 'serali', afternoon: 'pomeridiani', morning: 'mattutini', night: 'notturni' }
    const part = pattern.context_rule_id.split('.').pop() ?? ''
    const explanation = [
      `${weeksLabel(pattern.period.from, pattern.period.until)}, in ${counts.successes} dei ${counts.eligible_opportunities} rientri ${dayparts[part] ?? ''} osservabili hai ${describeSteps(pattern.steps, deps.label)}.`,
      counts.counterexamples ? `In ${counts.counterexamples} rientri non è successo.` : '',
      pattern.temporal_validation === 'passed' ? 'L’abitudine si è confermata anche nei rientri più recenti.' : 'Ipotesi non ancora verificata nel tempo.',
      automationOverlap.length ? `Un’automazione esistente agisce già su ${automationOverlap.map(deps.label).join(', ')}: salvarla potrebbe essere ridondante.` : '',
      'Vuoi salvare questa routine come preferenza? Questa versione non controlla i dispositivi.',
    ].filter(Boolean).join(' ')
    return {
      agent_key: 'arrival',
      kind: 'preference',
      topic: `routine:${pattern.pattern_id}`,
      title: 'Routine del rientro',
      explanation,
      evidence_ids: pattern.evidence_episode_ids.slice(0, 50),
      pattern_id: pattern.pattern_id,
      occurrence_id: null,
      risk: maxRisk(pattern.steps),
      resources: pattern.steps.flatMap((s) => s.target_entity_ids).slice(0, 20),
      steps: pattern.steps,
      scope: pattern.scope,
      urgency: 'low',
      expires_at: new Date(deps.now.getTime() + 7 * 86_400_000).toISOString(),
      utility: 0.6,
      support: pattern.wilson_lower ?? 0,
      uncertainty: pattern.temporal_validation === 'passed' ? 0.1 : 0.3,
      attention_cost: 0.3,
      dedup_key: `pattern:${pattern.pattern_id}:r${pattern.revision}`,
      requires: [],
      learned: true,
      demo: deps.demo,
    } satisfies Candidate
  })
}

/** Rifiuti: un promemoria per occorrenza maturata, sempre dentro la finestra consentita. */
export function wasteAgent(context: HomeContext, trigger: AgentTrigger, deps: AgentDeps): Candidate[] {
  if (!deps.config.agents.waste || trigger.kind !== 'reminders_due') return []
  const tz = deps.config.runtime.timezone
  const out: Candidate[] = []
  for (const id of trigger.occurrence_ids) {
    const occurrence = deps.occurrence(id)
    if (!occurrence) continue
    const text = reminderText(occurrence, tz)
    let hint = ''
    const exposureFrom = new Date(Math.max(Date.parse(occurrence.exposure_from), deps.now.getTime()))
    const exposureUntil = new Date(occurrence.exposure_until)
    if (context.forecast?.valid) {
      const rain = rainSpans(context.forecast.points, exposureFrom, exposureUntil)
      // Punti orari o a 3 ore hanno un intervallo dichiarato; un punto giornaliero no (T31).
      const hourly = rain.filter((span) => span.resolution !== 'daily')
      if (hourly.length) {
        // Cerca un tratto senza pioggia DENTRO la finestra consentita (T29): mai fuori.
        const dry = findDryWindow(exposureFrom, exposureUntil, hourly)
        const rainFrom = localParts(new Date(hourly[0].from), tz).time
        const rainUntil = localParts(new Date(hourly[hourly.length - 1].until), tz).time
        hint = dry
          ? ` È prevista pioggia fra le ${rainFrom} e le ${rainUntil} (${hourly[0].evidence}): dentro la finestra consentita puoi esporre fra le ${localParts(dry.from, tz).time} e le ${localParts(dry.until, tz).time}.`
          : ` È prevista pioggia per tutta la finestra di esposizione: non c’è un momento alternativo consentito, il promemoria resta valido.`
      } else if (rain.length) {
        hint = ' È prevista pioggia nella giornata; la previsione non indica l’ora.'
      }
    }
    out.push({
      agent_key: 'waste',
      kind: 'reminder',
      topic: `waste:${occurrence.fraction_id}`,
      title: text.title,
      explanation: `${text.explanation}${hint}`.slice(0, 1_000),
      evidence_ids: [occurrence.occurrence_id],
      pattern_id: null,
      occurrence_id: occurrence.occurrence_id,
      risk: 'information',
      resources: [`waste:${occurrence.fraction_id}`],
      steps: [{
        step_id: 's1', capability_key: 'reminder.show', target_entity_ids: [], desired: { fraction: occurrence.fraction_id },
        after_step_id: null, earliest_at: occurrence.exposure_from, latest_at: occurrence.exposure_until, required_state: {},
      }],
      scope: { kind: 'household', subject_id: null },
      urgency: 'normal',
      expires_at: occurrence.exposure_until,
      utility: 0.8,
      support: 1,
      uncertainty: occurrence.time_resolution === 'exact' ? 0 : 0.2,
      attention_cost: 0.2,
      dedup_key: `reminder:${occurrence.occurrence_id}`,
      requires: ['calendar.approved'],
      learned: false,
      demo: occurrence.demo,
    })
  }
  return out
}

function findDryWindow(from: Date, until: Date, rain: { from: string; until: string }[]): { from: Date; until: Date } | null {
  const spans = rain.map((r) => [Date.parse(r.from), Date.parse(r.until)] as const).sort((a, b) => a[0] - b[0])
  let cursor = from.getTime()
  for (const [start, end] of spans) {
    if (start - cursor >= 30 * 60_000) return { from: new Date(cursor), until: new Date(Math.min(start, until.getTime())) }
    cursor = Math.max(cursor, end)
  }
  return until.getTime() - cursor >= 30 * 60_000 ? { from: new Date(cursor), until } : null
}

/** Meteo: pioggia valida prevista + finestra osservata aperta → ricordare di chiuderla. */
export function weatherAgent(context: HomeContext, trigger: AgentTrigger, deps: AgentDeps): Candidate[] {
  if (!deps.config.agents.weather) return []
  if (!['forecast_updated', 'state_changed', 'review'].includes(trigger.kind)) return []
  // Senza forecast valido nessuna affermazione su pioggia futura (T30).
  if (!context.forecast?.valid) return []
  const tz = deps.config.runtime.timezone
  const horizon = new Date(deps.now.getTime() + 6 * 3_600_000)
  const spans = rainSpans(context.forecast.points, deps.now, horizon)
  if (!spans.length) return []
  const out: Candidate[] = []
  for (const entityId of deps.windowEntities()) {
    const state = context.states.find((s) => s.entity_id === entityId)
    // `unavailable`/obsoleto non è né aperta né chiusa certa (T32).
    if (!state || state.stale || state.value.availability !== 'available') continue
    if (state.value.state !== 'on' && state.value.state !== 'open') continue
    const updated = state.value.source_updated_at
    const minutes = updated ? Math.max(0, Math.round((deps.now.getTime() - Date.parse(updated)) / 60_000)) : null
    const hourly = spans.filter((s) => s.resolution !== 'daily')
    const when = hourly.length
      ? `fra le ${localParts(new Date(hourly[0].from), tz).time} e le ${localParts(new Date(hourly[hourly.length - 1].until), tz).time}`
      : 'nelle prossime ore (previsione giornaliera, senza orario preciso)'
    out.push({
      agent_key: 'weather',
      kind: 'contextual_suggestion',
      topic: `weather:window:${entityId}`,
      title: 'Pioggia prevista, finestra aperta',
      explanation: `È prevista pioggia ${when} (${spans[0].evidence}, fonte ${context.forecast.source_id}). ${deps.label(entityId)} risulta aperta${minutes !== null ? `, aggiornata ${minutes < 1 ? 'meno di un minuto' : `${minutes} minuti`} fa` : ''}. Potresti chiuderla.`,
      evidence_ids: [],
      pattern_id: null,
      occurrence_id: null,
      risk: 'information',
      resources: [entityId],
      steps: [],
      scope: { kind: 'household', subject_id: null },
      urgency: hourly.length && Date.parse(hourly[0].from) - deps.now.getTime() < 3_600_000 ? 'high' : 'normal',
      expires_at: hourly.length ? hourly[hourly.length - 1].until : horizon.toISOString(),
      utility: 0.7,
      support: Math.max(RAIN_PROBABILITY_THRESHOLD, 0.6),
      uncertainty: hourly.length ? 0.2 : 0.4,
      attention_cost: 0.3,
      dedup_key: `weather:window:${entityId}:${context.local_date}`,
      requires: ['forecast.valid', `entity:${entityId}`],
      learned: false,
      demo: deps.demo,
    })
  }
  return out
}

/** Comfort: regole semplici, inattive senza sensori di temperatura e finestre (default off). */
export function comfortAgent(context: HomeContext, trigger: AgentTrigger, deps: AgentDeps): Candidate[] {
  if (!deps.config.agents.comfort || trigger.kind === 'reminders_due') return []
  const temps = context.states.filter((s) => s.entity_id.startsWith('sensor.') && s.value.attributes.device_class === 'temperature' && s.value.availability === 'available' && !s.stale)
  const openWindows = deps.windowEntities().filter((id) => context.states.find((s) => s.entity_id === id && !s.stale && (s.value.state === 'on' || s.value.state === 'open')))
  const cooling = context.states.find((s) => s.entity_id.startsWith('climate.') && !s.stale && s.value.attributes.hvac_action === 'cooling')
  if (!temps.length || !openWindows.length || !cooling) return []
  return [{
    agent_key: 'comfort',
    kind: 'contextual_suggestion',
    topic: 'comfort:cooling-window',
    title: 'Clima acceso con finestra aperta',
    explanation: `${deps.label(cooling.entity_id)} sta raffrescando mentre ${openWindows.map(deps.label).join(', ')} risulta aperta. È un possibile conflitto: valuta se chiudere la finestra o spegnere il clima.`,
    evidence_ids: [], pattern_id: null, occurrence_id: null, risk: 'information',
    resources: [cooling.entity_id, ...openWindows].slice(0, 20), steps: [],
    scope: { kind: 'household', subject_id: null }, urgency: 'normal',
    expires_at: new Date(deps.now.getTime() + 2 * 3_600_000).toISOString(),
    utility: 0.5, support: 0.8, uncertainty: 0.2, attention_cost: 0.3,
    dedup_key: `comfort:cooling-window:${context.local_date}`,
    requires: [`entity:${cooling.entity_id}`, ...openWindows.map((id) => `entity:${id}`)],
    learned: false, demo: deps.demo,
  }]
}

/** Energia: nessuna stima inventata. Senza misure e obiettivi configurati resta inattivo. */
export function energyAgent(_context: HomeContext, _trigger: AgentTrigger, deps: AgentDeps): Candidate[] {
  if (!deps.config.agents.energy) return []
  // Questa release non ha obiettivi energetici né tariffe configurabili: nessun suggerimento.
  return []
}

export const AGENTS = [arrivalAgent, wasteAgent, weatherAgent, comfortAgent, energyAgent]
