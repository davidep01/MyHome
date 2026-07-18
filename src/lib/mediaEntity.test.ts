import { describe, expect, it } from 'vitest'
import { linkedMediaPlayerEntityId } from './mediaEntity'

describe('linked media entity', () => {
  it('maps an Apple TV remote override to its media player', () => {
    expect(linkedMediaPlayerEntityId('remote.soggiorno', 'media')).toBe('media_player.soggiorno')
  })

  it('leaves ordinary remotes and media players unchanged', () => {
    expect(linkedMediaPlayerEntityId('remote.soggiorno', 'button')).toBeNull()
    expect(linkedMediaPlayerEntityId('media_player.soggiorno', 'media')).toBeNull()
  })
})
