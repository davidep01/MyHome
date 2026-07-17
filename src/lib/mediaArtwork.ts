const ARTWORK_ATTRIBUTES = [
  'entity_picture',
  'media_image_url',
  'image_url',
  'app_icon',
] as const

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
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}
