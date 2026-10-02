import { afterEach, expect, it, vi } from 'vitest'
import { readStorage, writeStorage, removeStorage } from './browserStorage'
afterEach(() => vi.unstubAllGlobals())
it('supports denied storage getters and session deduplication without crashing', () => {
  vi.stubGlobal('window', { get sessionStorage() { throw new Error('SecurityError') } })
  writeStorage('test-episode', 'shown', 'session')
  expect(readStorage('test-episode', 'session')).toBe('shown')
  removeStorage('test-episode', 'session')
  expect(readStorage('test-episode', 'session')).toBeNull()
})
