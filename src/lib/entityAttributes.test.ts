import { describe, expect, it } from 'vitest'
import { isSensitiveEntityAttribute } from './entityAttributes'

describe('entity attribute privacy', () => {
  it('hides camera tokens and credentials', () => {
    expect(isSensitiveEntityAttribute('access_token')).toBe(true)
    expect(isSensitiveEntityAttribute('api-key')).toBe(true)
    expect(isSensitiveEntityAttribute('refresh token')).toBe(true)
    expect(isSensitiveEntityAttribute('temperature')).toBe(false)
  })
})
