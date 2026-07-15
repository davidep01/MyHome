import { describe, expect, it } from 'vitest'
import {
  MAX_SHORTCUTS, resolveShortcutAction, shortcutRequiresHold, visibleShortcuts,
} from './actionShortcuts'

const base = { id: 's1', label: 'Prova' }

describe('resolveShortcutAction', () => {
  it('deriva il servizio dal dominio', () => {
    expect(resolveShortcutAction({ ...base, entityId: 'light.ingresso' })).toEqual({ domain: 'light', service: 'toggle' })
    expect(resolveShortcutAction({ ...base, entityId: 'scene.sera' })).toEqual({ domain: 'scene', service: 'turn_on' })
    expect(resolveShortcutAction({ ...base, entityId: 'cover.cancello' })).toEqual({ domain: 'cover', service: 'open_cover' })
    expect(resolveShortcutAction({ ...base, entityId: 'lock.porta' })).toEqual({ domain: 'lock', service: 'unlock' })
  })

  it('rispetta il servizio esplicito', () => {
    expect(resolveShortcutAction({ ...base, entityId: 'cover.cancello', service: 'close_cover' }))
      .toEqual({ domain: 'cover', service: 'close_cover' })
  })

  it('rifiuta i domini non azionabili', () => {
    expect(resolveShortcutAction({ ...base, entityId: 'sensor.temperatura' })).toBeNull()
    expect(resolveShortcutAction({ ...base, entityId: 'binary_sensor.porta' })).toBeNull()
  })
})

describe('shortcutRequiresHold', () => {
  it('impone la pressione prolungata sui domini critici anche senza confirm', () => {
    expect(shortcutRequiresHold({ ...base, entityId: 'lock.porta' })).toBe(true)
    expect(shortcutRequiresHold({ ...base, entityId: 'cover.cancello', confirm: false })).toBe(true)
    expect(shortcutRequiresHold({ ...base, entityId: 'siren.esterna' })).toBe(true)
  })

  it('rispetta confirm sugli altri domini', () => {
    expect(shortcutRequiresHold({ ...base, entityId: 'light.ingresso' })).toBe(false)
    expect(shortcutRequiresHold({ ...base, entityId: 'light.ingresso', confirm: true })).toBe(true)
    expect(shortcutRequiresHold({ ...base, entityId: 'scene.sera' })).toBe(false)
  })
})

describe('visibleShortcuts', () => {
  it('scarta i non azionabili e limita a MAX_SHORTCUTS', () => {
    const shortcuts = [
      { id: 'a', label: 'A', entityId: 'light.uno' },
      { id: 'b', label: 'B', entityId: 'sensor.rumore' },
      { id: 'c', label: 'C', entityId: 'scene.due' },
      { id: 'd', label: 'D', entityId: 'switch.tre' },
      { id: 'e', label: 'E', entityId: 'cover.quattro' },
      { id: 'f', label: 'F', entityId: 'script.cinque' },
    ]
    const visible = visibleShortcuts(shortcuts)
    expect(visible).toHaveLength(MAX_SHORTCUTS)
    expect(visible.map((s) => s.id)).toEqual(['a', 'c', 'd', 'e'])
  })

  it('gestisce undefined', () => {
    expect(visibleShortcuts(undefined)).toEqual([])
  })
})
