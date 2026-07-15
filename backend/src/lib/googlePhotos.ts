/**
 * Adapter "Google Foto da link pubblico" per lo screensaver (§14).
 *
 * I link condivisi (photos.app.goo.gl / photos.google.com/share/…) NON sono un
 * feed stabile: questa è un'estrazione best-effort dal markup dell'album, dietro
 * un'interfaccia sostituibile (PhotoSourceAdapter) — se Google cambia il markup
 * si aggiorna QUI, il resto del sistema vede solo una lista di foto.
 */

const BASE_URL_PATTERN = /https:\/\/lh[0-9]\.googleusercontent\.com\/[A-Za-z0-9_\-./]{20,600}/g
export const MAX_ALBUM_PHOTOS = 100

/**
 * Estrae gli URL base delle foto dal markup di un album condiviso.
 * Deduplica, scarta le miniature di profilo (path troppo corti) e tronca
 * qualunque suffisso di dimensione `=w…`: la taglia la decide il proxy.
 */
export function extractGooglePhotoUrls(html: string): string[] {
  const seen = new Set<string>()
  for (const match of html.matchAll(BASE_URL_PATTERN)) {
    const base = match[0].split('=')[0]
    // Gli avatar dei collaboratori usano path corti /a/ o /a-. Le foto vere no.
    if (/googleusercontent\.com\/a[/-]/.test(base)) continue
    seen.add(base)
    if (seen.size >= MAX_ALBUM_PHOTOS) break
  }
  return [...seen]
}

/** URL della foto con dimensione esplicita (il ridimensionamento lo fa Google). */
export function photoUrlWithSize(baseUrl: string, width = 1600, height = 1200): string {
  return `${baseUrl}=w${width}-h${height}-no`
}

/** Solo gli host lh*.googleusercontent.com sono proxabili come foto remote. */
export function isGooglePhotoContentUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /^lh[0-9]\.googleusercontent\.com$/.test(url.hostname)
  } catch {
    return false
  }
}
