import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/backend'
import { clearTabletLayoutCache, layoutCacheEpoch, temporaryLayoutFailure, validateCachedLayout, writeCachedLayout } from './tabletLayoutCache'
const valid = {
  haGeneration: '00000000-0000-4000-8000-000000000001', schemaVersion: 3, dashboardId: 'home', layoutVersion: 1, updatedAt: '2026-10-02T10:00:00Z', updatedBy: 'tablet',
  widgets: [{ id: 'clock', type: 'clock', size: 'sm' }],
  layout: { cols: 3, rowHeight: 38, items: { clock: { x: 0, y: 0, w: 1, h: 3 } }, order: ['clock'] },
  userName: 'Casa', dashboardName: 'S.I.M.I.', groups: [], doorbells: [], deviceOverrides: {},
}
afterEach(() => vi.unstubAllGlobals())
describe('offline layout cache', () => {
  it('requires valid geometry, metadata and projected configuration', () => {
    expect(validateCachedLayout(valid, 'home')).toBe(true)
    expect(validateCachedLayout({ schemaVersion: 3 }, 'home')).toBe(false)
    expect(validateCachedLayout(valid, 'other')).toBe(false)
    expect(validateCachedLayout({ ...valid, kiosk: { homeMode: 'broken' } }, 'home')).toBe(false)
    expect(validateCachedLayout({ ...valid, layout: { ...valid.layout, items: { clock: { x: 3, y: 0, w: 1, h: 3 } } } }, 'home')).toBe(false)
    expect(validateCachedLayout({ ...valid, groups: null }, 'home')).toBe(false)
  })
  it('never falls back on authentication, validation or malformed JSON errors', () => {
    for (const status of [400, 401, 403, 404, 409]) expect(temporaryLayoutFailure(new ApiError('errore', status))).toBe(false)
    expect(temporaryLayoutFailure(new SyntaxError('invalid JSON'))).toBe(false)
    expect(temporaryLayoutFailure(new TypeError('fetch failed'))).toBe(true)
    expect(temporaryLayoutFailure(new ApiError('offline', 503))).toBe(true)
  })
  it('removes persisted layouts and refuses late writes after session revocation', () => {
    const values = new Map([['myhome.kiosk.layout.home', 'cached'], ['other', 'preserve']])
    const setItem = vi.fn((key: string, value: string) => { values.set(key, value) })
    vi.stubGlobal('window', { localStorage: {
      get length() { return values.size }, key: (index: number) => [...values.keys()][index],
      removeItem: (key: string) => { values.delete(key) }, setItem,
    } })
    const before = layoutCacheEpoch()
    clearTabletLayoutCache()
    expect(values.has('myhome.kiosk.layout.home')).toBe(false)
    expect(values.get('other')).toBe('preserve')
    writeCachedLayout('home', valid as never, before)
    expect(setItem).not.toHaveBeenCalled()
  })
})
