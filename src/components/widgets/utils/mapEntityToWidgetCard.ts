import type { HassEntity } from 'home-assistant-js-websocket'
import {
  Activity, Battery, Bell, Blinds, Camera, CloudSun,
  Droplets, Fan, Flame, Gauge, Home, Lightbulb, ListChecks, Lock, Music2,
  PlugZap, Power, Radio, Shield, ShieldAlert, Siren, Sparkles, Thermometer,
  Timer, ToggleRight, Tv, UserRound, Wifi, Wind, Zap,
} from 'lucide-react'
import type { ElementType } from 'react'
import type { EntityType, RoomEntity } from '../../../api/backend'
import { DOMAIN_TYPE } from '../../../hooks/useDiscoveredEntities'
import { airQualityTone, batteryTone, securityTone, temperatureTone, widgetTones } from './getRingColorScale'
import { numericState } from './formatWidgetValue'
import type { WidgetAnimationPreset, WidgetCardStatus } from '../types'

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

export interface WidgetEntityMapping {
  family: WidgetFamily
  type: EntityType | string
  Icon: ElementType
  title: string
  subtitle: string
  status: WidgetCardStatus
  accentColor: string
  gradient: string
  animationPreset: WidgetAnimationPreset
  isActive: boolean
  isUnavailable: boolean
  primary: string
  unit?: string
  secondary?: string
  ringValue?: number
  ringMax?: number
}

