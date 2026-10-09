/**
 * Etichette italiane dei codici di HOME AI CORE (attribuzioni, tipi di evento,
 * stati di ipotesi e proposte, motivi). Unica fonte per la vista Memoria.
 */

export const ATTRIBUTION_LABEL: Record<string, string> = {
  manual_confirmed: 'Gesto manuale',
  manual_likely: 'Probabilmente manuale',
  automation: 'Automazione esistente',
  system: 'Sensore o sistema',
  unknown: 'Origine incerta',
}

export const EVENT_KIND_LABEL: Record<string, string> = {
  'manual.intent': 'Gesto',
  'manual.result': 'Esito del comando',
  'state.changed': 'Cambio di stato',
  'presence.signal': 'Presenza',
  'forecast.updated': 'Previsione',
  'calendar.updated': 'Calendario',
  'coverage.gap': 'Copertura',
}

export const PATTERN_STATE_LABEL: Record<string, string> = {
  candidate: 'Ipotesi',
  supported: 'Supportata dai dati',
  accepted: 'Salvata come preferenza',
  suppressed: 'Da non suggerire',
  retired: 'Ritirata',
}

export const PROPOSAL_STATE_LABEL: Record<string, string> = {
  candidate: 'In attesa', policy_checked: 'Solo diagnostica', visible: 'Visibile', dismissed: 'Chiusa', snoozed: 'Rimandata',
  preference_saved: 'Preferenza salvata', simulation_authorized: 'Simulazione autorizzata', simulated: 'Simulata',
  simulation_failed: 'Simulazione fallita', expired: 'Scaduta', superseded: 'Sostituita', withdrawn: 'Ritirata',
}

const REASON_LABEL: Record<string, string> = {
  COLD_START: 'periodo di osservazione troppo breve',
  FEW_OPPORTUNITIES: 'pochi rientri osservabili',
  FEW_SUCCESSES: 'poche ripetizioni',
  FEW_DISTINCT_DAYS: 'pochi giorni diversi',
  LOW_COVERAGE: 'copertura dei dati insufficiente',
  LOW_FREQUENCY: 'frequenza sotto soglia',
  LOW_WILSON: 'campione ancora piccolo',
  NO_CONTEXT_ADVANTAGE: 'succede anche fuori da questo contesto',
  TEMPORAL_VALIDATION_FAILED: 'non confermata nei rientri recenti',
  TEMPORAL_VALIDATION_PASSED: 'confermata nei rientri recenti',
  NOT_YET_VERIFIED_IN_TIME: 'ipotesi non ancora verificata nel tempo',
  THRESHOLDS_MET: 'soglie superate',
  DECAYED: 'abitudine in calo',
  NO_LONGER_OBSERVED: 'non più osservata',
  USER_SUPPRESSED: 'esclusa da te',
  USER_ACCEPTED: 'salvata da te',
  MODE_SHADOW: 'modalità in ombra: solo diagnostica',
  MODE_OBSERVE: 'modalità sola osservazione',
  QUIET_HOURS: 'fascia di quiete',
  ATTENTION_BUDGET_EXHAUSTED: 'limite giornaliero di suggerimenti raggiunto',
  TOPIC_COOLDOWN: 'stesso tema proposto da poco',
  NEVER_SUGGEST: 'hai chiesto di non suggerirlo più',
  GUEST_MODE: 'modalità ospiti attiva',
  LEARNING_CONSENT_MISSING: 'apprendimento non consentito',
  STALE_OR_MISSING_DATA: 'dati obsoleti o mancanti',
  REMINDER_ALLOWED: 'promemoria ammesso',
  SUGGESTION_ALLOWED: 'suggerimento ammesso',
}

/** Verbo del passo (`desired.action`, dal registro chiuso delle chiavi semantiche) in italiano. */
const STEP_VERB: Record<string, string> = {
  on: 'Accendi', off: 'Spegni', toggle: 'Cambia stato', play: 'Riproduci', pause: 'Metti in pausa', stop: 'Ferma',
  mode: 'Modalità', temperature: 'Temperatura', preset: 'Preset', target: 'Obiettivo', speed: 'Velocità', volume: 'Volume',
  open: 'Apri', close: 'Chiudi', position: 'Posizione', activate: 'Attiva', run: 'Avvia', start: 'Avvia', dock: 'Alla base',
}

export function stepVerb(action: unknown): string {
  const key = String(action ?? '')
  return STEP_VERB[key] ?? key.replace(/_/g, ' ')
}

/** Chiave semantica di un gesto (`lighting.on`, `media.play`…) come verbo italiano. */
export function actionLabel(actionKey: string): string {
  return stepVerb(actionKey.split('.').pop())
}

export function reasonText(code: string): string {
  return REASON_LABEL[code] ?? code.toLowerCase().replace(/_/g, ' ')
}

export function formatWhen(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', ...opts }).format(new Date(iso))
}

/** Data civile `YYYY-MM-DD` in italiano, senza passare da UTC (nessuno slittamento di giorno). */
export function formatLocalDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}
