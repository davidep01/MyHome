import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import type { AIContextEntity } from '../api/ai'
import { dateKeyForLocalDate, isWasteCollectionSensor, wastePickups } from './wasteCollection'

export interface ScreensaverRecapInput {
  context: AIContextEntity[]
  localText: string
  signature: string
}

export interface ScreensaverRecentChange {
  entityId: string
  name: string
  description: string
  changedAt: number
}

const SECURITY_BINARY_CLASSES = new Set([
  'carbon_monoxide', 'door', 'garage_door', 'gas', 'heat', 'moisture',
  'opening', 'problem', 'safety', 'smoke', 'tamper', 'window',
])
const ACTIVE_STATES = new Set(['on', 'open', 'opening', 'closing', 'playing', 'cleaning', 'mowing', 'triggered'])
const MAX_DETAIL_ENTITIES = 36
const MAX_SELECTED_DETAIL_ENTITIES = 100
const MAX_RECENT_CHANGES = 6
const RECENT_CHANGE_MAX_AGE_MS = 10 * 60_000
const LIVE_SENSOR_CLASSES = new Set(['temperature', 'humidity', 'carbon_dioxide', 'aqi', 'pm25', 'volatile_organic_compounds'])
const RECAP_DEVICE_DOMAINS = new Set([
  'alarm_control_panel', 'binary_sensor', 'climate', 'cover', 'fan', 'humidifier',
  'lawn_mower', 'light', 'lock', 'media_player', 'person', 'sensor', 'siren',
  'switch', 'vacuum', 'valve', 'water_heater',
])

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

function localizedNumber(value: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(value)
}

function numericState(entity: HassEntity): number | null {
  const value = Number(entity.state)
  return Number.isFinite(value) ? value : null
}

