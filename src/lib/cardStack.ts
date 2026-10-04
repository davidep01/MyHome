import type { DeviceOverride } from '../api/backend'
import { isConfiguredEntity } from './entityVisibility'

export function validStack(value: unknown): value is { label: string; entityIds: string[] } {
  if (!value || typeof value !== 'object') return false
  const { label, entityIds } = value as Record<string, unknown>
  return typeof label === 'string' && label.trim().length > 0 && label.trim().length <= 80
    && Array.isArray(entityIds) && entityIds.length >= 2 && entityIds.length <= 24
    && entityIds.every(id => typeof id === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(id) && !id.startsWith('camera.'))
    && new Set(entityIds).size === entityIds.length
}
export function visibleStackIds(ids: string[], overrides?: Record<string, DeviceOverride>, hidden: string[] = []): string[] {
  return ids.filter(id => !id.startsWith('camera.') && overrides?.[id]?.type !== 'camera' && !hidden.includes(id) && isConfiguredEntity(id, overrides))
}
