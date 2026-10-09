import { describe, expect, it } from 'vitest'
import { isSpaPath } from './spa-fallback.js'

describe('SPA routing boundaries', () => {
  it.each(['/', '/kiosk', '/tablet/', '/dashboard', '/system', '/entities', '/functions', '/settings', '/memoria'])('allows document route %s', (path) => {
    expect(isSpaPath(path)).toBe(true)
  })
  it.each(['/api', '/api/missing', '/assets/missing.js', '/assets/missing.css', '/unknown', '/kiosk/missing.png'])('rejects missing resource %s', (path) => {
    expect(isSpaPath(path)).toBe(false)
  })
})
