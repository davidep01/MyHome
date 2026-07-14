import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { db } from '../db/client.js'
import type { Room } from '../db/types.js'
import { desktopOnly } from '../lib/security.js'
import { cleanText, integerInRange, isIconName, isRecord, SIMPLE_ID_PATTERN } from '../lib/validation.js'

export const roomsRouter = new Hono()

roomsRouter.use('*', desktopOnly)

// GET /api/rooms — all rooms with their entities, sorted
roomsRouter.get('/', async (c) => {
  const { rooms, entities } = await db.read()
  const sorted = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder)
  const result = sorted.map((room) => ({
    ...room,
    entities: entities
      .filter((e) => e.roomId === room.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }))
  return c.json(result)
})

// POST /api/rooms — create room
roomsRouter.post('/', async (c) => {
  const body = await c.req.json<unknown>().catch(() => null)
  if (!isRecord(body)) return c.json({ error: 'Dati stanza non validi' }, 400)
  const label = cleanText(body.label, 80)
  const icon = body.icon === undefined ? 'home' : isIconName(body.icon) ? body.icon : null
  if (!label || !icon) return c.json({ error: 'Nome o icona della stanza non validi' }, 400)
  const slug = label.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 48) || 'stanza'
  let newRoom: Omit<Room, 'entities'> | null = null
  const ok = await db.write((store) => {
    const sortOrder = store.rooms.reduce((max, room) => Math.max(max, room.sortOrder), -1) + 1
    newRoom = {
      id: `${slug}_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      label,
      icon,
      sortOrder,
    }
    store.rooms.push(newRoom)
  })
  if (!ok) return c.json({ error: 'Rooms are read-only in this deployment' }, 409)
  if (!newRoom) return c.json({ error: 'Stanza non creata' }, 500)
  return c.json(newRoom, 201)
})

// PUT /api/rooms/reorder — bulk reorder
roomsRouter.put('/reorder', async (c) => {
  const body = await c.req.json<unknown>().catch(() => null)
  if (!Array.isArray(body) || body.length > 200) return c.json({ error: 'Ordinamento non valido' }, 400)
  const seen = new Set<string>()
  for (const item of body) {
    if (!isRecord(item) || typeof item.id !== 'string' || !SIMPLE_ID_PATTERN.test(item.id) || seen.has(item.id) || !integerInRange(item.sortOrder, 0, 10_000)) {
      return c.json({ error: 'Ordinamento non valido' }, 400)
    }
    seen.add(item.id)
  }
  const ok = await db.write((store) => {
    for (const { id, sortOrder } of body as { id: string; sortOrder: number }[]) {
      const room = store.rooms.find((r) => r.id === id)
      if (room) room.sortOrder = sortOrder
    }
  })
  if (!ok) return c.json({ error: 'Rooms are read-only in this deployment' }, 409)
  return c.json({ ok: true })
})

// PUT /api/rooms/:id — update label/icon
roomsRouter.put('/:id', async (c) => {
  const id = c.req.param('id')
  if (!SIMPLE_ID_PATTERN.test(id)) return c.json({ error: 'Stanza non valida' }, 400)
  const body = await c.req.json<unknown>().catch(() => null)
  if (!isRecord(body)) return c.json({ error: 'Dati stanza non validi' }, 400)
  const label = body.label === undefined ? undefined : cleanText(body.label, 80)
  const icon = body.icon === undefined ? undefined : isIconName(body.icon) ? body.icon : null
  const sortOrder = body.sortOrder === undefined ? undefined : integerInRange(body.sortOrder, 0, 10_000) ? body.sortOrder : null
  if (label === null || icon === null || sortOrder === null) return c.json({ error: 'Dati stanza non validi' }, 400)
  let found = false
  const ok = await db.write((store) => {
    const room = store.rooms.find((r) => r.id === id)
    if (!room) return
    found = true
    if (label !== undefined) room.label = label
    if (icon !== undefined) room.icon = icon
    if (sortOrder !== undefined) room.sortOrder = sortOrder
  })
  if (!ok) return c.json({ error: 'Rooms are read-only in this deployment' }, 409)
  if (!found) return c.json({ error: 'Stanza non trovata' }, 404)
  const room = (await db.read()).rooms.find((r) => r.id === id)
  if (!room) return c.json({ error: 'Not found' }, 404)
  return c.json(room)
})

// DELETE /api/rooms/:id — delete room + cascade entities
roomsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!SIMPLE_ID_PATTERN.test(id)) return c.json({ error: 'Stanza non valida' }, 400)
  let found = false
  const ok = await db.write((store) => {
    found = store.rooms.some((room) => room.id === id)
    store.rooms = store.rooms.filter((r) => r.id !== id)
    store.entities = store.entities.filter((e) => e.roomId !== id)
  })
  if (!ok) return c.json({ error: 'Rooms are read-only in this deployment' }, 409)
  if (!found) return c.json({ error: 'Stanza non trovata' }, 404)
  return c.json({ ok: true })
})
