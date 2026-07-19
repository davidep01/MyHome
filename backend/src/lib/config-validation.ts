import type {
  ActionShortcut, AppConfig, DashboardLayout, DeviceOverride, DoorbellDevice, DoorbellSettings,
  EntityGroup, KnownFace,
} from '../db/types.js'
import { normalizeHomeConfig } from './home-layout.js'
import {
  cleanText, integerInRange, isEntityId, isEntityType, isIconName, isRecord,
  SIMPLE_ID_PATTERN,
} from './validation.js'

export const MAX_KNOWN_FACES = 8

type Result = { ok: true; value: Partial<AppConfig> } | { ok: false; error: string }

const ALLOWED_KEYS = new Set<keyof AppConfig>([
  'haUrl', 'haToken', 'weatherCity', 'newsCategory', 'newsFeedUrl', 'userName',
  'calendarFeedUrl',
  'dashboardName', 'hiddenEntities', 'deviceOverrides', 'forceCelsius',
  'advancedMode', 'doorbell', 'doorbells', 'groups', 'home', 'dashboardLayout',
  'kiosk', 'alarm', 'ai',
])

const MAX_SHORTCUTS = 4
const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

/** Host consentiti per l'album pubblico dello screensaver (niente proxy arbitrari). */
const SCREENSAVER_SOURCE_HOSTS = new Set(['photos.app.goo.gl', 'photos.google.com'])

export function parseShortcuts(value: unknown): ActionShortcut[] | null {
  if (!Array.isArray(value) || value.length > MAX_SHORTCUTS) return null
  const ids = new Set<string>()
  const result: ActionShortcut[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !onlyKeys(raw, ['id', 'label', 'icon', 'entityId', 'service', 'confirm'])) return null
    const label = cleanText(raw.label, 40)
    if (
      typeof raw.id !== 'string' || !SIMPLE_ID_PATTERN.test(raw.id) || ids.has(raw.id)
      || !label || !isEntityId(raw.entityId)
      || (raw.icon !== undefined && !isIconName(raw.icon))
      || (raw.service !== undefined && (typeof raw.service !== 'string' || !SERVICE_NAME_PATTERN.test(raw.service)))
      || (raw.confirm !== undefined && typeof raw.confirm !== 'boolean')
    ) return null
    ids.add(raw.id)
    result.push({
      id: raw.id,
      label,
      entityId: raw.entityId,
      ...(typeof raw.icon === 'string' ? { icon: raw.icon } : {}),
      ...(typeof raw.service === 'string' ? { service: raw.service } : {}),
      ...(typeof raw.confirm === 'boolean' ? { confirm: raw.confirm } : {}),
    })
  }
  return result
}

export function isAllowedScreensaverSourceUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      && SCREENSAVER_SOURCE_HOSTS.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function normalizeCalendarFeedUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_048) return null
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed.replace(/^webcal:\/\//i, 'https://'))
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null
    return url.toString()
  } catch {
    return null
  }
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed)
  return Object.keys(value).every((key) => set.has(key))
}

function entityIdList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max || !value.every(isEntityId)) return null
  return [...new Set(value)]
}

