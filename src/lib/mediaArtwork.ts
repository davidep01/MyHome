const ARTWORK_ATTRIBUTES = [
  'entity_picture',
  'media_image_url',
  'image_url',
  'media_thumbnail',
  'thumbnail_url',
  'poster_url',
  'media_artwork',
  'app_icon',
] as const

// Identità del contenuto, volutamente senza posizione/volume: quei valori
// cambiano spesso durante la riproduzione e non devono riscaricare la cover.
const ARTWORK_REVISION_ATTRIBUTES = [
  ...ARTWORK_ATTRIBUTES,
  'media_content_id',
  'media_content_type',
  'media_title',
  'media_artist',
  'media_album_name',
  'media_series_title',
  'media_season',
  'media_episode',
  'app_id',
  'app_name',
  'source',
] as const

/**
 * Revisione compatta della cover derivata dagli attributi che identificano il
 * contenuto. Alcuni player (Apple TV in particolare) riutilizzano lo stesso
 * URL mentre cambiano immagine: questa chiave fa invalidare browser, colore
 * dominante e cache del proxy appena HA invia il relativo delta push.
 */
export function mediaArtworkRevision(attributes?: Record<string, unknown>): string | undefined {
  if (!attributes) return undefined
  const signature = ARTWORK_REVISION_ATTRIBUTES
    .map((key) => {
      const value = attributes[key]
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? `${key}:${String(value)}`
        : ''
    })
    .filter(Boolean)
    .join('\u001f')
  if (!signature) return undefined

  // FNV-1a a 32 bit: deterministico, piccolo e sufficiente come cache key.
  let hash = 0x811c9dc5
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

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
