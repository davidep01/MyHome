import type { HassEntity } from 'home-assistant-js-websocket'
import {
  Battery, CircleArrowUp, Gauge, Home, ListChecks, Siren,
  Timer, ToggleRight, UserRound, Wifi,
} from 'lucide-react'
import {
  AnimBell, AnimBlinds, AnimBlindsMoving, AnimBot, AnimCamera, AnimCloudSun,
  AnimDroplet, AnimEqualizer, AnimFan, AnimFlame, AnimLightbulb, AnimLock,
  AnimMist, AnimPower, AnimRadar, AnimShield, AnimSnowflake, AnimSparkles,
  AnimSpeaker, AnimThermometer, AnimTv, AnimWind, AnimZap,
} from '../../icons/animated'
import type { ElementType } from 'react'
import type { EntityType, RoomEntity } from '../../../api/backend'
import { DOMAIN_TYPE } from '../../../hooks/useDiscoveredEntities'
import { airQualityTone, batteryTone, securityTone, temperatureTone, widgetTones } from './getRingColorScale'
import { numericState } from './formatWidgetValue'
import { stateLabel } from './stateLabel'
import type { WidgetCardStatus } from '../types'
import { resolveMediaArtwork } from '../../../lib/mediaArtwork'

export type WidgetFamily =
  | 'light'
  | 'switch'
  | 'smartPlug'
  | 'climate'
  | 'thermostat'
  | 'fan'
  | 'cover'
  | 'curtain'
  | 'gate'
  | 'garage'
  | 'lock'
  | 'alarm'
  | 'motion'
  | 'presence'
  | 'doorWindow'
  | 'temperature'
  | 'humidity'
  | 'airQuality'
  | 'smokeGasCo'
  | 'waterLeak'
  | 'battery'
  | 'weather'
  | 'calendar'
  | 'news'
  | 'camera'
  | 'doorbell'
  | 'energy'
  | 'solar'
  | 'water'
  | 'irrigation'
  | 'pool'
  | 'vacuum'
  | 'mower'
  | 'humidifier'
  | 'update'
  | 'media'
  | 'speaker'
  | 'tv'
  | 'scene'
  | 'automation'
  | 'script'
  | 'timer'
  | 'reminder'
  | 'network'
  | 'system'
  | 'roomSummary'
  | 'generic'

/**
 * Il contratto della card a due zone: il colore vive in `accentColor`
 * (icona + stato significativo), lo stato è UNA riga leggibile, il valore
 * grande esiste solo per le card-misura. Niente gradienti, niente ring.
 */
export interface WidgetEntityMapping {
  family: WidgetFamily
  type: EntityType | string
  Icon: ElementType
  title: string
  status: WidgetCardStatus
  accentColor: string
  isActive: boolean
  isUnavailable: boolean
  /** Riga di stato ("Accesa · 80%", "Riscalda · stanza 19,8°"). */
  state: string
  /** true = la riga di stato usa accentColor (caldo/freddo/allarme), non l'inchiostro muto. */
  stateAccent?: boolean
  /** Valore grande per le card-misura (sensori, clima, meteo). */
  value?: string
  unit?: string
  /** 0..100 per lo slider inline (luminosità, velocità, umidità target). */
  percent?: number
  /** Percorso `entity_picture` (copertina media): il factory lo proxa. */
  artwork?: string
  /** Progresso della riproduzione, per la barra sottile della card media. */
  mediaProgress?: {
    /** secondi già riprodotti al momento di `updatedAt` */
    position: number
    /** durata totale in secondi */
    duration: number
    /** ISO: quando HA ha misurato `position` (per l'avanzamento locale) */
    updatedAt?: string
    playing: boolean
  }
}

/** Nome pubblico di un'entità: mai l'entity_id grezzo in UI. */
export function entityName(entity?: HassEntity | null, fallback?: string) {
  return fallback || (entity?.attributes?.friendly_name as string | undefined) || entity?.entity_id?.split('.')[1]?.replace(/_/g, ' ') || 'Dispositivo'
}

function domainOf(entityId: string) {
  return entityId.split('.')[0]
}

function typeOf(entityId: string, override?: EntityType): EntityType | string {
  if (override) return override
  return DOMAIN_TYPE[domainOf(entityId)] ?? domainOf(entityId)
}

function hasAny(text: string, words: string[]) {
  const lower = text.toLowerCase()
  return words.some((word) => lower.includes(word))
}