function entityName(entity?: HassEntity | null, fallback?: string) {
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

  switch (family) {
    case 'light':
      return {
        family, type, Icon: Lightbulb, title,
        subtitle: unavailable ? 'Non disponibile' : on ? 'Accesa' : 'Spenta',
        status: on ? 'on' : 'off',
        accentColor: widgetTones.light.color,
        gradient: widgetTones.light.gradient,
        animationPreset: on ? 'softGlow' : 'none',
        isActive: on,
        isUnavailable: unavailable,
        primary: `${brightnessPct}`,
        unit: '%',
        secondary: on ? 'Luminosita' : 'Off',
        ringValue: brightnessPct,
      }
    case 'smartPlug':
    case 'switch':
      return {
        family, type, Icon: family === 'smartPlug' ? PlugZap : Power, title,
        subtitle: unavailable ? 'Non disponibile' : on ? 'Acceso' : 'Spento',
        status: on ? 'on' : 'off',
        accentColor: family === 'smartPlug' ? widgetTones.energy.color : widgetTones.ok.color,
        gradient: family === 'smartPlug' ? widgetTones.energy.gradient : widgetTones.ok.gradient,
        animationPreset: on && family === 'smartPlug' ? 'energyFlow' : on ? 'successPop' : 'none',
        isActive: on,
        isUnavailable: unavailable,
        primary: power !== undefined ? String(Math.round(power)) : on ? 'ON' : 'OFF',
        unit: power !== undefined ? 'W' : undefined,
        secondary: family === 'smartPlug' ? 'Presa smart' : 'Interruttore',
        ringValue: power !== undefined ? Math.min(100, Math.round(power / 25)) : on ? 100 : 0,
      }
    case 'climate':
    case 'thermostat': {
      const current = numericState(entity?.attributes?.current_temperature)
      const target = numericState(entity?.attributes?.temperature)
      const tone = temperatureTone(target ?? current)
      const mode = rawState.replace(/_/g, ' ')
      const action = String(entity?.attributes?.hvac_action ?? rawState)
      return {
        family, type, Icon: action === 'cooling' ? Wind : action === 'heating' ? Flame : Thermometer, title,
        subtitle: unavailable ? 'Non disponibile' : mode,
        status: action === 'cooling' ? 'cooling' : action === 'heating' ? 'heating' : rawState === 'off' ? 'off' : 'idle',
        accentColor: tone.color,
        gradient: tone.gradient,
        animationPreset: action === 'cooling' ? 'snow' : action === 'heating' ? 'heat' : action === 'fan' ? 'fanSpin' : 'none',
        isActive: rawState !== 'off' && !unavailable,
        isUnavailable: unavailable,
        primary: target !== undefined ? target.toFixed(1) : current !== undefined ? current.toFixed(1) : '--',
        unit: 'C',
        secondary: current !== undefined ? `Stanza ${current.toFixed(1)} C` : mode,
        ringValue: target ?? current ?? 0,
        ringMax: 35,
      }
    }
    case 'fan': {
      const speed = numericState(entity?.attributes?.percentage) ?? (on ? 100 : 0)
      return {
        family, type, Icon: Fan, title,
        subtitle: unavailable ? 'Non disponibile' : on ? 'Ventilazione' : 'Spento',
        status: on ? 'fan' : 'off',
        accentColor: widgetTones.cool.color,
        gradient: widgetTones.cool.gradient,
        animationPreset: on ? 'fanSpin' : 'none',
        isActive: on,
        isUnavailable: unavailable,
        primary: String(Math.round(speed)),
        unit: '%',
        secondary: 'Velocita',
        ringValue: speed,
      }
    }
    case 'cover':
    case 'curtain':
    case 'gate':
    case 'garage': {
      const moving = rawState === 'opening' || rawState === 'closing'
      const pos = position ?? (rawState === 'open' ? 100 : 0)
      const Icon = family === 'gate' ? Home : family === 'garage' ? Home : Blinds
      return {
        family, type, Icon, title,
        subtitle: unavailable ? 'Non disponibile' : rawState.replace(/_/g, ' '),
        status: rawState === 'closed' ? 'closed' : rawState === 'closing' ? 'closing' : rawState === 'opening' ? 'opening' : 'open',
        accentColor: widgetTones.energy.color,
        gradient: widgetTones.energy.gradient,
        animationPreset: moving ? family === 'cover' || family === 'curtain' ? 'blindMove' : 'gateSlide' : 'none',
        isActive: pos > 0 || moving,
        isUnavailable: unavailable,
        primary: String(Math.round(pos)),
        unit: '%',
        secondary: rawState === 'closed' ? 'Chiusa' : rawState === 'open' ? 'Aperta' : 'In movimento',
        ringValue: pos,
      }
    }
    case 'lock': {
      const unlocked = rawState === 'unlocked'
      const tone = securityTone(!unlocked && !unavailable, unlocked)
      return {
        family, type, Icon: Lock, title,
        subtitle: unavailable ? 'Non disponibile' : unlocked ? 'Sbloccata' : 'Bloccata',
        status: unlocked ? 'unlocked' : 'locked',
        accentColor: tone.color,
        gradient: tone.gradient,
        animationPreset: unlocked ? 'alarmPulse' : 'lockSnap',
        isActive: unlocked,
        isUnavailable: unavailable,
        primary: unlocked ? 'Open' : 'Lock',
        secondary: unlocked ? 'Attenzione' : 'Sicura',
        ringValue: unlocked ? 28 : 100,
      }
    }
    case 'alarm':
    case 'smokeGasCo':
    case 'waterLeak': {
      const critical = ['triggered', 'on', 'problem'].includes(rawState)
      const tone = critical ? widgetTones.critical : widgetTones.ok
      return {
        family, type, Icon: critical ? ShieldAlert : Shield, title,
        subtitle: unavailable ? 'Non disponibile' : critical ? 'Allarme' : 'Sicuro',
        status: critical ? 'triggered' : rawState.includes('armed') ? 'armed' : 'clear',
        accentColor: tone.color,
        gradient: tone.gradient,
        animationPreset: critical ? 'alarmPulse' : 'none',
        isActive: critical,
        isUnavailable: unavailable,
        primary: critical ? '!' : 'OK',
        secondary: rawState.replace(/_/g, ' '),
        ringValue: critical ? 100 : 0,
      }
    }
    case 'motion':
    case 'presence':
    case 'doorWindow': {
      const active = rawState === 'on' || rawState === 'home' || rawState === 'open'
      const tone = family === 'doorWindow' ? securityTone(!active, active) : active ? widgetTones.cool : widgetTones.ok
      return {
        family, type, Icon: family === 'presence' ? UserRound : family === 'doorWindow' ? Home : Activity, title,
        subtitle: unavailable ? 'Non disponibile' : active ? family === 'presence' ? 'Presente' : 'Rilevato' : 'Clear',
        status: active ? 'detected' : 'clear',
        accentColor: tone.color,
        gradient: tone.gradient,
        animationPreset: active ? 'ripple' : 'none',
        isActive: active,
        isUnavailable: unavailable,
        primary: active ? 'ON' : 'OK',
        secondary: active ? 'Attivo' : 'Nessun evento',
        ringValue: active ? 100 : 0,
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
      const number = value
      const tone =
        family === 'battery' ? batteryTone(battery ?? number)
        : family === 'airQuality' ? airQualityTone(number)
        : family === 'temperature' ? temperatureTone(number)
        : family === 'humidity' || family === 'water' || family === 'pool' ? widgetTones.water
        : family === 'network' ? widgetTones.cool
        : widgetTones.energy
      const unit = (entity?.attributes?.unit_of_measurement as string | undefined) ?? (family === 'humidity' ? '%' : undefined)
      return {
        family, type,
        Icon: family === 'battery' ? Battery : family === 'humidity' || family === 'water' || family === 'pool' ? Droplets : family === 'energy' || family === 'solar' ? Zap : family === 'airQuality' ? Wind : family === 'network' ? Wifi : Thermometer,
        title,
        subtitle: unavailable ? 'Non disponibile' : family === 'airQuality' ? 'Qualita aria' : family === 'energy' ? 'Energia' : family === 'battery' ? 'Batteria' : 'Sensore',
        status: family === 'battery' && (battery ?? 100) < 20 ? 'lowBattery' : 'active',
        accentColor: tone.color,
        gradient: tone.gradient,
        animationPreset: family === 'energy' || family === 'solar' ? 'energyFlow' : family === 'water' || family === 'pool' ? 'waterWave' : 'none',
        isActive: !unavailable,
        isUnavailable: unavailable,
        primary: number !== undefined ? String(Math.round(number * 10) / 10) : '--',
        unit,
        secondary: deviceClass || unit || 'Valore',
        ringValue: family === 'battery' ? battery ?? number ?? 0 : number ?? 0,
        ringMax: family === 'airQuality' ? 1800 : family === 'temperature' ? 40 : 100,
      }
    }
    case 'weather':
      return {
        family, type, Icon: CloudSun, title,
        subtitle: rawState.replace(/_/g, ' '),
        status: 'active',
        accentColor: hasAny(rawState, ['rain', 'pouring']) ? widgetTones.cool.color : widgetTones.light.color,
        gradient: hasAny(rawState, ['rain', 'pouring']) ? widgetTones.cool.gradient : widgetTones.light.gradient,
        animationPreset: hasAny(rawState, ['rain', 'pouring']) ? 'rain' : 'softGlow',
        isActive: !unavailable,
        isUnavailable: unavailable,
        primary: String(entity?.attributes?.temperature ?? '--'),
        unit: 'C',
        secondary: rawState,
        ringValue: numericState(entity?.attributes?.humidity) ?? 0,
      }
    case 'camera':
    case 'doorbell':
      return {
        family, type, Icon: family === 'doorbell' ? Bell : Camera, title,
        subtitle: unavailable ? 'Offline' : 'Live',
        status: unavailable ? 'offline' : 'active',
        accentColor: widgetTones.cool.color,
        gradient: widgetTones.cool.gradient,
        animationPreset: unavailable ? 'none' : 'liveBlink',
        isActive: !unavailable,
        isUnavailable: unavailable,
        primary: unavailable ? 'Off' : 'Live',
        secondary: 'Camera',
        ringValue: unavailable ? 0 : 100,
      }
    case 'media':
    case 'speaker':
    case 'tv': {
      const playing = rawState === 'playing'
      return {
        family, type, Icon: family === 'tv' ? Tv : family === 'speaker' ? Radio : Music2, title,
        subtitle: (entity?.attributes?.media_title as string | undefined) ?? rawState,
        status: playing ? 'active' : 'idle',
        accentColor: widgetTones.media.color,
        gradient: widgetTones.media.gradient,
        animationPreset: playing ? 'pulse' : 'none',
        isActive: playing,
        isUnavailable: unavailable,
        primary: playing ? 'Play' : rawState === 'off' ? 'Off' : 'Idle',
        secondary: entity?.attributes?.source as string | undefined,
        ringValue: Math.round(Number(entity?.attributes?.volume_level ?? 0) * 100),
      }
    }
    case 'vacuum':
      return {
        family, type, Icon: Gauge, title,
        subtitle: rawState.replace(/_/g, ' '),
        status: rawState === 'cleaning' ? 'active' : rawState === 'error' ? 'error' : 'idle',
        accentColor: rawState === 'error' ? widgetTones.critical.color : widgetTones.ok.color,
        gradient: rawState === 'error' ? widgetTones.critical.gradient : widgetTones.ok.gradient,
        animationPreset: rawState === 'cleaning' ? 'rotate' : rawState === 'error' ? 'errorShake' : 'none',
        isActive: rawState === 'cleaning',
        isUnavailable: unavailable,
        primary: String(Math.round(battery ?? 0)),
        unit: '%',
        secondary: 'Batteria',
        ringValue: battery ?? 0,
      }
    case 'scene':
    case 'script':
    case 'automation':
    case 'timer':
      return {
        family, type, Icon: family === 'timer' ? Timer : family === 'automation' ? ListChecks : Sparkles, title,
        subtitle: family === 'automation' ? (rawState === 'on' ? 'Attiva' : 'Disattiva') : 'Azione rapida',
        status: rawState === 'on' ? 'active' : 'idle',
        accentColor: widgetTones.media.color,
        gradient: widgetTones.media.gradient,
        animationPreset: 'sparkle',
        isActive: rawState === 'on',
        isUnavailable: unavailable,
        primary: family === 'timer' ? rawState : family === 'automation' ? (rawState === 'on' ? 'ON' : 'OFF') : 'Run',
        secondary: family,
        ringValue: rawState === 'on' ? 100 : 0,
      }
    default:
      return {
        family: hasAny(text, ['news']) ? 'news' : 'generic',
        type,
        Icon: domain === 'select' ? ListChecks : domain === 'number' ? Gauge : domain === 'siren' ? Siren : ToggleRight,
        title,
        subtitle: unavailable ? 'Non disponibile' : rawState.replace(/_/g, ' '),
        status: unavailable ? 'unavailable' : 'active',
        accentColor: widgetTones.neutral.color,
        gradient: widgetTones.neutral.gradient,
        animationPreset: 'none',
        isActive: !unavailable,
        isUnavailable: unavailable,
        primary: value !== undefined ? String(value) : rawState,
        secondary: domain,
        ringValue: value ?? 0,
      }
  }
}
