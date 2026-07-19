import { describe, expect, it } from 'vitest'
import type { HANotification } from '../hooks/useNotifications'
import { selectNewLiveNotification } from './liveNotification'

const offline: HANotification = {
  id: 'offline-light.sala',
  type: 'offline',
  title: 'Luce sala offline',
  entityId: 'light.sala',
  severity: 'warning',
}

describe('live notification selection', () => {
  it('announces a new offline event only once per kiosk session', () => {
    expect(selectNewLiveNotification([offline], new Set(), new Set())).toEqual(offline)
    expect(selectNewLiveNotification([offline], new Set(), new Set([offline.id]))).toBeUndefined()
  })

  it('still announces other genuinely new events', () => {
    const safety: HANotification = { ...offline, id: 'safety-smoke', type: 'safety', severity: 'critical' }
    expect(selectNewLiveNotification([safety, offline], new Set([offline.id]), new Set())).toEqual(safety)
  })
})
