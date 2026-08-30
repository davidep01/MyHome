import { describe, expect, it } from 'vitest'
import { isCameraEntity, isConfiguredEntity, isDashboardCardEntity } from './entityVisibility'

describe('visibilità opt-in', () => {
  it('mostra solo ciò che è stato configurato esplicitamente', () => {
    const overrides = { 'light.sala': { enabled: true }, 'light.bagno': { enabled: false } }
    expect(isConfiguredEntity('light.sala', overrides)).toBe(true)
    expect(isConfiguredEntity('light.bagno', overrides)).toBe(false)
    // Mai configurata: invisibile, non "visibile finché non la nascondi".
    expect(isConfiguredEntity('light.ignota', overrides)).toBe(false)
    expect(isConfiguredEntity('light.ignota', undefined)).toBe(false)
  })

  it('non considera configurata un entità con altre preferenze ma senza enabled', () => {
    expect(isConfiguredEntity('light.sala', { 'light.sala': { cardSize: 'L' } })).toBe(false)
  })

  it('tiene le videocamere fuori dalle card anche se configurate', () => {
    const overrides = { 'camera.entrata': { enabled: true }, 'light.sala': { enabled: true } }
    expect(isCameraEntity('camera.entrata')).toBe(true)
    expect(isDashboardCardEntity('camera.entrata', overrides)).toBe(false)
    expect(isDashboardCardEntity('light.sala', overrides)).toBe(true)
  })
})
