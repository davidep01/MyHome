import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { Hono } from 'hono'
import { db } from '../db/client.js'
import { extractGooglePhotoUrls, isGooglePhotoContentUrl, photoUrlWithSize } from '../lib/googlePhotos.js'
import { isAllowedScreensaverSourceUrl } from '../lib/config-validation.js'
import { OutboundRequestError, fetchWithLimits } from '../lib/request-safety.js'
import { ByteLru } from '../lib/lru.js'

const MAX_PHOTOS = 200
const MAX_PHOTO_BYTES = 25 * 1024 * 1024
const PHOTO_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
])

function dataDirectory(): string {
  if (process.env.MYHOME_SCREENSAVER_DIR?.trim()) return resolve(process.env.MYHOME_SCREENSAVER_DIR.trim())
  if (process.env.MYHOME_DB_PATH?.trim()) return join(dirname(resolve(process.env.MYHOME_DB_PATH.trim())), 'screensaver')
  return resolve(process.cwd(), 'backend/data/screensaver')
}

function safePhotoName(value: string): string | null {
  if (!value || value.length > 240 || value.startsWith('.') || basename(value) !== value) return null
  const extension = extname(value).toLowerCase()
  return PHOTO_TYPES.has(extension) ? value : null
}

function photoPath(name: string): string | null {
  const safeName = safePhotoName(name)
  if (!safeName) return null
  const directory = dataDirectory()
  const candidate = resolve(directory, safeName)
  return candidate.startsWith(`${directory}/`) ? candidate : null
}

export const screensaverRouter = new Hono()

// ── Sorgente remota: album pubblico Google Foto (§14) ────────────────────────
// PhotoSourceAdapter sostituibile: il parsing vive in lib/googlePhotos.ts, qui
// solo cache dell'elenco (6h) e proxy delle immagini (LRU, stessa origine, CSP
// img-src 'self' intatta). Link revocato o markup cambiato → fallback locale
// con errore esplicito, mai schermo rotto.
const ALBUM_TTL_MS = 6 * 60 * 60 * 1_000
const MAX_ALBUM_HTML_BYTES = 6 * 1_024 * 1_024
const PHOTO_TYPES_VALUES = new Set(PHOTO_TYPES.values())
const remoteImageCache = new ByteLru({ maxEntries: 60, maxTotalBytes: 48 * 1_024 * 1_024, ttlMs: 12 * 60 * 60 * 1_000 })
let albumCache: { sourceUrl: string; urls: string[]; fetchedAt: number } | null = null

async function googleAlbumUrls(sourceUrl: string): Promise<string[]> {
  if (albumCache && albumCache.sourceUrl === sourceUrl && Date.now() - albumCache.fetchedAt < ALBUM_TTL_MS) {
    return albumCache.urls
  }
  const { response, bytes } = await fetchWithLimits(
    sourceUrl,
    { method: 'GET', headers: { Accept: 'text/html' } },
    { timeoutMs: 12_000, maxBytes: MAX_ALBUM_HTML_BYTES, maxRedirects: 4, requirePublicHttps: true },
  )
  if (!response.ok) throw new Error(`album returned ${response.status}`)
  const urls = extractGooglePhotoUrls(new TextDecoder().decode(bytes)).filter(isGooglePhotoContentUrl)
  if (urls.length === 0) throw new Error('album senza foto leggibili')
  albumCache = { sourceUrl, urls, fetchedAt: Date.now() }
  return urls
}

async function localPhotos() {
  const directory = dataDirectory()
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries
    .filter((entry) => entry.isFile() && safePhotoName(entry.name))
    .slice(0, MAX_PHOTOS)
    .map(async (entry) => {
      const file = join(directory, entry.name)
      const info = await lstat(file)
      if (!info.isFile() || info.size <= 0 || info.size > MAX_PHOTO_BYTES) return null
      return {
        name: entry.name,
        url: `/api/screensaver/${encodeURIComponent(entry.name)}`,
        updatedAt: info.mtime.toISOString(),
      }
    })))
    .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo))
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }))
}

