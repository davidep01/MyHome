import { describe, expect, it } from 'vitest'
import {
  isWasteCollectionSensor,
  wasteItemsFromText,
  wastePickupDateLabel,
  wastePickups,
} from './wasteCollection'

describe('Waste Collection Schedule adapter', () => {
  const attributes = {
    '2026-07-20': 'General waste collection',
    '2026-07-21': 'Grass clippings, Napkins, Organic waste',
    '2026-07-22': 'Plastic and metals',
    friendly_name: 'Waste Collection Schedule Rifiuti',
  }

  it('recognizes the HA sensor and sorts upcoming pickups', () => {
    expect(isWasteCollectionSensor({
      entity_id: 'sensor.waste_collection_schedule_rifiuti',
      state: 'General waste collection in 2 days',
      attributes,
    })).toBe(true)

    const pickups = wastePickups(attributes, '2026-07-18')
    expect(pickups.map(({ dateKey, daysUntil }) => ({ dateKey, daysUntil }))).toEqual([
      { dateKey: '2026-07-20', daysUntil: 2 },
      { dateKey: '2026-07-21', daysUntil: 3 },
      { dateKey: '2026-07-22', daysUntil: 4 },
    ])
    expect(wastePickupDateLabel(pickups[0])).toBe('Tra 2 giorni')
  })

  it('translates the collection types exposed by the integration', () => {
    expect(wasteItemsFromText('Grass clippings, Napkins, Organic waste').map((item) => item.label)).toEqual([
      'Pannolini',
      'Organico',
    ])
  })

  it('removes the Grass clipping test event from items and pickups', () => {
    expect(wasteItemsFromText('Grass clipping')).toEqual([])
    expect(wasteItemsFromText('Grass clippings')).toEqual([])
    expect(wastePickups({ '2026-07-18': 'Grass clippings' }, '2026-07-18')).toEqual([])
  })

  it('assigns a distinct icon and the requested collection color to each main material', () => {
    const [plastic, glass, paper, general] = wasteItemsFromText(
      'Plastic and metals, Glass, Paper and cardboard, General waste collection',
    )

    expect({ icon: plastic.icon, background: plastic.background }).toEqual({ icon: 'plastic', background: '#ffd60a' })
    expect({ icon: glass.icon, background: glass.background }).toEqual({ icon: 'glass', background: '#248a3d' })
    expect({ icon: paper.icon, background: paper.background }).toEqual({ icon: 'paper', background: '#ffffff' })
    expect({ icon: general.icon, background: general.background }).toEqual({ icon: 'general', background: '#1d1d1f' })
  })
})
