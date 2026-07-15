import type { ActionShortcut } from '../api/backend'

/**
 * Risoluzione delle azioni rapide configurabili (campanello §10.3, emergenza §11).
 * Puro e testabile: dominio → servizio di default, e obbligo di pressione
 * prolungata per le azioni critiche (serrature, cancelli, sirene, allarme),
 * qualunque cosa dica la config — il canone vieta il tap su ciò che apre casa.
 */

export interface ResolvedShortcutAction {
  domain: string
  service: string
}

/** Servizio di default per dominio quando lo shortcut non ne dichiara uno. */
const DEFAULT_SERVICE: Record<string, string> = {
  light: 'toggle',
  switch: 'toggle',
  input_boolean: 'toggle',
  fan: 'toggle',
  siren: 'toggle',
  automation: 'toggle',
  scene: 'turn_on',
  script: 'turn_on',
  cover: 'open_cover',
  valve: 'open_valve',
  lock: 'unlock',
  button: 'press',
  input_button: 'press',
  media_player: 'media_play_pause',
  vacuum: 'start',
}

/** Domini la cui azione apre/espone la casa: sempre hold 900ms, mai tap. */
const HOLD_DOMAINS = new Set(['lock', 'cover', 'valve', 'siren', 'alarm_control_panel'])

export function shortcutDomain(shortcut: Pick<ActionShortcut, 'entityId'>): string {
  return shortcut.entityId.split('.')[0]
}

/**
 * Ritorna l'azione HA da chiamare, o null se il dominio non è azionabile
 * (uno shortcut su un sensore non ha senso e non deve renderizzare nulla).
 */
export function resolveShortcutAction(shortcut: ActionShortcut): ResolvedShortcutAction | null {
  const domain = shortcutDomain(shortcut)
  const service = shortcut.service ?? DEFAULT_SERVICE[domain]
  if (!service) return null
  return { domain, service }
}

/** True quando l'esecuzione richiede pressione prolungata 900ms. */
export function shortcutRequiresHold(shortcut: ActionShortcut): boolean {
  return shortcut.confirm === true || HOLD_DOMAINS.has(shortcutDomain(shortcut))
}

/** Domini proponibili nell'editor degli shortcut (allowlisted e azionabili). */
export const SHORTCUT_DOMAINS = Object.keys(DEFAULT_SERVICE)

/** Al massimo 4 azioni rapide per contesto: il modale resta leggibile a colpo d'occhio. */
export const MAX_SHORTCUTS = 4

/** Filtra e ordina gli shortcut renderizzabili (config difensiva). */
export function visibleShortcuts(shortcuts: ActionShortcut[] | undefined): ActionShortcut[] {
  return (shortcuts ?? [])
    .filter((shortcut) => resolveShortcutAction(shortcut) !== null)
    .slice(0, MAX_SHORTCUTS)
}
