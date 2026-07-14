import type { RoomEntity } from '../db/types.js'

export const ENTITY_ID_PATTERN = /^[a-z0-9_]+\.[a-z0-9_]+$/
export const SIMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/i
export const ICON_PATTERN = /^[a-z0-9][a-z0-9_-]{0,59}$/i

export const ENTITY_TYPES = new Set<RoomEntity['type']>([
  'light', 'climate', 'cover', 'scene', 'security', 'media', 'sensor',
  'switch', 'camera', 'vacuum', 'lock', 'alarm', 'number', 'select',
  'button', 'binary_sensor', 'siren', 'fan', 'automation', 'script',
  'person', 'device_tracker', 'weather', 'water_heater', 'valve',
])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function cleanText(value: unknown, maxLength: number, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const hasControl = [...text].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  if ((!allowEmpty && !text) || text.length > maxLength || hasControl) return null
  return text
}

export function integerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
}

export function isEntityId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 255 && ENTITY_ID_PATTERN.test(value)
}

export function isEntityType(value: unknown): value is RoomEntity['type'] {
  return typeof value === 'string' && ENTITY_TYPES.has(value as RoomEntity['type'])
}

export function isIconName(value: unknown): value is string {
  return typeof value === 'string' && ICON_PATTERN.test(value)
}
