import { describe, expect, it } from 'vitest'
import { openCoreStore } from '../storage/db.js'

describe('CoreStore', () => {
  it('applica le migrazioni e fa rollback sugli errori', async () => {
    const store = await openCoreStore(':memory:')
    store.setMeta('k', 'v')
    expect(store.getMeta('k')).toBe('v')
    expect(() => store.tx(() => { store.setMeta('x', '1'); throw new Error('boom') })).toThrow('boom')
    expect(store.getMeta('x')).toBeNull()
    store.close()
  })
})
