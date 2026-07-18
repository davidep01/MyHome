import type { EntityType } from '../api/backend'

/**
 * A Home Assistant Apple TV exposes controls/artwork on `media_player.*` and
 * navigation on the matching `remote.*`. Existing dashboards may still point
 * their Apple TV card at the remote, so transparently select its media peer.
 */
export function linkedMediaPlayerEntityId(entityId: string, type?: EntityType | string): string | null {
  const match = /^remote\.([a-z0-9_]+)$/.exec(entityId)
  return type === 'media' && match ? `media_player.${match[1]}` : null
}