function parseDoorbell(value: unknown, legacy = false): DoorbellDevice | DoorbellSettings | null {
  if (!isRecord(value)) return null
  const allowed = legacy
    ? ['entityId', 'cameraEntityId']
    : ['id', 'name', 'location', 'entityId', 'cameraEntityId', 'sound', 'volume', 'priority', 'active', 'lockEntityIds', 'shortcuts']
  if (!onlyKeys(value, allowed)) return null
  if (legacy) {
    if (value.entityId !== undefined && !isEntityId(value.entityId)) return null
    if (value.cameraEntityId !== undefined && !isEntityId(value.cameraEntityId)) return null
    return {
      ...(isEntityId(value.entityId) ? { entityId: value.entityId } : {}),
      ...(isEntityId(value.cameraEntityId) ? { cameraEntityId: value.cameraEntityId } : {}),
    }
  }

  const name = cleanText(value.name, 80)
  const location = value.location === undefined ? undefined : cleanText(value.location, 80, true)
  const locks = value.lockEntityIds === undefined ? undefined : entityIdList(value.lockEntityIds, 20)
  const shortcuts = value.shortcuts === undefined ? undefined : parseShortcuts(value.shortcuts)
  if (
    typeof value.id !== 'string' || !SIMPLE_ID_PATTERN.test(value.id)
    || !name || !isEntityId(value.entityId)
    || (value.cameraEntityId !== undefined && !isEntityId(value.cameraEntityId))
    || location === null || locks === null || shortcuts === null
    || (value.sound !== undefined && (typeof value.sound !== 'string' || !SIMPLE_ID_PATTERN.test(value.sound)))
    || (value.volume !== undefined && (typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1))
    || (value.priority !== undefined && !['low', 'medium', 'high', 'critical'].includes(String(value.priority)))
    || (value.active !== undefined && typeof value.active !== 'boolean')
  ) return null

  return {
    id: value.id,
    name,
    entityId: value.entityId,
    ...(location ? { location } : {}),
    ...(isEntityId(value.cameraEntityId) ? { cameraEntityId: value.cameraEntityId } : {}),
    ...(typeof value.sound === 'string' ? { sound: value.sound } : {}),
    ...(typeof value.volume === 'number' ? { volume: value.volume } : {}),
    ...(typeof value.priority === 'string' ? { priority: value.priority as DoorbellDevice['priority'] } : {}),
    ...(typeof value.active === 'boolean' ? { active: value.active } : {}),
    ...(locks ? { lockEntityIds: locks } : {}),
    ...(shortcuts ? { shortcuts } : {}),
  }
}

function parseOverrides(value: unknown): Record<string, DeviceOverride> | null {
  if (!isRecord(value) || Object.keys(value).length > 5_000) return null
  const result: Record<string, DeviceOverride> = {}
  for (const [entityId, raw] of Object.entries(value)) {
    if (!isEntityId(entityId) || !isRecord(raw) || !onlyKeys(raw, ['hero', 'label', 'icon', 'type', 'cardSize', 'cardSizes', 'enabled'])) return null
    const label = raw.label === undefined ? undefined : cleanText(raw.label, 100)
    const cardSizes = raw.cardSizes === undefined
      ? undefined
      : Array.isArray(raw.cardSizes)
        && raw.cardSizes.length > 0
        && raw.cardSizes.length <= 5
        && new Set(raw.cardSizes).size === raw.cardSizes.length
        && raw.cardSizes.every((size) => size === 'XS' || size === 'S' || size === 'M' || size === 'L' || size === 'XL')
          ? raw.cardSizes as DeviceOverride['cardSizes']
          : null
    if (
      (raw.hero !== undefined && raw.hero !== 'always' && raw.hero !== 'never')
      || label === null
      || (raw.icon !== undefined && !isIconName(raw.icon))
      || (raw.type !== undefined && !isEntityType(raw.type))
      || (raw.cardSize !== undefined && !['XS', 'S', 'M', 'L', 'XL'].includes(String(raw.cardSize)))
      || cardSizes === null
      || (raw.enabled !== undefined && typeof raw.enabled !== 'boolean')
    ) return null
    result[entityId] = {
      ...(raw.hero === 'always' || raw.hero === 'never' ? { hero: raw.hero } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(typeof raw.icon === 'string' ? { icon: raw.icon } : {}),
      ...(typeof raw.type === 'string' ? { type: raw.type } : {}),
      ...(raw.cardSize === 'XS' || raw.cardSize === 'S' || raw.cardSize === 'M' || raw.cardSize === 'L' || raw.cardSize === 'XL' ? { cardSize: raw.cardSize } : {}),
      ...(cardSizes ? { cardSizes } : {}),
      ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}),
    }
  }
  return result
}