function powerValue(entity?: HassEntity | null): number | undefined {
  return numericState(entity?.attributes?.current_power_w)
    ?? numericState(entity?.attributes?.wattage)
    ?? numericState(entity?.attributes?.power)
    ?? (String(entity?.attributes?.unit_of_measurement ?? '').toLowerCase() === 'w' ? numericState(entity?.state) : undefined)
}

function sensorFamily(entity?: HassEntity | null): WidgetFamily {
  const dc = String(entity?.attributes?.device_class ?? '').toLowerCase()
  const unit = String(entity?.attributes?.unit_of_measurement ?? '').toLowerCase()
  const id = entity?.entity_id ?? ''
  if (dc === 'temperature') return 'temperature'
  if (dc === 'humidity') return 'humidity'
  if (dc === 'battery') return 'battery'
  if (dc === 'power' || dc === 'energy' || ['w', 'kw', 'kwh'].includes(unit)) return 'energy'
  if (dc === 'water' || hasAny(id, ['water', 'acqua', 'flow', 'pressure'])) return 'water'
  if (hasAny(`${dc} ${id}`, ['co2', 'pm25', 'pm2_5', 'voc', 'aqi', 'air_quality'])) return 'airQuality'
  if (hasAny(id, ['solar', 'pv', 'fotovoltaico'])) return 'solar'
  if (hasAny(id, ['pool', 'piscina', 'ph', 'salt', 'cloro'])) return 'pool'
  if (hasAny(id, ['network', 'wifi', 'latency', 'ping'])) return 'network'
  return 'generic'
}

function binaryFamily(entity?: HassEntity | null): WidgetFamily {
  const dc = String(entity?.attributes?.device_class ?? '').toLowerCase()
  const id = entity?.entity_id ?? ''
  if (['motion', 'occupancy', 'moving'].includes(dc)) return dc === 'motion' ? 'motion' : 'presence'
  if (['presence'].includes(dc)) return 'presence'
  if (['door', 'window', 'garage_door', 'opening'].includes(dc)) return 'doorWindow'
  if (['moisture', 'problem'].includes(dc) || hasAny(id, ['leak', 'perdita', 'flood'])) return 'waterLeak'
  if (['smoke', 'gas', 'carbon_monoxide'].includes(dc) || hasAny(id, ['smoke', 'gas', 'co_'])) return 'smokeGasCo'
  return 'generic'
}

function coverFamily(entity?: HassEntity | null): WidgetFamily {
  const dc = String(entity?.attributes?.device_class ?? '').toLowerCase()
  const text = `${entity?.entity_id ?? ''} ${entity?.attributes?.friendly_name ?? ''}`.toLowerCase()
  if (dc === 'garage' || hasAny(text, ['garage'])) return 'garage'
  if (dc === 'gate' || hasAny(text, ['gate', 'cancello'])) return 'gate'
  if (dc === 'curtain' || hasAny(text, ['curtain', 'tenda'])) return 'curtain'
  return 'cover'
}

function mediaFamily(entity?: HassEntity | null): WidgetFamily {
  const dc = String(entity?.attributes?.device_class ?? '').toLowerCase()
  const text = `${entity?.entity_id ?? ''} ${entity?.attributes?.friendly_name ?? ''}`.toLowerCase()
  if (dc === 'tv' || hasAny(text, ['tv', 'televisore'])) return 'tv'
  if (dc === 'speaker' || hasAny(text, ['speaker', 'sonos', 'audio'])) return 'speaker'
  return 'media'
}

/** Formatta un numero per la riga di stato/valore: una sola cifra decimale. */
function fmt(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',')
}

