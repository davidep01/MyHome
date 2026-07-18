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
      'Sfalci e potature',
      'Pannolini',
      'Organico',
    ])
  })
})
