import { describe, expect, it, vi } from 'vitest'
import { ALARM_PHOTO_QUEUE_KEY, acknowledgePhoto, flushPhotoQueue, enqueuePhoto, MAX_QUEUED_PHOTOS, readQueue } from './alarmPhoto'

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

  it('rimuove solo la foto confermata', () => {
    const storage = memoryStorage()
    enqueuePhoto(storage, photo('a'))
    acknowledgePhoto(storage, photo('a'))
    expect(readQueue(storage)).toEqual([])
  })

  it('tollera JSON corrotto', () => {
    const storage = memoryStorage({ [ALARM_PHOTO_QUEUE_KEY]: '{not json' })
    expect(readQueue(storage)).toEqual([])
  })
  it('retains a photo while uploading and after a failed request', async () => {
    const storage = memoryStorage()
    enqueuePhoto(storage, photo('a'))
    const upload = vi.fn(async () => {
      expect(readQueue(storage)).toEqual([photo('a')])
      throw new Error('offline')
    })
    await expect(flushPhotoQueue(storage, upload)).rejects.toThrow('offline')
    expect(readQueue(storage)).toEqual([photo('a')])
    await flushPhotoQueue(storage, async () => {})
    expect(readQueue(storage)).toEqual([])
  })
  it('preserves new entries added during an upload', async () => {
    const storage = memoryStorage()
    enqueuePhoto(storage, photo('a'))
    await flushPhotoQueue(storage, async () => { enqueuePhoto(storage, photo('b')) })
    expect(readQueue(storage)).toEqual([photo('b')])
  })
  it('deduplicates an episode and does not erase it when storage rejects acknowledgement', async () => {
    const storage = memoryStorage()
    enqueuePhoto(storage, photo('a'))
    enqueuePhoto(storage, photo('a'))
    expect(readQueue(storage)).toHaveLength(1)
    storage.setItem = () => { throw new Error('storage denied') }
    await expect(flushPhotoQueue(storage, async () => {})).rejects.toThrow('storage denied')
    expect(readQueue(storage)).toHaveLength(1)
  })

})