export function mapEntityToWidgetCard(entity: HassEntity | null | undefined, roomEntity: RoomEntity): WidgetEntityMapping {
  const entityId = roomEntity.entityId
  const domain = domainOf(entityId)
  const type = typeOf(entityId, roomEntity.type)
  const deviceClass = String(entity?.attributes?.device_class ?? '')
  const title = entityName(entity, roomEntity.label)
  const unavailable = !entity || entity.state === 'unavailable' || entity.state === 'unknown'
  const rawState = entity?.state ?? 'unavailable'
  const text = `${entityId} ${title} ${deviceClass}`

  let family: WidgetFamily =
    domain === 'light' ? 'light'
    : domain === 'switch' || domain === 'input_boolean' ? (powerValue(entity) !== undefined ? 'smartPlug' : 'switch')
    : domain === 'climate' ? 'climate'
    : domain === 'fan' ? 'fan'
    : domain === 'cover' ? coverFamily(entity)
    : domain === 'lock' ? 'lock'
    : domain === 'alarm_control_panel' ? 'alarm'
    : domain === 'binary_sensor' ? binaryFamily(entity)
    : domain === 'sensor' ? sensorFamily(entity)
    : domain === 'weather' ? 'weather'
    : domain === 'calendar' ? 'calendar'
    : domain === 'camera' ? 'camera'
    : domain === 'media_player' ? mediaFamily(entity)
    : domain === 'vacuum' ? 'vacuum'
    : domain === 'lawn_mower' ? 'mower'
    : domain === 'humidifier' ? 'humidifier'
    : domain === 'update' ? 'update'
    : domain === 'air_quality' ? 'airQuality'
    : domain === 'scene' ? 'scene'
    : domain === 'automation' ? 'automation'
    : domain === 'script' ? 'script'
    : domain === 'timer' ? 'timer'
    : domain === 'person' || domain === 'device_tracker' ? 'presence'
    : domain === 'siren' ? 'alarm'
    : domain === 'button' || domain === 'input_button' || domain === 'remote' ? 'script'
    : domain === 'valve' ? 'water'
    : domain === 'water_heater' ? 'thermostat'
    : 'generic'

  if (type === 'security') family = 'system'

  const on = ['on', 'open', 'opening', 'playing', 'cleaning', 'heat', 'cool', 'auto', 'dry', 'fan_only', 'home'].includes(rawState)
  const power = powerValue(entity)
  const value = numericState(entity?.state)
  const battery = numericState(entity?.attributes?.battery_level) ?? (family === 'battery' ? value : undefined)
  const position = numericState(entity?.attributes?.current_position)
  const brightness = numericState(entity?.attributes?.brightness)
  const brightnessPct = brightness !== undefined ? Math.round((brightness / 255) * 100) : on ? 100 : 0
  const base = { family, type, title, isUnavailable: unavailable }

  switch (family) {
    case 'light':
      return {
        ...base, Icon: AnimLightbulb,
        status: on ? 'on' : 'off',
        accentColor: widgetTones.light.color,
        isActive: on,
        state: on ? (brightness !== undefined ? `Accesa · ${brightnessPct}%` : 'Accesa') : 'Spenta',
        percent: on ? brightnessPct : undefined,
      }
    case 'smartPlug':
    case 'switch':
      return {
        ...base, Icon: family === 'smartPlug' ? AnimZap : AnimPower,
        status: on ? 'on' : 'off',
        accentColor: family === 'smartPlug' ? widgetTones.energy.color : widgetTones.ok.color,
        isActive: on,
        state: on ? (power !== undefined ? `Acceso · ${Math.round(power)} W` : 'Acceso') : 'Spento',
      }
    case 'climate':
    case 'thermostat': {
      const current = numericState(entity?.attributes?.current_temperature)
      const target = numericState(entity?.attributes?.temperature)
      const action = String(entity?.attributes?.hvac_action ?? rawState)
      const acting = action === 'heating' || action === 'cooling'
      const tone = action === 'heating' ? widgetTones.heat : action === 'cooling' ? widgetTones.cool : temperatureTone(target ?? current)
      const room = current !== undefined ? `stanza ${fmt(current)}°` : undefined
      const verb = action === 'heating' ? 'Riscalda' : action === 'cooling' ? 'Raffresca' : rawState === 'off' ? 'Spento' : stateLabel(rawState)
      return {
        ...base, Icon: action === 'cooling' ? AnimSnowflake : action === 'heating' ? AnimFlame : AnimThermometer,
        status: action === 'cooling' ? 'cooling' : action === 'heating' ? 'heating' : rawState === 'off' ? 'off' : 'idle',
        accentColor: tone.color,
        isActive: rawState !== 'off' && !unavailable,
        state: room ? `${verb} · ${room}` : verb,
        stateAccent: acting,
        value: target !== undefined ? fmt(target) : current !== undefined ? fmt(current) : '--',
        unit: '°',
      }
    }
    case 'fan': {
      const speed = numericState(entity?.attributes?.percentage) ?? (on ? 100 : 0)
      return {
        ...base, Icon: AnimFan,
        status: on ? 'fan' : 'off',
        accentColor: widgetTones.cool.color,
        isActive: on,
        state: on ? `Acceso · ${Math.round(speed)}%` : 'Spento',
        percent: on ? Math.round(speed) : undefined,
      }
    }
    case 'cover':
    case 'curtain':
    case 'gate':
    case 'garage': {
      const moving = rawState === 'opening' || rawState === 'closing'
      const pos = position ?? (rawState === 'open' ? 100 : 0)
      const Icon = family === 'gate' || family === 'garage' ? Home : moving ? AnimBlindsMoving : AnimBlinds
      const open = pos > 0 && !moving
      return {
        ...base, Icon,
        status: rawState === 'closed' ? 'closed' : rawState === 'closing' ? 'closing' : rawState === 'opening' ? 'opening' : 'open',
        accentColor: widgetTones.cool.color,
        isActive: open || moving,
        state: moving ? `${stateLabel(rawState)}…`
          : rawState === 'closed' || pos === 0 ? 'Chiusa'
          : pos >= 100 ? 'Aperta' : `Aperta · ${Math.round(pos)}%`,
      }
    }
    case 'lock': {
      const unlocked = rawState === 'unlocked'
      const tone = securityTone(!unlocked && !unavailable, unlocked)
      return {
        ...base, Icon: AnimLock,
        status: unlocked ? 'unlocked' : 'locked',
        accentColor: tone.color,
        isActive: unlocked,
        state: unlocked ? 'Sbloccata' : 'Bloccata',
        stateAccent: unlocked,
      }
    }
    case 'alarm':
    case 'smokeGasCo':
    case 'waterLeak': {
      const critical = ['triggered', 'on', 'problem'].includes(rawState)
      const tone = critical ? widgetTones.critical : widgetTones.ok
      const siren = domain === 'siren'
      return {
        ...base, Icon: siren ? Siren : AnimShield,
        status: critical ? 'triggered' : rawState.includes('armed') ? 'armed' : 'clear',
        accentColor: tone.color,
        isActive: critical,
        state: critical ? (siren ? 'Sirena attiva' : 'Allarme!') : siren ? 'Sirena disattivata' : stateLabel(rawState),
        stateAccent: critical,
      }
    }
    case 'motion':
    case 'presence':
    case 'doorWindow': {
      const active = rawState === 'on' || rawState === 'home' || rawState === 'open'
      const tone = family === 'doorWindow' ? securityTone(!active, active) : active ? widgetTones.cool : widgetTones.ok
      return {
        ...base, Icon: family === 'presence' ? UserRound : family === 'doorWindow' ? Home : AnimRadar,
        status: active ? 'detected' : 'clear',
        accentColor: tone.color,
        isActive: active,
        state: family === 'doorWindow' ? (active ? 'Aperta' : 'Chiusa')
          : family === 'presence' ? (active ? 'In casa' : 'Fuori casa')
          : active ? 'Movimento rilevato' : 'Nessun movimento',
        stateAccent: family === 'doorWindow' && active,
      }
    }
    case 'temperature':
    case 'humidity':
    case 'airQuality':
    case 'battery':
    case 'energy':
    case 'solar':
    case 'water':
    case 'pool':
    case 'network': {
      const number = family === 'battery' ? battery ?? value : value
      const tone =
        family === 'battery' ? batteryTone(number)
        : family === 'airQuality' ? airQualityTone(number)
        : family === 'temperature' ? temperatureTone(number)
        : family === 'humidity' || family === 'water' || family === 'pool' ? widgetTones.water
        : family === 'network' ? widgetTones.cool
        : widgetTones.energy
      const unit = (entity?.attributes?.unit_of_measurement as string | undefined) ?? (family === 'humidity' ? '%' : undefined)
      return {
        ...base,
        Icon: family === 'battery' ? Battery : family === 'humidity' || family === 'water' || family === 'pool' ? AnimDroplet : family === 'energy' || family === 'solar' ? AnimZap : family === 'airQuality' ? AnimWind : family === 'network' ? Wifi : AnimThermometer,
        status: family === 'battery' && (number ?? 100) < 20 ? 'lowBattery' : 'active',
        accentColor: tone.color,
        // I sensori sono passivi: icona quieta, mai "accesa".
        isActive: false,
        state: '',
        value: number !== undefined ? fmt(number) : '--',
        unit: unit === '°C' ? '°' : unit,
      }
    }
    case 'weather':
      return {
        ...base, Icon: AnimCloudSun,
        status: 'active',
        accentColor: hasAny(rawState, ['rain', 'pouring']) ? widgetTones.cool.color : widgetTones.light.color,
        isActive: !unavailable,
        state: stateLabel(rawState),
        value: entity?.attributes?.temperature !== undefined ? fmt(Number(entity.attributes.temperature)) : '--',
        unit: '°',
      }
    case 'camera':
    case 'doorbell':
      return {
        ...base, Icon: family === 'doorbell' ? AnimBell : AnimCamera,
        status: unavailable ? 'offline' : 'active',
        accentColor: widgetTones.cool.color,
        isActive: !unavailable,
        state: unavailable ? 'Offline' : 'Live',
      }
    case 'media':
    case 'speaker':
    case 'tv': {
      const playing = rawState === 'playing'
      const paused = rawState === 'paused'
      const mediaTitle = entity?.attributes?.media_title as string | undefined
      const artist = (entity?.attributes?.media_artist
        ?? entity?.attributes?.media_series_title
        ?? entity?.attributes?.app_name) as string | undefined
      const picture = resolveMediaArtwork(entity?.attributes)
      const position = numericState(entity?.attributes?.media_position)
      const duration = numericState(entity?.attributes?.media_duration)
      const nowLine = mediaTitle
        ? (artist && artist !== mediaTitle ? `${mediaTitle} · ${artist}` : mediaTitle)
        : 'In riproduzione'
      return {
        ...base, Icon: family === 'tv' ? AnimTv : family === 'speaker' ? AnimSpeaker : AnimEqualizer,
        status: playing ? 'active' : 'idle',
        accentColor: widgetTones.media.color,
        isActive: playing,
        state: playing ? nowLine
          : paused ? (mediaTitle ? `In pausa · ${mediaTitle}` : 'In pausa')
          : rawState === 'off' ? 'Spenta' : stateLabel(rawState),
        // Apple TV conserva spesso la locandina o l'icona dell'app anche in
        // idle/standby: è comunque informazione viva e non va nascosta.
        ...(picture && !unavailable && rawState !== 'off' ? { artwork: picture } : {}),
        ...(position !== undefined && duration !== undefined && duration > 0 && (playing || paused)
          ? {
              mediaProgress: {
                position,
                duration,
                updatedAt: entity?.attributes?.media_position_updated_at as string | undefined,
                playing,
              },
            }
          : {}),
      }
    }
    case 'vacuum':
    case 'mower': {
      const working = rawState === 'cleaning' || rawState === 'mowing'
      const batteryNote = battery !== undefined ? ` · ${Math.round(battery)}%` : ''
      return {
        ...base, Icon: AnimBot,
        status: working ? 'active' : rawState === 'error' ? 'error' : 'idle',
        accentColor: rawState === 'error' ? widgetTones.critical.color : widgetTones.ok.color,
        isActive: working,
        state: `${stateLabel(rawState)}${batteryNote}`,
        stateAccent: rawState === 'error',
      }
    }
    case 'humidifier': {
      const targetHumidity = numericState(entity?.attributes?.humidity)
      return {
        ...base, Icon: AnimMist,
        status: on ? 'on' : 'off',
        accentColor: widgetTones.water.color,
        isActive: on,
        state: on ? (targetHumidity !== undefined ? `Acceso · target ${Math.round(targetHumidity)}%` : 'Acceso') : 'Spento',
        percent: on && targetHumidity !== undefined ? Math.round(targetHumidity) : undefined,
      }
    }
    case 'update': {
      const updateAvailable = rawState === 'on'
      const tone = updateAvailable ? widgetTones.warning : widgetTones.ok
      return {
        ...base, Icon: CircleArrowUp,
        status: updateAvailable ? 'warning' : 'active',
        accentColor: tone.color,
        isActive: updateAvailable,
        state: updateAvailable ? 'Aggiornamento disponibile' : 'Aggiornato',
        stateAccent: updateAvailable,
      }
    }
    case 'scene':
    case 'script':
    case 'automation':
    case 'timer':
      return {
        ...base, Icon: family === 'timer' ? Timer : family === 'automation' ? ListChecks : AnimSparkles,
        status: rawState === 'on' || rawState === 'active' ? 'active' : 'idle',
        accentColor: widgetTones.media.color,
        isActive: rawState === 'on' || rawState === 'active',
        state: family === 'timer' ? stateLabel(rawState)
          : family === 'automation' ? (rawState === 'on' ? 'Attiva' : 'Disattivata')
          : family === 'script' ? 'Script' : 'Scena',
      }
    default: {
      const unit = entity?.attributes?.unit_of_measurement as string | undefined
      const numeric = value !== undefined
      return {
        family: hasAny(text, ['news']) ? 'news' : 'generic',
        type, title,
        Icon: domain === 'select' || domain === 'input_select' ? ListChecks : domain === 'number' || domain === 'input_number' ? Gauge : domain === 'siren' ? Siren : domain === 'valve' ? AnimDroplet : ToggleRight,
        status: unavailable ? 'unavailable' : 'active',
        accentColor: widgetTones.neutral.color,
        isActive: false,
        isUnavailable: unavailable,
        state: numeric ? '' : stateLabel(rawState),
        value: numeric ? fmt(value) : undefined,
        unit: numeric ? unit : undefined,
      }
    }
  }
}
