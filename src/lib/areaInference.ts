import type { HassEntity } from 'home-assistant-js-websocket'
import type { HAArea } from '../api/ha-registry'

const STOP_WORDS = new Set(['da', 'di', 'del', 'della', 'dei', 'degli', 'delle'])

function words(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Conservative fallback for installations whose HA area registry is sparse. */
export function inferAreaIdFromEntity(entity: HassEntity | undefined, areas: HAArea[]): string | undefined {
  if (!entity || areas.length === 0) return undefined
  // Deliberately drop the domain (`camera.` must not imply the bedroom).
  const suffix = entity.entity_id.split('.').slice(1).join(' ')
  const haystack = words(`${suffix} ${String(entity.attributes?.friendly_name ?? '')}`)
  const counts = new Map<string, number>()
  for (const token of haystack) counts.set(token, (counts.get(token) ?? 0) + 1)

  const ranked = areas.map((area) => {
    const tokens = words(area.name).filter((token) => !STOP_WORDS.has(token))
    return { id: area.area_id, score: tokens.reduce((sum, token) => sum + (counts.get(token) ?? 0), 0) }
  }).filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  if (ranked.length === 0 || ranked[0].score === ranked[1]?.score) return undefined
  return ranked[0].id
}

/** Precedenza stanza: scelta esplicita valida → registry HA → inferenza prudente. */
export function resolveAreaId({
  entity,
  areas,
  registryAreaId,
  manualAreaId,
}: {
  entity: HassEntity | undefined
  areas: HAArea[]
  registryAreaId?: string
  manualAreaId?: string
}): string | undefined {
  const validAreaIds = new Set(areas.map((area) => area.area_id))
  if (manualAreaId && validAreaIds.has(manualAreaId)) return manualAreaId
  if (registryAreaId && validAreaIds.has(registryAreaId)) return registryAreaId
  return inferAreaIdFromEntity(entity, areas)
}