screensaverRouter.get('/', async (c) => {
  const config = (await db.read()).config
  const screensaver = config.kiosk?.screensaver
  const sourceUrl = screensaver?.sourceUrl

  if (screensaver?.source === 'google' && isAllowedScreensaverSourceUrl(sourceUrl)) {
    try {
      const urls = await googleAlbumUrls(sourceUrl)
      const fetchedAt = new Date(albumCache?.fetchedAt ?? Date.now()).toISOString()
      c.header('Cache-Control', 'private, max-age=60')
      return c.json({
        photos: urls.map((_, index) => ({
          name: `google-${index + 1}`,
          url: `/api/screensaver/remote/${index}`,
          updatedAt: fetchedAt,
        })),
        source: 'google-photos' as const,
      })
    } catch {
      // Link revocato/markup cambiato: si degrada alla cartella locale, con
      // l'errore esposto così Funzioni può dirlo all'admin.
      try {
        const photos = await localPhotos()
        return c.json({ photos, source: 'local-folder' as const, error: 'Album Google Foto non raggiungibile' })
      } catch {
        return c.json({ photos: [], source: 'local-folder' as const, error: 'Album Google Foto non raggiungibile' })
      }
    }
  }

  try {
    const photos = await localPhotos()
    c.header('Cache-Control', 'private, max-age=60')
    return c.json({ photos, source: 'local-folder' as const })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return c.json({ photos: [], source: 'local-folder' as const })
    }
    return c.json({ error: 'Cartella screensaver non disponibile' }, 503)
  }
})

// Proxy della singola foto remota: dimensione decisa dal server (1600×1200),
// byte in cache LRU, solo host lh*.googleusercontent.com già estratti dall'album.
screensaverRouter.get('/remote/:index', async (c) => {
  const index = Number(c.req.param('index'))
  const urls = albumCache?.urls ?? []
  if (!Number.isInteger(index) || index < 0 || index >= urls.length) {
    return c.json({ error: 'Foto remota non disponibile' }, 404)
  }
  const target = photoUrlWithSize(urls[index])
  const cached = remoteImageCache.get(target)
  if (cached) {
    const body = new ArrayBuffer(cached.bytes.byteLength)
    new Uint8Array(body).set(cached.bytes)
    return new Response(body, {
      headers: { 'Content-Type': cached.contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
    })
  }
  try {
    const { response, bytes } = await fetchWithLimits(
      target,
      { method: 'GET', headers: { Accept: 'image/jpeg,image/png,image/webp,image/avif' } },
      { timeoutMs: 10_000, maxBytes: MAX_PHOTO_BYTES, maxRedirects: 2, requirePublicHttps: true },
    )
    const contentType = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
    if (!response.ok || !PHOTO_TYPES_VALUES.has(contentType) || bytes.byteLength === 0) {
      return c.json({ error: 'Foto remota non disponibile' }, 502)
    }
    remoteImageCache.set(target, { bytes, contentType })
    const body = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(body).set(bytes)
    return new Response(body, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    if (error instanceof OutboundRequestError && error.reason === 'timeout') {
      return c.json({ error: 'La foto non ha risposto in tempo' }, 504)
    }
    return c.json({ error: 'Foto remota non disponibile' }, 502)
  }
})

screensaverRouter.get('/:name', async (c) => {
  const rawName = c.req.param('name')
  const file = photoPath(rawName)
  if (!file) return c.json({ error: 'Foto non valida' }, 400)

  try {
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > MAX_PHOTO_BYTES) {
      return c.json({ error: 'Foto non disponibile' }, 404)
    }
    const etag = `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304)
    const bytes = await readFile(file)
    const contentType = PHOTO_TYPES.get(extname(rawName).toLowerCase()) ?? 'application/octet-stream'
    return new Response(bytes, {
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        ETag: etag,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return c.json({ error: 'Foto non trovata' }, 404)
    return c.json({ error: 'Foto non disponibile' }, 503)
  }
})

export const screensaverInternals = { safePhotoName, photoPath }
