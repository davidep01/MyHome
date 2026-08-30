import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'

/**
 * Aggiornamento dell'add-on dalla regia.
 *
 * Home Assistant crea un'entità `update.*` per ogni add-on. Quella di MyHome si
 * riconosce dal **suo slug** nell'`entity_picture` (`/api/hassio/addons/<hash>_
 * <slug>/icon`): il titolo dell'add-on è personalizzabile e il nome dell'entità
 * cambia con esso, lo slug no.
 *
 * Perché serve un pulsante: l'auto-update dell'add-on può essere già attivo e
 * l'aggiornamento non arrivare comunque, perché il Supervisor non ha ancora
 * riletto il repository — `latest_version` resta uguale a `installed_version`.
 * Il ricontrollo esplicito (`homeassistant.update_entity`) è il passo che
 * mancava; l'installazione viene dopo, solo se c'è davvero qualcosa di nuovo.
 */

const ADDON_SLUG = 'myhome_dashboard'

export interface AddonUpdateInfo {
  entityId: string
  installedVersion?: string
  latestVersion?: string
  /** HA segnala un aggiornamento disponibile. */
  updateAvailable: boolean
  inProgress: boolean
  autoUpdate: boolean
}

function matchesAddon(entity: HassEntity): boolean {
  if (!entity.entity_id.startsWith('update.')) return false
  const picture = String(entity.attributes?.entity_picture ?? '')
  return picture.includes(ADDON_SLUG)
}

/** L'entità di aggiornamento del nostro add-on, se questo HA la espone. */
export function findAddonUpdateEntity(entities: HassEntities): AddonUpdateInfo | null {
  const entity = Object.values(entities).find(matchesAddon)
  if (!entity) return null
  const installed = entity.attributes?.installed_version
  const latest = entity.attributes?.latest_version
  return {
    entityId: entity.entity_id,
    installedVersion: typeof installed === 'string' ? installed : undefined,
    latestVersion: typeof latest === 'string' ? latest : undefined,
    updateAvailable: entity.state === 'on',
    inProgress: entity.attributes?.in_progress === true,
    autoUpdate: entity.attributes?.auto_update === true,
  }
}
