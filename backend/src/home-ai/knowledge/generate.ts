import type { KnowledgeFact, Preference, WasteCalendar } from '../domain/contracts.js'
import { canonicalHash } from '../domain/ids.js'
import type { CoreConfig } from '../config.js'
import type { CatalogEntry, EntityRole } from '../context/catalog.js'
import type { StoredPattern } from '../learning/patterns.js'
import type { StoredOccurrence } from '../waste/service.js'
import type { UserPolicyRule } from '../policy/engine.js'
import { describeSteps, weeksLabel } from '../agents/agents.js'

/**
 * Manuale della casa — parte GENERATA (puro, deterministico).
 *
 * I fatti si ricalcolano dallo stato corrente del core invece di essere
 * salvati: non invecchiano, e ciò che viene dimenticato (oblio, ritiro di
 * un'abitudine, revoca di una preferenza) sparisce anche dal manuale senza
 * un secondo percorso di cancellazione.
 *
 * Il manuale contiene ciò che è STABILE (stanze, dispositivi, abitudini
 * confermate, preferenze, calendario, regole, limiti). Lo stato istantaneo
 * dei dispositivi resta nel contesto, non qui. Le ipotesi non confermate non
 * entrano: un modello non deve trattarle come abitudini (T19).
 */

export interface KnowledgeSources {
  now: Date
  config: CoreConfig
  demo: boolean
  catalog: CatalogEntry[]
  patterns: StoredPattern[]
  preferences: Preference[]
  calendar: WasteCalendar | null
  calendarIssues: { code: string; message: string }[]
  upcoming: StoredOccurrence[]
  userRules: UserPolicyRule[]
  coverage: { channel: string; status: string }[]
  guests: boolean
  includePersonal: boolean
}

const ROLE_LABEL: Record<EntityRole, string> = {
  presence: 'un sensore di presenza', door: 'la porta d’ingresso', window: 'una finestra', light: 'una luce', climate: 'un climatizzatore',
  switch: 'un interruttore', cover: 'una tapparella o copertura', media: 'un lettore multimediale', sensor: 'un sensore', other: 'un dispositivo',
}

const CAPABILITY_LABEL: Record<string, string> = {
  'lighting.set': 'accendere, spegnere e regolare', 'switch.set': 'accendere e spegnere', 'climate.set_mode': 'cambiare modalità',
  'climate.set_temperature': 'regolare la temperatura', 'cover.set': 'aprire e chiudere', 'media.set': 'riprodurre e mettere in pausa',
  'fan.set': 'regolare la velocità', 'scene.activate': 'attivare', 'vacuum.set': 'avviare e mandare alla base', 'humidifier.set': 'regolare l’umidità',
}

const DAYPART: Record<string, { label: string; tag: string }> = {
  morning: { label: 'mattutini', tag: 'mattina' }, afternoon: { label: 'pomeridiani', tag: 'pomeriggio' },
  evening: { label: 'serali', tag: 'sera' }, night: { label: 'notturni', tag: 'notte' },
}

const MODE_LABEL: Record<string, string> = { observe: 'sola osservazione', shadow: 'in ombra (diagnostica)', suggest: 'suggerimenti' }

/** ID stabile: lo stesso fatto ha lo stesso ID fra una generazione e l'altra. */
function factId(kind: KnowledgeFact['kind'], ref: string): string {
  return `kf-${kind}-${canonicalHash(ref).slice(0, 16)}`
}

/** `demo_soggiorno` → "Soggiorno (demo)", `cucina_soggiorno` → "Cucina soggiorno". */
export function areaName(areaId: string): string {
  const demo = areaId.startsWith('demo_')
  const base = (demo ? areaId.slice(5) : areaId).replace(/_/g, ' ').trim()
  const name = base ? base[0].toUpperCase() + base.slice(1) : areaId
  return demo ? `${name} (demo)` : name
}

/** Parole utili alla ricerca: minuscole, senza accenti, compatibili con `KnowledgeTag`. */
export function tagify(text: string): string[] {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((token) => token.length >= 3)
}

function tags(...groups: (string | string[] | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const group of groups) {
    for (const raw of Array.isArray(group) ? group : group ? [group] : []) {
      const value = raw.toLowerCase()
      if (/^[a-z0-9][a-z0-9_.:-]*$/.test(value) && value.length <= 40) out.add(value)
      else for (const token of tagify(raw)) out.add(token)
    }
  }
  return [...out].slice(0, 16)
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

function formatDay(iso: string, tz: string, withTime: boolean): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso))
}

