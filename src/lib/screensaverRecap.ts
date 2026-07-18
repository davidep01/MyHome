import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import type { AIContextEntity } from '../api/ai'
import { dateKeyForLocalDate, isWasteCollectionSensor, wastePickups } from './wasteCollection'

export interface ScreensaverRecapInput {
  context: AIContextEntity[]
  localText: string
  signature: string
}

const SECURITY_BINARY_CLASSES = new Set([
  'carbon_monoxide', 'door', 'garage_door', 'gas', 'heat', 'moisture',
  'opening', 'problem', 'safety', 'smoke', 'tamper', 'window',
])
const ACTIVE_STATES = new Set(['on', 'open', 'opening', 'closing', 'playing', 'cleaning', 'mowing', 'triggered'])
const MAX_DETAIL_ENTITIES = 36

function clean(value: unknown, fallback: string, maxLength = 120): string {
  if (typeof value !== 'string') return fallback
  const normalized = Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .trim()
  return normalized ? normalized.slice(0, maxLength) : fallback
}

function nameOf(entity: HassEntity): string {
  return clean(entity.attributes?.friendly_name, entity.entity_id)
}

function changedAt(entity: HassEntity): number {
  const value = Date.parse(entity.last_changed)
  return Number.isFinite(value) ? value : 0
}

function percentBrightness(entity: HassEntity): number | null {
  const brightness = Number(entity.attributes?.brightness)
  return Number.isFinite(brightness) ? Math.round((brightness / 255) * 100) : null
}

function informativeState(entity: HassEntity, todayKey: string): string {
  const domain = entity.entity_id.split('.')[0]
  if (domain === 'climate') {
    const current = Number(entity.attributes?.current_temperature)
    const target = Number(entity.attributes?.temperature)
    return [entity.state,
      Number.isFinite(current) ? `ambiente ${current} °C` : '',
      Number.isFinite(target) ? `obiettivo ${target} °C` : '',
    ].filter(Boolean).join(' · ')
  }
  if (domain === 'media_player') {
    const title = clean(entity.attributes?.media_title, '', 80)
    return title ? `${entity.state} · ${title}` : entity.state
  }
  if (domain === 'light') {
    const brightness = percentBrightness(entity)
    return brightness === null ? entity.state : `${entity.state} · luminosità ${brightness}%`
  }
  if (isWasteCollectionSensor(entity)) {
    const pickups = wastePickups(entity.attributes, todayKey, 2).filter((pickup) => pickup.daysUntil <= 1)
    return pickups.map((pickup) => `${pickup.daysUntil === 0 ? 'oggi' : 'domani'}: ${pickup.items.map((item) => item.label).join(', ')}`).join(' · ')
  }
  return clean(entity.state, 'sconosciuto', 180)
}

function priorityOf(entity: HassEntity): number | null {
  const [domain] = entity.entity_id.split('.')
  const state = entity.state
  const deviceClass = String(entity.attributes?.device_class ?? '')
  if (domain === 'alarm_control_panel' || domain === 'siren') return 0
  if (domain === 'binary_sensor' && state === 'on' && SECURITY_BINARY_CLASSES.has(deviceClass)) return 0
  if (domain === 'lock' && state !== 'locked' && state !== 'unavailable') return 1
  if (domain === 'cover' && state !== 'closed' && state !== 'unavailable') return 1
  if (domain === 'person') return 2
  if (domain === 'climate' && state !== 'off' && state !== 'unavailable') return 3
  if (domain === 'media_player' && state === 'playing') return 3
  if (domain === 'light' && state === 'on') return 4
  if ((domain === 'vacuum' || domain === 'lawn_mower') && ACTIVE_STATES.has(state)) return 4
  if (domain === 'persistent_notification' && state !== 'dismissed') return 2
  if (isWasteCollectionSensor(entity)) return 3
  return null
}

