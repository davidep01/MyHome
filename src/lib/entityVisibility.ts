import type { DeviceOverride } from '../api/backend'

/**
 * Visibilità delle entità sulle superfici utente — modello **opt-in**.
 *
 * Una casa collegata a Home Assistant espone centinaia di entità (qui 246) e
 * nessuna dashboard sensata le mostra tutte: la vecchia regola "mostra tutto
 * tranne ciò che nascondi" scaricava sull'utente il lavoro di nascondere a
 * mano il rumore, per sempre. Ora una entità compare **solo** se è stata
 * scelta esplicitamente nel wizard di configurazione.
 *
 * Unica eccezione, deliberata: la sicurezza non dipende dalla configurazione
 * (vedi `composeHome`) — un allarme che scatta si vede anche se il dispositivo
 * non è mai stato configurato.
 */
export function isConfiguredEntity(
  entityId: string,
  overrides?: Record<string, DeviceOverride>,
): boolean {
  return overrides?.[entityId]?.enabled === true
}

/** Le card video vivono solo nella tendina videocamere, mai fra le card. */
export function isCameraEntity(entityId: string): boolean {
  return entityId.startsWith('camera.')
}

/** Entità che può diventare una card nelle superfici utente. */
export function isDashboardCardEntity(
  entityId: string,
  overrides?: Record<string, DeviceOverride>,
): boolean {
  return isConfiguredEntity(entityId, overrides) && !isCameraEntity(entityId)
}