function sensorReading(entity: HassEntity): string {
  const value = numericState(entity)
  if (value === null) return clean(entity.state, 'sconosciuto', 80)
  const unit = clean(entity.attributes?.unit_of_measurement, '', 16)
  return `${localizedNumber(value)}${unit ? ` ${unit}` : ''}`
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
  if (domain === 'sensor' && LIVE_SENSOR_CLASSES.has(String(entity.attributes?.device_class ?? ''))) {
    return sensorReading(entity)
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
  if (domain === 'climate' && state !== 'unavailable'
    && (state !== 'off' || Number.isFinite(Number(entity.attributes?.current_temperature)))) return 3
  if (domain === 'media_player' && state === 'playing') return 3
  if (domain === 'light' && state === 'on') return 4
  if ((domain === 'vacuum' || domain === 'lawn_mower') && ACTIVE_STATES.has(state)) return 4
  if (domain === 'persistent_notification' && state !== 'dismissed') return 2
  if (isWasteCollectionSensor(entity)) return 3
  if (domain === 'sensor' && LIVE_SENSOR_CLASSES.has(deviceClass) && state !== 'unknown' && state !== 'unavailable') return 3
  if (domain === 'binary_sensor' && state === 'on' && ['motion', 'occupancy', 'presence'].includes(deviceClass)) return 3
  if (domain === 'switch' && state === 'on') return 4
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

/** Devices useful for a home-status recap; diagnostics and action-only entities stay out. */
export function isScreensaverRecapCandidate(entity: HassEntity): boolean {
  if (entity.attributes?.entity_category === 'diagnostic') return false
  return RECAP_DEVICE_DOMAINS.has(entity.entity_id.split('.')[0]) || isWasteCollectionSensor(entity)
}

export function filterScreensaverRecapEntities(
  entities: HassEntities,
  selectedEntityIds?: readonly string[],
): HassEntities {
  if (selectedEntityIds === undefined) return entities
  const selected = new Set(selectedEntityIds)
  return Object.fromEntries(Object.entries(entities).filter(([entityId]) => selected.has(entityId)))
}

function changeDescription(previous: HassEntity, current: HassEntity): string | null {
  const domain = current.entity_id.split('.')[0]
  const deviceClass = String(current.attributes?.device_class ?? '')
  const name = nameOf(current)

  if (domain === 'light') {
    if (previous.state !== current.state) return `${name} ${current.state === 'on' ? 'si è accesa' : 'si è spenta'}`
    const before = percentBrightness(previous)
    const now = percentBrightness(current)
    if (now !== null && before !== now) return `${name} è al ${now}% di luminosità`
    return null
  }

  if (domain === 'sensor' && LIVE_SENSOR_CLASSES.has(deviceClass)) {
    const before = numericState(previous)
    const now = numericState(current)
    if (before === null || now === null) return previous.state === current.state ? null : `${name}: ${sensorReading(current)}`
    const threshold = deviceClass === 'temperature' ? 0.2 : deviceClass === 'humidity' ? 1 : 5
    return Math.abs(now - before) >= threshold ? `${name}: ${sensorReading(current)}` : null
  }

  if (domain === 'climate') {
    const before = Number(previous.attributes?.current_temperature)
    const now = Number(current.attributes?.current_temperature)
    if (Number.isFinite(now) && (!Number.isFinite(before) || Math.abs(now - before) >= 0.2)) {
      return `${name}: temperatura ${localizedNumber(now)} °C`
    }
    if (previous.state !== current.state) return `${name}: clima ${clean(current.state, 'aggiornato', 40)}`
    const beforeTarget = Number(previous.attributes?.temperature)
    const target = Number(current.attributes?.temperature)
    if (Number.isFinite(target) && beforeTarget !== target) return `${name}: obiettivo ${localizedNumber(target)} °C`
    return null
  }

  if (domain === 'binary_sensor') {
    if (previous.state === current.state) return null
    if (['door', 'garage_door', 'opening', 'window'].includes(deviceClass)) {
      return `${name} ${current.state === 'on' ? 'si è aperta' : 'si è chiusa'}`
    }
    if (['motion', 'occupancy', 'presence'].includes(deviceClass)) {
      return `${name}: ${current.state === 'on' ? 'movimento rilevato' : 'movimento terminato'}`
    }
    if (SECURITY_BINARY_CLASSES.has(deviceClass)) return `${name}: ${clean(current.state, 'aggiornato', 40)}`
    return null
  }

  if (domain === 'media_player' && previous.state !== current.state) {
    if (current.state === 'playing') return `${name} ha avviato la riproduzione`
    if (previous.state === 'playing') return `${name} ha interrotto la riproduzione`
  }
  if (domain === 'cover' && previous.state !== current.state) return `${name}: ${clean(current.state, 'aggiornata', 40)}`
  if (domain === 'lock' && previous.state !== current.state) return `${name}: ${current.state === 'locked' ? 'chiusa' : 'aperta'}`
  if (domain === 'alarm_control_panel' && previous.state !== current.state) return `${name}: ${clean(current.state, 'aggiornato', 40)}`
  if (domain === 'switch' && previous.state !== current.state) return `${name} ${current.state === 'on' ? 'attivato' : 'disattivato'}`
  return null
}

export function collectScreensaverRecentChanges(
  previous: HassEntities,
  current: HassEntities,
  changedAt = Date.now(),
): ScreensaverRecentChange[] {
  const changes: ScreensaverRecentChange[] = []
  for (const entity of Object.values(current)) {
    const before = previous[entity.entity_id]
    if (!before || before === entity) continue
    const description = changeDescription(before, entity)
    if (!description) continue
    changes.push({ entityId: entity.entity_id, name: nameOf(entity), description, changedAt })
  }
  return changes.slice(-MAX_RECENT_CHANGES)
}

export function buildScreensaverRecapInput(
  entities: HassEntities,
  now = new Date(),
  recentChanges: ScreensaverRecentChange[] = [],
  selectedEntityIds?: readonly string[],
): ScreensaverRecapInput {
  const scopedEntities = filterScreensaverRecapEntities(entities, selectedEntityIds)
  const all = Object.values(scopedEntities)
  if (all.length === 0) {
    return selectedEntityIds !== undefined
      ? { context: [], localText: 'Nessun dispositivo selezionato per il recap AI.', signature: 'empty-selection' }
      : { context: [], localText: 'In attesa degli ultimi aggiornamenti della casa.', signature: 'empty' }
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
  const recent = recentChanges
    .filter((change) => now.getTime() - change.changedAt <= RECENT_CHANGE_MAX_AGE_MS)
    .sort((left, right) => right.changedAt - left.changedAt)
    .slice(0, MAX_RECENT_CHANGES)

  const aggregate: AIContextEntity[] = [
    { entity_id: 'sensor.recap_luci_accese', name: 'Luci accese', state: String(lightsOn.length) },
    { entity_id: 'sensor.recap_clima_attivo', name: 'Zone clima attive', state: String(climateActive.length) },
    { entity_id: 'sensor.recap_media_in_riproduzione', name: 'Media in riproduzione', state: String(mediaPlaying.length) },
    { entity_id: 'sensor.recap_aperture_aperte', name: 'Aperture aperte', state: String(openings.length) },
    { entity_id: 'sensor.recap_dispositivi_non_disponibili', name: 'Dispositivi non disponibili', state: String(unavailable.length) },
  ]

  const details = all
    .map((entity) => ({ entity, priority: priorityOf(entity) ?? (selectedEntityIds !== undefined ? 5 : null) }))
    .filter((entry): entry is { entity: HassEntity; priority: number } => entry.priority !== null)
    .sort((left, right) => left.priority - right.priority || changedAt(right.entity) - changedAt(left.entity))
    .slice(0, selectedEntityIds !== undefined ? MAX_SELECTED_DETAIL_ENTITIES : MAX_DETAIL_ENTITIES)
    .map(({ entity }) => ({
      entity_id: entity.entity_id,
      name: nameOf(entity),
      state: informativeState(entity, todayKey),
    }))
    .filter((entry) => entry.state.length > 0)

  const eventContext: AIContextEntity[] = recent.map((change, index) => ({
    entity_id: `sensor.recap_evento_${index + 1}`,
    name: `Evento recente: ${change.name}`,
    state: change.description,
  }))
  const context = [...aggregate, ...details, ...eventContext]
  const localParts: string[] = []
  if (critical.length > 0) {
    localParts.push(`Attenzione: ${critical.slice(0, 2).map(nameOf).join(' e ')} ${critical.length === 1 ? 'richiede' : 'richiedono'} controllo.`)
  } else if (recent.length > 0) {
    localParts.push(`Adesso: ${recent[0].description}.`)
  } else if (openings.length > 0) {
    localParts.push(`${countText(openings.length, 'apertura risulta aperta', 'aperture risultano aperte')}.`)
  } else {
    localParts.push('La casa risulta tranquilla e senza avvisi urgenti.')
  }

  const activity: string[] = []
  if (lightsOn.length > 0) {
    const names = lightsOn.slice(0, 3).map(nameOf)
    activity.push(lightsOn.length <= 3
      ? `${countText(lightsOn.length, 'luce accesa', 'luci accese')}: ${names.join(', ')}`
      : countText(lightsOn.length, 'luce accesa', 'luci accese'))
  }
  if (climateActive.length > 0) activity.push(countText(climateActive.length, 'zona clima attiva', 'zone clima attive'))
  if (mediaPlaying.length > 0) activity.push(countText(mediaPlaying.length, 'riproduzione in corso', 'riproduzioni in corso'))
  if (activity.length > 0) localParts.push(`${activity.join(' · ')}.`)
  else if (unavailable.length > 0) localParts.push(countText(unavailable.length, 'dispositivo non disponibile.', 'dispositivi non disponibili.'))

  const temperatures = all
    .filter((entity) => (entity.entity_id.startsWith('sensor.') && entity.attributes?.device_class === 'temperature')
      || (entity.entity_id.startsWith('climate.') && Number.isFinite(Number(entity.attributes?.current_temperature))))
    .sort((left, right) => changedAt(right) - changedAt(left))
    .slice(0, 3)
    .map((entity) => entity.entity_id.startsWith('climate.')
      ? `${nameOf(entity)} ${localizedNumber(Number(entity.attributes?.current_temperature))} °C`
      : `${nameOf(entity)} ${sensorReading(entity)}`)
  if (temperatures.length > 0) localParts.push(`Temperature: ${temperatures.join(' · ')}.`)

  return {
    context,
    localText: localParts.join(' '),
    signature: signatureOf(context),
  }
}
