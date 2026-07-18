const ARTWORK_ATTRIBUTES = [
  'entity_picture',
  'media_image_url',
  'image_url',
  'app_icon',
] as const

/**
 * Apple TV can expose a browser-incompatible HEIC image through HA while also
 * embedding the original Apple Music artwork template in the `cache` query.
 * Resolve that template to a regular JPEG before it reaches the image proxy.
 */
export function embeddedMediaArtwork(source: string): string | undefined {
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

/**
 * Home Assistant integrations do not all expose artwork under the same key.
 * Apple TV/pyatv commonly switches between the media artwork and the active
 * app icon, so resolve the first usable source without coupling the card to a
 * specific integration or playback state.
 */
export function resolveMediaArtwork(attributes?: Record<string, unknown>): string | undefined {
  if (!attributes) return undefined
  for (const key of ARTWORK_ATTRIBUTES) {
    const value = attributes[key]
    if (typeof value === 'string' && value.trim()) {
      const source = value.trim()
      return embeddedMediaArtwork(source) ?? source
    }
  }
  return undefined
}
