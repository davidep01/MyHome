import { Hono } from 'hono'
import { db } from '../db/client.js'
import type { RoomEntity } from '../db/types.js'
import { desktopOnly } from '../lib/security.js'

export const entitiesRouter = new Hono()

entitiesRouter.use('*', desktopOnly)

// GET /api/rooms/:roomId/entities
entitiesRouter.get('/', async (c) => {
  const roomId = c.req.param('roomId')
  const { entities } = await db.read()
  return c.json(
    entities
      .filter((e) => e.roomId === roomId)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  )
})

// POST /api/rooms/:roomId/entities
entitiesRouter.post('/', async (c) => {
  const roomId = c.req.param('roomId')
  const body = await c.req.json<{ entityId: string; label: string; type: RoomEntity['type'] }>()
  const { entities } = await db.read()
  const existing = entities.filter((e) => e.roomId === roomId)

  const newEntity: RoomEntity = {
    id: `${roomId}_${body.entityId}_${Date.now()}`,
    roomId,
    entityId: body.entityId,
    label: body.label,
    type: body.type,
    sortOrder: existing.length,
  }
  const ok = await db.write((store) => { store.entities.push(newEntity) })
  if (!ok) return c.json({ error: 'Entities are read-only in this deployment' }, 409)
  return c.json(newEntity, 201)
})

// PUT /api/rooms/:roomId/entities/:entityId
entitiesRouter.put('/:entityId', async (c) => {
  const roomId = c.req.param('roomId')
  const entityId = c.req.param('entityId')
  const body = await c.req.json<{ label?: string; type?: RoomEntity['type']; sortOrder?: number }>()

  const ok = await db.write((store) => {
    const entity = store.entities.find(
      (e) => e.roomId === roomId && (e.entityId === entityId || e.id === entityId),
    )
    if (!entity) return
    if (body.label !== undefined) entity.label = body.label
    if (body.type !== undefined) entity.type = body.type
    if (body.sortOrder !== undefined) entity.sortOrder = body.sortOrder
  })
  if (!ok) return c.json({ error: 'Entities are read-only in this deployment' }, 409)
  return c.json({ ok: true })
})

// DELETE /api/rooms/:roomId/entities/:entityId
entitiesRouter.delete('/:entityId', async (c) => {
  const roomId = c.req.param('roomId')
  const entityId = c.req.param('entityId')
  const ok = await db.write((store) => {
    store.entities = store.entities.filter(
      (e) => !(e.roomId === roomId && (e.entityId === entityId || e.id === entityId)),
    )
  })
  if (!ok) return c.json({ error: 'Entities are read-only in this deployment' }, 409)
  return c.json({ ok: true })
})
