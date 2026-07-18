import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { Hono } from 'hono'
import { adminOnly } from '../lib/security.js'
import {
  getSharedAlarmTest,
  startSharedAlarmTest,
  stopSharedAlarmTest,
  type AlarmTestScenario,
} from '../lib/ha-stream.js'

/**
 * Foto-allarme (§11): il kiosk carica UNA foto JPEG per evento critico
 * (opt-in in Funzioni → Emergenza). Le foto restano nello storage locale
 * dell'installazione (/data su add-on HA) — nessun cloud esterno — e solo
 * l'admin può elencarle e vederle. Retention: le ultime 40.
 */

const MAX_STORED_PHOTOS = 40
const MAX_IMAGE_DATAURL_LENGTH = 6 * 1024 * 1024
const DATA_URL_PATTERN = /^data:image\/jpeg;base64,([a-z0-9+/]+=*)$/i
const SAFE_META_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,119}$/i
const PHOTO_NAME_PATTERN = /^[0-9]{8}T[0-9]{6}-[a-z0-9-]{1,40}\.jpg$/

function writesAllowed(): boolean {
  return process.env.MYHOME_READ_ONLY !== 'true'
}

function dataDirectory(): string {
  if (process.env.MYHOME_ALARM_DIR?.trim()) return resolve(process.env.MYHOME_ALARM_DIR.trim())
  if (process.env.MYHOME_DB_PATH?.trim()) return join(dirname(resolve(process.env.MYHOME_DB_PATH.trim())), 'alarm')
  return resolve(process.cwd(), 'backend/data/alarm')
}

function photoPath(name: string): string | null {
  if (!PHOTO_NAME_PATTERN.test(name) || basename(name) !== name) return null
  const directory = dataDirectory()
  const candidate = resolve(directory, name)
  return candidate.startsWith(`${directory}/`) ? candidate : null
}

async function prunePhotos(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true })
  const photos = entries
    .filter((entry) => entry.isFile() && PHOTO_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  const excess = photos.length - MAX_STORED_PHOTOS
  for (let i = 0; i < excess; i += 1) {
    await rm(join(directory, photos[i]), { force: true })
  }
}

export const alarmRouter = new Hono()

const ALARM_TEST_SCENARIOS = new Set<AlarmTestScenario>(['intrusion', 'siren', 'smoke'])

/** Current state is kiosk-readable so REST fallback clients still converge. */
alarmRouter.get('/test', (c) => c.json(getSharedAlarmTest()))

alarmRouter.post('/test', adminOnly, async (c) => {
  const body = await c.req.json<{ scenario?: unknown }>().catch(() => null)
  if (!body || typeof body.scenario !== 'string' || !ALARM_TEST_SCENARIOS.has(body.scenario as AlarmTestScenario)) {
    return c.json({ error: 'Scenario test non valido' }, 400)
  }
  return c.json({ active: true as const, ...startSharedAlarmTest(body.scenario as AlarmTestScenario), serverNow: new Date().toISOString() })
})

// Any authenticated kiosk may end a harmless simulation from its own overlay.
alarmRouter.delete('/test', (c) => {
  stopSharedAlarmTest()
  return c.json({ ok: true as const })
})

alarmRouter.post('/photo', async (c) => {
  if (!writesAllowed()) return c.json({ error: 'Storage in sola lettura' }, 403)
  const body = await c.req.json<{ image?: unknown; alertId?: unknown; takenAt?: unknown; deviceId?: unknown }>().catch(() => null)
  if (!body || typeof body.image !== 'string' || body.image.length > MAX_IMAGE_DATAURL_LENGTH) {
    return c.json({ error: 'Foto non valida' }, 400)
  }
  const match = DATA_URL_PATTERN.exec(body.image)
  if (!match) return c.json({ error: 'Foto non valida' }, 400)
  if (body.alertId !== undefined && (typeof body.alertId !== 'string' || !SAFE_META_PATTERN.test(body.alertId))) {
    return c.json({ error: 'Evento non valido' }, 400)
  }
  const takenAt = typeof body.takenAt === 'string' ? Date.parse(body.takenAt) : Date.now()
  const when = Number.isFinite(takenAt) ? new Date(takenAt) : new Date()

  const bytes = Buffer.from(match[1], 'base64')
  if (bytes.byteLength < 128) return c.json({ error: 'Foto non valida' }, 400)

  const stamp = when.toISOString().replace(/[-:.]/g, '').slice(0, 15) // YYYYMMDDTHHmmss
  const name = `${stamp}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const directory = dataDirectory()
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, name), bytes, { mode: 0o600 })
    await prunePhotos(directory)
    return c.json({ ok: true as const })
  } catch {
    return c.json({ error: 'Salvataggio della foto non riuscito' }, 503)
  }
})

alarmRouter.get('/photos', adminOnly, async (c) => {
  const directory = dataDirectory()
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const photos = (await Promise.all(entries
      .filter((entry) => entry.isFile() && PHOTO_NAME_PATTERN.test(entry.name))
      .map(async (entry) => {
        const info = await lstat(join(directory, entry.name))
        if (!info.isFile() || info.size <= 0) return null
        return {
          name: entry.name,
          url: `/api/alarm/photo/${encodeURIComponent(entry.name)}`,
          takenAt: info.mtime.toISOString(),
        }
      })))
      .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo))
      .sort((a, b) => b.name.localeCompare(a.name))
    return c.json({ photos })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return c.json({ photos: [] })
    return c.json({ error: 'Archivio foto non disponibile' }, 503)
  }
})

alarmRouter.get('/photo/:name', adminOnly, async (c) => {
  const file = photoPath(c.req.param('name'))
  if (!file) return c.json({ error: 'Foto non valida' }, 400)
  try {
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || info.size <= 0) return c.json({ error: 'Foto non trovata' }, 404)
    const bytes = await readFile(file)
    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return c.json({ error: 'Foto non disponibile' }, 503)
  }
})

export const alarmInternals = { photoPath, dataDirectory }
