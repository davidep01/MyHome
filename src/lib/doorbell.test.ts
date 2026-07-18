import { describe, expect, it } from 'vitest'
import type { DoorbellDevice } from '../api/backend'
import { cameraDoorbellShortcuts } from './doorbell'

describe('camera doorbell actions', () => {
  const action = { id: 'gate', label: 'Cancello', entityId: 'switch.cancello' }
  const doorbells: DoorbellDevice[] = [
    { id: 'front', name: 'Entrata', entityId: 'event.front', cameraEntityId: 'camera.front', shortcuts: [action] },
    { id: 'garden', name: 'Giardino', entityId: 'event.garden', cameraEntityId: 'camera.garden', shortcuts: [{ ...action }] },
  ]

  it('returns only actions configured for the requested camera', () => {
    expect(cameraDoorbellShortcuts(doorbells, 'camera.front')).toEqual([action])
    expect(cameraDoorbellShortcuts(doorbells, 'camera.unknown')).toEqual([])
  })

  it('ignores disabled doorbells and removes duplicate action ids', () => {
    expect(cameraDoorbellShortcuts([
      ...doorbells,
      { ...doorbells[0], id: 'front-copy' },
      { ...doorbells[0], id: 'disabled', active: false },
    ], 'camera.front')).toEqual([action])
  })
})
