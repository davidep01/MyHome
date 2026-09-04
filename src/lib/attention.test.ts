import { describe, expect, it } from 'vitest'
import { buildAttentionItems } from './attention'
import type { CriticalAlert } from './criticalAlerts'
import type { OfflineReport } from './offlineDevices'
import type { HANotification } from '../hooks/useNotifications'

const EMPTY_OFFLINE: OfflineReport = { integrations: [], deviceCount: 0, backgroundCount: 0 }

function alert(overrides: Partial<CriticalAlert> = {}): CriticalAlert {
  return {
    id: 'a1', entityId: 'binary_sensor.fumo', kind: 'smoke',
    title: 'Fumo rilevato', detail: '', instruction: '',
    priority: 0, changedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function battery(overrides: Partial<HANotification> = {}): HANotification {
  return {
    id: 'battery-sensor.porta', type: 'battery', title: 'Porta — batteria bassa',
    message: '15% rimanente', entityId: 'sensor.porta_battery', severity: 'warning',
    ...overrides,
  }
}

describe('buildAttentionItems', () => {
  it('classifies smoke/gas/water/heat/safety as category safety, non-suppressible', () => {
    const [item] = buildAttentionItems({
      criticalAlerts: [alert({ kind: 'smoke' })], offline: EMPTY_OFFLINE, batteryNotifications: [], systemProblems: [],
    })
    expect(item.category).toBe('safety')
    expect(item.severity).toBe('critical')
    expect(item.suppressible).toBe(false)
  })

  it('classifies intrusion/siren as category security, non-suppressible', () => {
    const [item] = buildAttentionItems({
      criticalAlerts: [alert({ kind: 'intrusion' })], offline: EMPTY_OFFLINE, batteryNotifications: [], systemProblems: [],
    })
    expect(item.category).toBe('security')
    expect(item.suppressible).toBe(false)
  })

  it('summarizes offline devices into one suppressible availability item', () => {
    const offline: OfflineReport = {
      deviceCount: 3,
      backgroundCount: 5,
      integrations: [
        { platform: 'sonoff', entries: [{ entityId: 'switch.a', name: 'A', platform: 'sonoff' }, { entityId: 'switch.b', name: 'B', platform: 'sonoff' }] },
        { platform: 'zigbee', entries: [{ entityId: 'light.c', name: 'C', platform: 'zigbee' }] },
      ],
    }
    const [item] = buildAttentionItems({ criticalAlerts: [], offline, batteryNotifications: [], systemProblems: [] })
    expect(item.category).toBe('availability')
    expect(item.severity).toBe('warning')
    expect(item.suppressible).toBe(true)
    expect(item.text).toBe('3 dispositivi offline in 2 integrazioni')
    expect(item.fingerprint).toBe('light.c,switch.a,switch.b')
  })

  it('uses singular phrasing for a single offline device in one integration', () => {
    const offline: OfflineReport = { deviceCount: 1, backgroundCount: 0, integrations: [{ platform: 'sonoff', entries: [{ entityId: 'switch.a', name: 'A', platform: 'sonoff' }] }] }
    const [item] = buildAttentionItems({ criticalAlerts: [], offline, batteryNotifications: [], systemProblems: [] })
    expect(item.text).toBe('1 dispositivo offline')
  })

  it('produces no availability item when nothing is offline', () => {
    const items = buildAttentionItems({ criticalAlerts: [], offline: EMPTY_OFFLINE, batteryNotifications: [], systemProblems: [] })
    expect(items).toHaveLength(0)
  })

  it('maps battery notifications to a suppressible battery category, preserving severity', () => {
    const [warn] = buildAttentionItems({ criticalAlerts: [], offline: EMPTY_OFFLINE, batteryNotifications: [battery({ severity: 'warning' })], systemProblems: [] })
    expect(warn).toMatchObject({ category: 'battery', severity: 'warning', suppressible: true })
    const [critical] = buildAttentionItems({ criticalAlerts: [], offline: EMPTY_OFFLINE, batteryNotifications: [battery({ severity: 'critical' })], systemProblems: [] })
    expect(critical.severity).toBe('critical')
  })

  it('maps system problems to configuration, danger to critical and warn to warning', () => {
    const items = buildAttentionItems({
      criticalAlerts: [], offline: EMPTY_OFFLINE, batteryNotifications: [],
      systemProblems: [
        { id: 'ha', severity: 'danger', text: 'HA non raggiungibile', actionTarget: 'system' },
        { id: 'weather', severity: 'warn', text: 'Chiave meteo assente' },
      ],
    })
    expect(items.find((i) => i.id === 'configuration-ha')).toMatchObject({ severity: 'critical', actionTarget: 'system' })
    expect(items.find((i) => i.id === 'configuration-weather')).toMatchObject({ severity: 'warning', actionTarget: undefined })
  })

  it('sorts critical before warning before info, then by category', () => {
    const items = buildAttentionItems({
      criticalAlerts: [alert({ kind: 'smoke' })],
      offline: { deviceCount: 1, backgroundCount: 0, integrations: [{ platform: 'x', entries: [{ entityId: 'a', name: 'A', platform: 'x' }] }] },
      batteryNotifications: [battery({ severity: 'critical' })],
      systemProblems: [{ id: 'weather', severity: 'warn', text: 'Meteo assente' }],
    })
    expect(items.map((i) => i.category)).toEqual(['safety', 'battery', 'availability', 'configuration'])
  })
})