function parseGroups(value: unknown): EntityGroup[] | null {
  if (!Array.isArray(value) || value.length > 100) return null
  const ids = new Set<string>()
  const result: EntityGroup[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !onlyKeys(raw, ['id', 'label', 'icon', 'type', 'entityIds'])) return null
    const label = cleanText(raw.label, 80)
    const entities = entityIdList(raw.entityIds, 100)
    if (
      typeof raw.id !== 'string' || !SIMPLE_ID_PATTERN.test(raw.id) || ids.has(raw.id)
      || !label || !entities?.length
      || (raw.icon !== undefined && !isIconName(raw.icon))
      || (raw.type !== undefined && !isEntityType(raw.type))
    ) return null
    ids.add(raw.id)
    result.push({
      id: raw.id,
      label,
      entityIds: entities,
      ...(typeof raw.icon === 'string' ? { icon: raw.icon } : {}),
      ...(typeof raw.type === 'string' ? { type: raw.type } : {}),
    })
  }
  return result
}

function parseDashboardLayout(value: unknown): DashboardLayout | null {
  if (!isRecord(value) || !integerInRange(value.cols, 1, 24) || !isRecord(value.items) || Object.keys(value.items).length > 5_000) return null
  const items: DashboardLayout['items'] = {}
  for (const [id, raw] of Object.entries(value.items)) {
    if (!SIMPLE_ID_PATTERN.test(id) && !isEntityId(id)) return null
    if (!isRecord(raw) || !onlyKeys(raw, ['x', 'y', 'w', 'h'])) return null
    if (![raw.x, raw.y, raw.w, raw.h].every((part) => integerInRange(part, 0, 10_000)) || raw.w === 0 || raw.h === 0) return null
    items[id] = { x: raw.x as number, y: raw.y as number, w: raw.w as number, h: raw.h as number }
  }
  return { cols: value.cols, items }
}

function parseFaces(value: unknown): KnownFace[] | null {
  if (!Array.isArray(value) || value.length > MAX_KNOWN_FACES) return null
  const ids = new Set<string>()
  const result: KnownFace[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !onlyKeys(raw, ['id', 'name', 'images'])) return null
    const name = cleanText(raw.name, 80)
    if (typeof raw.id !== 'string' || !SIMPLE_ID_PATTERN.test(raw.id) || ids.has(raw.id) || !name || !Array.isArray(raw.images) || raw.images.length < 1 || raw.images.length > 3) return null
    if (!raw.images.every((image) => typeof image === 'string' && image.length <= 400_000 && /^data:image\/jpeg;base64,[a-z0-9+/]+=*$/i.test(image))) return null
    ids.add(raw.id)
    result.push({ id: raw.id, name, images: raw.images as string[] })
  }
  return result
}

