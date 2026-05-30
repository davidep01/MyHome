import { Hono } from 'hono'
import { db } from '../db/client.js'

export const roomsRouter = new Hono()

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
  const body = await c.req.json<{ label: string; icon?: string }>()
  const { rooms } = await db.read()
  const id = body.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now()
  const newRoom = {
    id,
    label: body.label,
    icon: body.icon ?? 'home',
    sortOrder: rooms.length,
  }
  const ok = await db.write((store) => { store.rooms.push(newRoom) })
  if (!ok) return c.json({ error: 'Rooms are read-only in this deployment' }, 409)
  return c.json(newRoom, 201)
})

// PUT /api/rooms/reorder — bulk reorder
roomsRouter.put('/reorder', async (c) => {
  const body = await c.req.json<{ id: string; sortOrder: number }[]>()
  const ok = await db.write((store) => {
    for (const { id, sortOrder } of body) {
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
  const body = await c.req.json<{ label?: string; icon?: string; sortOrder?: number }>()
  const ok = await db.write((store) => {
    const room = store.rooms.find((r) => r.id === id)
    if (!room) return
    if (body.label !== undefined) room.label = body.label
    if (body.icon !== undefined) room.icon = body.icon
    if (body.sortOrder !== undefined) room.sortOrder = body.sortOrder
  })
  if (!ok) return c.json({ error: 'Rooms are read-only in this deployment' }, 409)
  const room = (await db.read()).rooms.find((r) => r.id === id)
  if (!room) return c.json({ error: 'Not found' }, 404)
  return c.json(room)
})

// DELETE /api/rooms/:id — delete room + cascade entities
roomsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const ok = await db.write((store) => {
    store.rooms = store.rooms.filter((r) => r.id !== id)
    store.entities = store.entities.filter((e) => e.roomId !== id)
  })
  if (!ok) return c.json({ error: 'Rooms are read-only in this deployment' }, 409)
  return c.json({ ok: true })
})
