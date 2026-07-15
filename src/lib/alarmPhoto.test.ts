import { describe, expect, it } from 'vitest'
import { ALARM_PHOTO_QUEUE_KEY, drainQueue, enqueuePhoto, MAX_QUEUED_PHOTOS, readQueue } from './alarmPhoto'

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
  }
}

const photo = (id: string) => ({ image: `data:image/jpeg;base64,${id}`, alertId: id, takenAt: '2026-07-15T10:00:00Z' })

describe('alarmPhoto queue', () => {
  it('accoda e rilegge', () => {
    const storage = memoryStorage()
    enqueuePhoto(storage, photo('a'))
    enqueuePhoto(storage, photo('b'))
    expect(readQueue(storage).map((p) => p.alertId)).toEqual(['a', 'b'])
  })

  it('la più vecchia decade oltre il limite', () => {
    const storage = memoryStorage()
    for (const id of ['a', 'b', 'c', 'd']) enqueuePhoto(storage, photo(id))
    const queue = readQueue(storage)
    expect(queue).toHaveLength(MAX_QUEUED_PHOTOS)
    expect(queue.map((p) => p.alertId)).toEqual(['b', 'c', 'd'])
  })

  it('drain svuota la coda', () => {
    const storage = memoryStorage()
    enqueuePhoto(storage, photo('a'))
    expect(drainQueue(storage).map((p) => p.alertId)).toEqual(['a'])
    expect(readQueue(storage)).toEqual([])
  })

  it('tollera JSON corrotto', () => {
    const storage = memoryStorage({ [ALARM_PHOTO_QUEUE_KEY]: '{not json' })
    expect(readQueue(storage)).toEqual([])
  })
})
