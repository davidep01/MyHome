const ARTWORK_ATTRIBUTES = [
  'entity_picture',
  'media_image_url',
  'image_url',
  'app_icon',
] as const

function embeddedMediaArtwork(source: string): string | undefined {
  if (!source.startsWith('/api/media_player_proxy/')) return undefined
  try {
    const embedded = new URL(source, 'http://home-assistant.local').searchParams.get('cache')
    if (!embedded?.startsWith('https://')) return undefined
    return embedded
      .replaceAll('{w}', '512')
      .replaceAll('{h}', '512')
      .replaceAll('{c}', 'bb')
      .replaceAll('{f}', 'jpg')
  } catch {
    return undefined
  }
}

/** Exact image sources advertised by a HA entity. Kept deliberately narrow:
 * callers use this allowlist before proxying an external URL. */
export function advertisedArtworkSources(attributes?: Record<string, unknown>): string[] {
  if (!attributes) return []
  const rawSources = ARTWORK_ATTRIBUTES
    .map((key) => attributes[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
  const sources = rawSources.flatMap((source) => {
    const embedded = embeddedMediaArtwork(source)
    return embedded ? [source, embedded] : [source]
  })
  return [...new Set(sources)]
}