function countText(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function signatureOf(context: AIContextEntity[]): string {
  const value = JSON.stringify(context)
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function buildScreensaverRecapInput(
  entities: HassEntities,
  now = new Date(),
): ScreensaverRecapInput {
  const all = Object.values(entities)
  if (all.length === 0) {
    return { context: [], localText: 'In attesa degli ultimi aggiornamenti della casa.', signature: 'empty' }
  }

  const todayKey = dateKeyForLocalDate(now)
  const lightsOn = all.filter((entity) => entity.entity_id.startsWith('light.') && entity.state === 'on')
  const climateActive = all.filter((entity) => entity.entity_id.startsWith('climate.') && entity.state !== 'off' && entity.state !== 'unavailable')
  const mediaPlaying = all.filter((entity) => entity.entity_id.startsWith('media_player.') && entity.state === 'playing')
  const unavailable = all.filter((entity) => entity.state === 'unavailable' && entity.attributes?.entity_category !== 'diagnostic')
  const openings = all.filter((entity) => {
    const deviceClass = String(entity.attributes?.device_class ?? '')
    return entity.entity_id.startsWith('binary_sensor.') && entity.state === 'on' && ['door', 'garage_door', 'opening', 'window'].includes(deviceClass)
  })
  const critical = all.filter((entity) => {
    const deviceClass = String(entity.attributes?.device_class ?? '')
    return (entity.entity_id.startsWith('alarm_control_panel.') && entity.state === 'triggered')
      || (entity.entity_id.startsWith('siren.') && entity.state === 'on')
      || (entity.entity_id.startsWith('binary_sensor.') && entity.state === 'on'
        && ['carbon_monoxide', 'gas', 'heat', 'moisture', 'problem', 'safety', 'smoke'].includes(deviceClass))
  })

  const aggregate: AIContextEntity[] = [
    { entity_id: 'sensor.recap_luci_accese', name: 'Luci accese', state: String(lightsOn.length) },
    { entity_id: 'sensor.recap_clima_attivo', name: 'Zone clima attive', state: String(climateActive.length) },
    { entity_id: 'sensor.recap_media_in_riproduzione', name: 'Media in riproduzione', state: String(mediaPlaying.length) },
    { entity_id: 'sensor.recap_aperture_aperte', name: 'Aperture aperte', state: String(openings.length) },
    { entity_id: 'sensor.recap_dispositivi_non_disponibili', name: 'Dispositivi non disponibili', state: String(unavailable.length) },
  ]

  const details = all
    .map((entity) => ({ entity, priority: priorityOf(entity) }))
    .filter((entry): entry is { entity: HassEntity; priority: number } => entry.priority !== null)
    .sort((left, right) => left.priority - right.priority || changedAt(right.entity) - changedAt(left.entity))
    .slice(0, MAX_DETAIL_ENTITIES)
    .map(({ entity }) => ({
      entity_id: entity.entity_id,
      name: nameOf(entity),
      state: informativeState(entity, todayKey),
    }))
    .filter((entry) => entry.state.length > 0)

  const context = [...aggregate, ...details]
  const localParts: string[] = []
  if (critical.length > 0) {
    localParts.push(`Attenzione: ${critical.slice(0, 2).map(nameOf).join(' e ')} ${critical.length === 1 ? 'richiede' : 'richiedono'} controllo.`)
  } else if (openings.length > 0) {
    localParts.push(`${countText(openings.length, 'apertura risulta aperta', 'aperture risultano aperte')}.`)
  } else {
    localParts.push('La casa risulta tranquilla e senza avvisi urgenti.')
  }

  const activity: string[] = []
  if (lightsOn.length > 0) activity.push(countText(lightsOn.length, 'luce accesa', 'luci accese'))
  if (climateActive.length > 0) activity.push(countText(climateActive.length, 'zona clima attiva', 'zone clima attive'))
  if (mediaPlaying.length > 0) activity.push(countText(mediaPlaying.length, 'riproduzione in corso', 'riproduzioni in corso'))
  if (activity.length > 0) localParts.push(`${activity.join(' · ')}.`)
  else if (unavailable.length > 0) localParts.push(countText(unavailable.length, 'dispositivo non disponibile.', 'dispositivi non disponibili.'))

  return {
    context,
    localText: localParts.join(' '),
    signature: signatureOf(context),
  }
}