export function validateConfigPatch(input: unknown): Result {
  if (!isRecord(input)) return { ok: false, error: 'Configurazione non valida' }
  const unknown = Object.keys(input).filter((key) => !ALLOWED_KEYS.has(key as keyof AppConfig))
  if (unknown.length) return { ok: false, error: `Campi non consentiti: ${unknown.join(', ')}` }
  const value: Partial<AppConfig> = {}

  const textFields: [keyof Pick<AppConfig, 'weatherCity' | 'newsCategory' | 'userName' | 'dashboardName'>, number][] = [
    ['weatherCity', 100], ['newsCategory', 60], ['userName', 80], ['dashboardName', 80],
  ]
  for (const [key, max] of textFields) {
    if (input[key] === undefined) continue
    const parsed = cleanText(input[key], max)
    if (!parsed) return { ok: false, error: `${key} non valido` }
    value[key] = parsed
  }
  if (input.newsFeedUrl !== undefined) {
    if (typeof input.newsFeedUrl !== 'string' || input.newsFeedUrl.length > 2_048) return { ok: false, error: 'Feed RSS non valido' }
    try {
      const url = new URL(input.newsFeedUrl)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid')
      value.newsFeedUrl = url.toString()
    } catch { return { ok: false, error: 'Il feed RSS deve essere un URL HTTPS valido' } }
  }
  if (input.calendarFeedUrl !== undefined) {
    const calendarFeedUrl = normalizeCalendarFeedUrl(input.calendarFeedUrl)
    if (calendarFeedUrl === null) return { ok: false, error: 'Il calendario deve essere un link iCalendar/ICS HTTPS valido' }
    value.calendarFeedUrl = calendarFeedUrl
  }
  if (input.haUrl !== undefined) {
    if (typeof input.haUrl !== 'string') return { ok: false, error: 'URL Home Assistant non valido' }
    value.haUrl = input.haUrl
  }
  if (input.haToken !== undefined) {
    if (typeof input.haToken !== 'string' || input.haToken.length > 8_192) return { ok: false, error: 'Token Home Assistant non valido' }
    value.haToken = input.haToken
  }
  for (const key of ['forceCelsius', 'advancedMode'] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') return { ok: false, error: `${key} non valido` }
      value[key] = input[key]
    }
  }
  if (input.hiddenEntities !== undefined) {
    const parsed = entityIdList(input.hiddenEntities, 5_000)
    if (!parsed) return { ok: false, error: 'Elenco entità nascoste non valido' }
    value.hiddenEntities = parsed
  }
  if (input.deviceOverrides !== undefined) {
    const parsed = parseOverrides(input.deviceOverrides)
    if (!parsed) return { ok: false, error: 'Personalizzazioni entità non valide' }
    value.deviceOverrides = parsed
  }
  if (input.doorbell !== undefined) {
    const parsed = parseDoorbell(input.doorbell, true) as DoorbellSettings | null
    if (!parsed) return { ok: false, error: 'Campanello non valido' }
    value.doorbell = parsed
  }
  if (input.doorbells !== undefined) {
    if (!Array.isArray(input.doorbells) || input.doorbells.length > 20) return { ok: false, error: 'Campanelli non validi' }
    const parsed = input.doorbells.map((item) => parseDoorbell(item)).filter(Boolean) as DoorbellDevice[]
    if (parsed.length !== input.doorbells.length || new Set(parsed.map((item) => item.id)).size !== parsed.length) return { ok: false, error: 'Campanelli non validi' }
    value.doorbells = parsed
  }
  if (input.groups !== undefined) {
    const parsed = parseGroups(input.groups)
    if (!parsed) return { ok: false, error: 'Gruppi non validi' }
    value.groups = parsed
  }
  if (input.home !== undefined) {
    if (!isRecord(input.home) || !Array.isArray(input.home.widgets) || input.home.widgets.length > 100) return { ok: false, error: 'Home widget non valida' }
    value.home = normalizeHomeConfig(input.home as unknown as AppConfig['home'])
  }
  if (input.dashboardLayout !== undefined) {
    const parsed = parseDashboardLayout(input.dashboardLayout)
    if (!parsed) return { ok: false, error: 'Layout dashboard non valido' }
    value.dashboardLayout = parsed
  }
  if (input.kiosk !== undefined) {
    if (!isRecord(input.kiosk) || !onlyKeys(input.kiosk, ['wakeEntityId', 'homeMode', 'perfProfile', 'screensaver'])) return { ok: false, error: 'Configurazione kiosk non valida' }
    if (input.kiosk.wakeEntityId !== undefined && !isEntityId(input.kiosk.wakeEntityId)) return { ok: false, error: 'Sensore presenza kiosk non valido' }
    if (input.kiosk.homeMode !== undefined && input.kiosk.homeMode !== 'composer' && input.kiosk.homeMode !== 'grid') return { ok: false, error: 'Modalità kiosk non valida' }
    if (input.kiosk.perfProfile !== undefined && !['quality', 'balanced', 'saver'].includes(String(input.kiosk.perfProfile))) return { ok: false, error: 'Profilo prestazioni non valido' }
    let screensaver: NonNullable<AppConfig['kiosk']>['screensaver'] | undefined
    if (input.kiosk.screensaver !== undefined) {
      const raw = input.kiosk.screensaver
      if (!isRecord(raw) || !onlyKeys(raw, ['enabled', 'idleSeconds', 'slideSeconds', 'brightness', 'source', 'sourceUrl', 'recapEntityIds'])) {
        return { ok: false, error: 'Configurazione screensaver non valida' }
      }
      const recapEntityIds = raw.recapEntityIds === undefined ? undefined : entityIdList(raw.recapEntityIds, 100)
      if (
        (raw.enabled !== undefined && typeof raw.enabled !== 'boolean')
        || (raw.idleSeconds !== undefined && !integerInRange(raw.idleSeconds, 30, 3_600))
        || (raw.slideSeconds !== undefined && !integerInRange(raw.slideSeconds, 5, 120))
        || (raw.brightness !== undefined && !integerInRange(raw.brightness, 0, 255))
        || (raw.source !== undefined && raw.source !== 'local' && raw.source !== 'google')
        || (raw.sourceUrl !== undefined && raw.sourceUrl !== '' && !isAllowedScreensaverSourceUrl(raw.sourceUrl))
        || (raw.recapEntityIds !== undefined && recapEntityIds === null)
      ) return { ok: false, error: 'Configurazione screensaver non valida' }
      screensaver = {
        ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}),
        ...(typeof raw.idleSeconds === 'number' ? { idleSeconds: raw.idleSeconds } : {}),
        ...(typeof raw.slideSeconds === 'number' ? { slideSeconds: raw.slideSeconds } : {}),
        ...(typeof raw.brightness === 'number' ? { brightness: raw.brightness } : {}),
        ...(raw.source === 'local' || raw.source === 'google' ? { source: raw.source } : {}),
        ...(isAllowedScreensaverSourceUrl(raw.sourceUrl) ? { sourceUrl: raw.sourceUrl } : {}),
        ...(recapEntityIds ? { recapEntityIds } : {}),
      }
    }
    value.kiosk = {
      ...(isEntityId(input.kiosk.wakeEntityId) ? { wakeEntityId: input.kiosk.wakeEntityId } : {}),
      ...(input.kiosk.homeMode === 'composer' || input.kiosk.homeMode === 'grid' ? { homeMode: input.kiosk.homeMode } : {}),
      ...(input.kiosk.perfProfile === 'quality' || input.kiosk.perfProfile === 'balanced' || input.kiosk.perfProfile === 'saver' ? { perfProfile: input.kiosk.perfProfile } : {}),
      ...(screensaver ? { screensaver } : {}),
    }
  }
  if (input.alarm !== undefined) {
    if (!isRecord(input.alarm) || !onlyKeys(input.alarm, ['photo', 'shortcuts'])) return { ok: false, error: 'Configurazione allarme non valida' }
    if (input.alarm.photo !== undefined && typeof input.alarm.photo !== 'boolean') return { ok: false, error: 'Configurazione allarme non valida' }
    const alarmShortcuts = input.alarm.shortcuts === undefined ? undefined : parseShortcuts(input.alarm.shortcuts)
    if (alarmShortcuts === null) return { ok: false, error: 'Pulsanti di emergenza non validi' }
    value.alarm = {
      ...(typeof input.alarm.photo === 'boolean' ? { photo: input.alarm.photo } : {}),
      ...(alarmShortcuts ? { shortcuts: alarmShortcuts } : {}),
    }
  }
  if (input.ai !== undefined) {
    if (!isRecord(input.ai) || !onlyKeys(input.ai, ['doorbellVision', 'faces'])) return { ok: false, error: 'Configurazione AI non valida' }
    if (input.ai.doorbellVision !== undefined && typeof input.ai.doorbellVision !== 'boolean') return { ok: false, error: 'Configurazione AI non valida' }
    const faces = input.ai.faces === undefined ? undefined : parseFaces(input.ai.faces)
    if (faces === null) return { ok: false, error: 'Volti AI non validi' }
    value.ai = {
      ...(typeof input.ai.doorbellVision === 'boolean' ? { doorbellVision: input.ai.doorbellVision } : {}),
      ...(faces ? { faces } : {}),
    }
  }

  return { ok: true, value }
}