/** Data civile `YYYY-MM-DD` in italiano, senza passare dal fuso del server. */
function formatDate(date: string): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`))
}

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function generateKnowledge(src: KnowledgeSources): KnowledgeFact[] {
  const now = src.now.toISOString()
  const tz = src.config.runtime.timezone
  const facts: KnowledgeFact[] = []
  const household = { kind: 'household' as const, subject_id: null }
  const push = (fact: Omit<KnowledgeFact, 'schema_version' | 'fact_id' | 'updated_at' | 'revision' | 'demo' | 'origin'> & { ref: string }) => {
    const { ref, ...rest } = fact
    facts.push({
      schema_version: 1,
      fact_id: factId(fact.kind, ref),
      origin: 'generated',
      updated_at: now,
      revision: 1,
      demo: src.demo,
      ...rest,
      title: clip(rest.title, 120),
      statement: clip(rest.statement, 600),
    })
  }
  const labels = new Map(src.catalog.map((entry) => [entry.entity_id, entry.label]))
  const label = (id: string) => labels.get(id) ?? id

  // ── La casa ────────────────────────────────────────────────────────────────
  const rooms = new Map<string, CatalogEntry[]>()
  for (const entry of src.catalog) {
    const key = entry.area_id ?? ''
    rooms.set(key, [...(rooms.get(key) ?? []), entry])
  }
  const namedRooms = [...rooms.keys()].filter(Boolean)
  push({
    ref: 'home', kind: 'home', source: { module: 'config', ref: null },
    title: src.demo ? 'La casa (dimostrativa)' : 'La casa',
    statement: [
      src.demo ? 'Questi sono dati dimostrativi, non la casa reale.' : '',
      `Fuso orario ${tz}.`,
      `Il sistema osserva ${src.catalog.length} entità scelte esplicitamente${namedRooms.length ? `, in ${namedRooms.length} stanze` : ''}.`,
      `Modalità attuale: ${MODE_LABEL[src.config.runtime.mode] ?? src.config.runtime.mode}.`,
      src.guests ? 'In questo momento ci sono ospiti: le abitudini non vengono proposte.' : '',
    ].filter(Boolean).join(' '),
    tags: tags('casa', 'stanze', tz), entity_ids: [], scope: household, confidence: 'certain', valid_from: null, valid_until: null,
  })

  // ── Stanze ─────────────────────────────────────────────────────────────────
  for (const [areaId, entries] of [...rooms.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!areaId) continue
    const name = areaName(areaId)
    push({
      ref: `room:${areaId}`, kind: 'room', source: { module: 'catalog', ref: areaId },
      title: name,
      statement: `${name} contiene: ${entries.map((entry) => `${entry.label} (${ROLE_LABEL[entry.role].replace(/^(una|un|la|il|lo)\s+/, '')})`).join(', ')}.`,
      tags: tags('stanza', areaId, name), entity_ids: entries.map((entry) => entry.entity_id).slice(0, 20),
      scope: household, confidence: 'certain', valid_from: null, valid_until: null,
    })
  }

  // ── Dispositivi ────────────────────────────────────────────────────────────
  for (const entry of [...src.catalog].sort((a, b) => a.entity_id.localeCompare(b.entity_id))) {
    const caps = entry.capabilities.map((cap) => CAPABILITY_LABEL[cap]).filter(Boolean)
    push({
      ref: `device:${entry.entity_id}`, kind: 'device', source: { module: 'catalog', ref: entry.entity_id },
      title: entry.label,
      statement: [
        `${entry.label} (${entry.entity_id}) è ${ROLE_LABEL[entry.role]}${entry.area_id ? ` in ${areaName(entry.area_id)}` : ', senza stanza assegnata'}.`,
        caps.length ? `Dalla dashboard si può ${[...new Set(caps)].join(' e ')}.` : 'Si legge, non si comanda.',
      ].join(' '),
      tags: tags('dispositivo', entry.domain, entry.role, entry.area_id, entry.label, entry.entity_id),
      entity_ids: [entry.entity_id], scope: household, confidence: 'certain', valid_from: null, valid_until: null,
    })
  }

  // ── Abitudini confermate ───────────────────────────────────────────────────
  for (const pattern of src.patterns) {
    if (pattern.state !== 'supported' && pattern.state !== 'accepted') continue
    if (pattern.scope.kind === 'person' && !src.includePersonal) continue
    const part = DAYPART[pattern.context_rule_id.split('.').pop() ?? ''] ?? { label: '', tag: 'rientro' }
    const { counts } = pattern
    const targets = [...new Set(pattern.steps.flatMap((step) => step.target_entity_ids))]
    push({
      ref: `habit:${pattern.pattern_id}`, kind: 'habit', source: { module: 'patterns', ref: pattern.pattern_id },
      title: `Abitudine dei rientri ${part.label}`.trim(),
      statement: [
        `${weeksLabel(pattern.period.from, pattern.period.until)}, in ${counts.successes} dei ${counts.eligible_opportunities} rientri ${part.label} osservabili hai ${describeSteps(pattern.steps, label)}.`,
        counts.counterexamples ? `In ${counts.counterexamples} rientri non è successo.` : '',
        pattern.temporal_validation === 'passed' ? 'Si è confermata anche nei rientri più recenti.' : 'Non ancora verificata nel tempo.',
        pattern.state === 'accepted' ? 'L’hai salvata come routine.' : '',
      ].filter(Boolean).join(' '),
      tags: tags('abitudine', 'rientro', part.tag, targets, targets.map(label)),
      entity_ids: targets.slice(0, 20), scope: pattern.scope,
      confidence: pattern.state === 'accepted' ? 'declared' : 'observed', valid_from: pattern.period.from, valid_until: pattern.expires_at,
    })
  }

  // ── Preferenze esplicite ───────────────────────────────────────────────────
  for (const preference of src.preferences) {
    if (preference.revoked_at) continue
    if (preference.scope.kind === 'person' && !src.includePersonal) continue
    push({
      ref: `preference:${preference.preference_id}`, kind: 'preference', source: { module: 'preferences', ref: preference.preference_id },
      title: preference.kind === 'never_suggest' ? 'Da non suggerire' : preference.kind === 'routine' ? 'Routine salvata' : 'Preferenza',
      statement: `${preference.description.replace(/[.\s]+$/, '')}. Scelta tua: prevale su qualunque abitudine osservata.`,
      tags: tags('preferenza', preference.kind, preference.topic.split(':')[0]),
      entity_ids: [], scope: preference.scope, confidence: 'declared', valid_from: preference.created_at, valid_until: null,
    })
  }

  // ── Raccolta differenziata ─────────────────────────────────────────────────
  if (src.calendar) {
    const cal = src.calendar
    const fractionLabels = new Map(cal.fractions.map((fraction) => [fraction.id, fraction.label]))
    push({
      ref: `waste-calendar:${cal.calendar_id}`, kind: 'waste', source: { module: 'waste', ref: `${cal.calendar_id}@${cal.revision}` },
      title: 'Calendario della raccolta',
      statement: [
        cal.demo ? 'Calendario dimostrativo: non vale per la casa reale.' : '',
        `${cal.municipality || 'Comune non indicato'}, zona ${cal.area || 'non indicata'}.`,
        `Valido dal ${formatDate(cal.valid_from)} al ${formatDate(cal.valid_until)}, revisione ${cal.revision}.`,
        `Frazioni: ${cal.fractions.map((fraction) => fraction.label).join(', ')}.`,
        src.calendarIssues.length ? `Da verificare: ${src.calendarIssues.map((issue) => issue.message).join(' ')}` : '',
      ].filter(Boolean).join(' '),
      tags: tags('raccolta', 'rifiuti', 'calendario', cal.fractions.map((fraction) => fraction.label)),
      entity_ids: [], scope: household, confidence: src.calendarIssues.length ? 'uncertain' : 'declared',
      valid_from: null, valid_until: `${cal.valid_until}T23:59:59.000Z`,
    })
    const nextByFraction = new Map<string, StoredOccurrence>()
    for (const occurrence of src.upcoming) {
      if (!['scheduled', 'due', 'visible', 'snoozed'].includes(occurrence.state)) continue
      if (Date.parse(occurrence.exposure_until) <= src.now.getTime()) continue
      const current = nextByFraction.get(occurrence.fraction_id)
      if (!current || occurrence.collection_date < current.collection_date) nextByFraction.set(occurrence.fraction_id, occurrence)
    }
    for (const occurrence of [...nextByFraction.values()].sort((a, b) => a.collection_date.localeCompare(b.collection_date))) {
      const fraction = occurrence.fraction_label || fractionLabels.get(occurrence.fraction_id) || occurrence.fraction_id
      const collection = occurrence.collection_time
        ? `${formatDay(`${occurrence.collection_date}T12:00:00Z`, 'UTC', false)} alle ${occurrence.collection_time}`
        : formatDay(`${occurrence.collection_date}T12:00:00Z`, 'UTC', false)
      push({
        ref: `waste-next:${occurrence.fraction_id}`, kind: 'waste', source: { module: 'waste', ref: occurrence.occurrence_id },
        title: `Prossimo ritiro: ${fraction}`,
        statement: `${fraction}: ritiro ${collection}. Esporre da ${formatDay(occurrence.exposure_from, tz, true)} fino alle ${formatTime(occurrence.exposure_until, tz)}. Promemoria ${formatDay(occurrence.reminder_at, tz, true)}.`,
        tags: tags('raccolta', 'rifiuti', 'ritiro', fraction, occurrence.collection_date),
        entity_ids: [], scope: household, confidence: src.calendarIssues.length ? 'uncertain' : 'declared',
        valid_from: null, valid_until: occurrence.exposure_until,
      })
    }
  }

  // ── Regole di attenzione e policy ──────────────────────────────────────────
  const attention = src.config.attention
  push({
    ref: 'rule:quiet', kind: 'rule', source: { module: 'config', ref: 'attention.quiet_hours' },
    title: 'Fascia di quiete',
    statement: `Dalle ${attention.quiet_hours.from} alle ${attention.quiet_hours.until} il sistema non propone nulla che non sia urgente.`,
    tags: tags('quiete', 'notte', 'orari', 'regola'), entity_ids: [], scope: household, confidence: 'certain', valid_from: null, valid_until: null,
  })
  push({
    ref: 'rule:attention', kind: 'rule', source: { module: 'config', ref: 'attention' },
    title: 'Quanto il sistema può disturbare',
    statement: `Al massimo ${attention.proactive_daily_budget} suggerimenti proattivi al giorno e una pausa di ${attention.topic_cooldown_hours} ore prima di riproporre lo stesso tema. I promemoria della raccolta hanno un budget a parte.`,
    tags: tags('attenzione', 'suggerimenti', 'budget', 'regola'), entity_ids: [], scope: household, confidence: 'certain', valid_from: null, valid_until: null,
  })
  for (const rule of src.userRules) {
    const outcome = rule.outcome === 'defer' ? 'rinvia' : rule.outcome === 'reject' ? 'scarta' : 'solo in simulazione'
    push({
      ref: `rule:user:${rule.rule_id}`, kind: 'rule', source: { module: 'policy', ref: rule.rule_id },
      title: 'Regola personale',
      statement: `${rule.description.replace(/[.\s]+$/, '')} (esito: ${outcome}).`,
      tags: tags('regola', rule.reason_code.toLowerCase()), entity_ids: [], scope: household, confidence: 'declared', valid_from: null, valid_until: null,
    })
  }

  // ── Limiti del sistema (sempre presenti) ───────────────────────────────────
  push({
    ref: 'limit:execution', kind: 'limit', source: { module: 'config', ref: 'runtime.physical_execution' },
    title: 'Cosa il sistema non fa',
    statement: 'In questa versione il sistema non comanda dispositivi, non chiama servizi di Home Assistant, non crea automazioni, non invia notifiche e non usa modelli AI. Approvare una proposta salva una preferenza o autorizza una simulazione, niente di più.',
    tags: tags('limiti', 'sicurezza', 'comandi', 'esecuzione'), entity_ids: [], scope: household, confidence: 'certain', valid_from: null, valid_until: null,
  })
  push({
    ref: 'limit:privacy', kind: 'limit', source: { module: 'config', ref: 'privacy' },
    title: 'Cosa il sistema non registra',
    statement: 'Audio, video e posizione precisa non vengono mai registrati. Si osservano solo le entità scelte, con consensi separati per osservazione, apprendimento e profili personali.',
    tags: tags('limiti', 'privacy', 'consensi'), entity_ids: [], scope: household, confidence: 'certain', valid_from: null, valid_until: null,
  })
  for (const channel of src.coverage) {
    push({
      ref: `limit:coverage:${channel.channel}`, kind: 'limit', source: { module: 'coverage', ref: null },
      title: `Copertura: ${channel.channel}`,
      statement: `${channel.channel}: ${channel.status}.`,
      tags: tags('copertura', 'limiti', channel.channel), entity_ids: [], scope: household, confidence: 'certain', valid_from: null, valid_until: null,
    })
  }

  return facts
}
