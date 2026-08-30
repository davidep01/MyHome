import { describe, expect, it } from 'vitest'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { findAddonUpdateEntity } from './addonUpdate'

function update(entity_id: string, state: string, attributes: Record<string, unknown>): HassEntity {
  return { entity_id, state, attributes, last_changed: '', last_updated: '', context: { id: 'x', parent_id: null, user_id: null } }
}

const ours = update('update.myhome_dashboard_update', 'off', {
  entity_picture: '/api/hassio/addons/8ef25655_myhome_dashboard/icon',
  installed_version: '2.2.105',
  latest_version: '2.2.105',
  auto_update: true,
  in_progress: false,
})

const other = update('update.frigate_full_access_update', 'on', {
  entity_picture: '/api/hassio/addons/ccab4aaf_frigate-fa/icon',
  installed_version: '1.0',
  latest_version: '1.1',
})

function map(...items: HassEntity[]): HassEntities {
  return Object.fromEntries(items.map((i) => [i.entity_id, i]))
}

describe('entità di aggiornamento dell add-on', () => {
  it('riconosce il nostro add-on dallo slug, non dal titolo', () => {
    // Il titolo è personalizzabile: qui è cambiato, lo slug no.
    const renamed = update('update.la_mia_casa_update', 'on', {
      entity_picture: '/api/hassio/addons/8ef25655_myhome_dashboard/icon',
      installed_version: '2.2.105',
      latest_version: '2.2.107',
      auto_update: false,
    })
    expect(findAddonUpdateEntity(map(other, renamed))).toEqual({
      entityId: 'update.la_mia_casa_update',
      installedVersion: '2.2.105',
      latestVersion: '2.2.107',
      updateAvailable: true,
      inProgress: false,
      autoUpdate: false,
    })
  })

  it('non confonde gli aggiornamenti degli altri add-on', () => {
    expect(findAddonUpdateEntity(map(other))).toBeNull()
  })

  it('legge stato, versioni e auto-update quando è allineato', () => {
    expect(findAddonUpdateEntity(map(ours, other))).toMatchObject({
      entityId: 'update.myhome_dashboard_update',
      updateAvailable: false,
      autoUpdate: true,
      installedVersion: '2.2.105',
    })
  })

  it('restituisce null se HA non espone alcuna entità update', () => {
    expect(findAddonUpdateEntity({} as HassEntities)).toBeNull()
  })
})
