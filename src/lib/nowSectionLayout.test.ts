import { describe, expect, it } from 'vitest'
import type { HeroSlot } from './composer'
import { groupCameraTrio } from './nowSectionLayout'

function slot(key: string, priority: HeroSlot['priority'] = 4): HeroSlot {
  return { key, entityId: key, priority, reason: 'test' }
}

describe('groupCameraTrio', () => {
  it('groups exactly three cameras into one dedicated row', () => {
    const alarm = slot('alarm_control_panel.casa', 0)
    const cameras = [slot('camera.ingresso'), slot('camera.giardino'), slot('camera.garage')]

    expect(groupCameraTrio([alarm, ...cameras])).toEqual({
      regular: [alarm],
      cameraTrio: cameras,
    })
  })

  it('leaves the composer order untouched with fewer than three cameras', () => {
    const hero = [slot('camera.ingresso'), slot('camera.giardino'), slot('light.cucina')]
    expect(groupCameraTrio(hero)).toEqual({ regular: hero, cameraTrio: [] })
  })

  it('does not force a trio layout when more than three cameras are visible', () => {
    const hero = Array.from({ length: 4 }, (_, index) => slot(`camera.c${index}`))
    expect(groupCameraTrio(hero)).toEqual({ regular: hero, cameraTrio: [] })
  })
})
