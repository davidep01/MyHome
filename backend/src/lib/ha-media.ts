const ARTWORK_ATTRIBUTES = [
  'entity_picture',
  'media_image_url',
  'image_url',
  'app_icon',
] as const

/** Exact image sources advertised by a HA entity. Kept deliberately narrow:
 * callers use this allowlist before proxying an external URL. */
export function advertisedArtworkSources(attributes?: Record<string, unknown>): string[] {
  if (!attributes) return []
  const sources = ARTWORK_ATTRIBUTES
    .map((key) => attributes[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
  return [...new Set(sources)]
}
