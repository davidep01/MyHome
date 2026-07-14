import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { Hono } from 'hono'

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

screensaverRouter.get('/', async (c) => {
  const directory = dataDirectory()
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const photos = (await Promise.all(entries
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

    c.header('Cache-Control', 'private, max-age=60')
    return c.json({ photos, source: 'local-folder' as const })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return c.json({ photos: [], source: 'local-folder' as const })
    }
    return c.json({ error: 'Cartella screensaver non disponibile' }, 503)
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
