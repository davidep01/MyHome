import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { db } from '../db/client.js'
import type { RoomEntity } from '../db/types.js'
import { desktopOnly } from '../lib/security.js'
import { cleanText, integerInRange, isEntityId, isEntityType, isRecord, SIMPLE_ID_PATTERN } from '../lib/validation.js'

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
  if (!roomId || !SIMPLE_ID_PATTERN.test(roomId)) return c.json({ error: 'Stanza non valida' }, 400)
  const body = await c.req.json<unknown>().catch(() => null)
  if (!isRecord(body)) return c.json({ error: 'Dati entità non validi' }, 400)
  const label = cleanText(body.label, 100)
  if (!isEntityId(body.entityId) || !label || !isEntityType(body.type)) return c.json({ error: 'Dati entità non validi' }, 400)
  const requestedEntityId = body.entityId
  const requestedType = body.type
  let outcome: 'created' | 'missing-room' | 'duplicate' = 'missing-room'
  let newEntity: RoomEntity | null = null
  const ok = await db.write((store) => {
    if (!store.rooms.some((room) => room.id === roomId)) {
      outcome = 'missing-room'
      return
    }
    if (store.entities.some((entity) => entity.roomId === roomId && entity.entityId === requestedEntityId)) {
      outcome = 'duplicate'
      return
    }
    const existing = store.entities.filter((entity) => entity.roomId === roomId)
    const sortOrder = existing.reduce((max, entity) => Math.max(max, entity.sortOrder), -1) + 1
    newEntity = {
      id: `${roomId}_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      roomId,
      entityId: requestedEntityId,
      label,
      type: requestedType,
      sortOrder,
    }
    store.entities.push(newEntity)
    outcome = 'created'
  })
  if (!ok) return c.json({ error: 'Entities are read-only in this deployment' }, 409)
  if (outcome === 'missing-room') return c.json({ error: 'Stanza non trovata' }, 404)
  if (outcome === 'duplicate') return c.json({ error: 'Entità già presente nella stanza' }, 409)
  if (!newEntity) return c.json({ error: 'Entità non creata' }, 500)
  return c.json(newEntity, 201)
})

// PUT /api/rooms/:roomId/entities/:entityId
entitiesRouter.put('/:entityId', async (c) => {
  const roomId = c.req.param('roomId')
  const entityId = c.req.param('entityId')
  if (!roomId || !entityId || !SIMPLE_ID_PATTERN.test(roomId) || (!isEntityId(entityId) && !SIMPLE_ID_PATTERN.test(entityId))) return c.json({ error: 'Entità non valida' }, 400)
  const body = await c.req.json<unknown>().catch(() => null)
  if (!isRecord(body)) return c.json({ error: 'Dati entità non validi' }, 400)
  const label = body.label === undefined ? undefined : cleanText(body.label, 100)
  const type = body.type === undefined ? undefined : isEntityType(body.type) ? body.type : null
  const sortOrder = body.sortOrder === undefined ? undefined : integerInRange(body.sortOrder, 0, 10_000) ? body.sortOrder : null
  if (label === null || type === null || sortOrder === null) return c.json({ error: 'Dati entità non validi' }, 400)

  let found = false
  const ok = await db.write((store) => {
    const entity = store.entities.find(
      (e) => e.roomId === roomId && (e.entityId === entityId || e.id === entityId),
    )
    if (!entity) return
    found = true
    if (label !== undefined) entity.label = label
    if (type !== undefined) entity.type = type
    if (sortOrder !== undefined) entity.sortOrder = sortOrder
  })
  if (!ok) return c.json({ error: 'Entities are read-only in this deployment' }, 409)
  if (!found) return c.json({ error: 'Entità non trovata' }, 404)
  return c.json({ ok: true })
})

// DELETE /api/rooms/:roomId/entities/:entityId
entitiesRouter.delete('/:entityId', async (c) => {
  const roomId = c.req.param('roomId')
  const entityId = c.req.param('entityId')
  if (!roomId || !entityId || !SIMPLE_ID_PATTERN.test(roomId) || (!isEntityId(entityId) && !SIMPLE_ID_PATTERN.test(entityId))) return c.json({ error: 'Entità non valida' }, 400)
  let found = false
  const ok = await db.write((store) => {
    found = store.entities.some((e) => e.roomId === roomId && (e.entityId === entityId || e.id === entityId))
    store.entities = store.entities.filter(
      (e) => !(e.roomId === roomId && (e.entityId === entityId || e.id === entityId)),
    )
  })
  if (!ok) return c.json({ error: 'Entities are read-only in this deployment' }, 409)
  if (!found) return c.json({ error: 'Entità non trovata' }, 404)
  return c.json({ ok: true })
})
