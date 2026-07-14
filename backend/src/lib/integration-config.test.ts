import { afterEach, describe, expect, it } from 'vitest'
import { configuredIntegrations, validProviderKey } from './integration-config.js'

const originalGemini = process.env.GEMINI_API_KEY
const originalWeather = process.env.OPENWEATHER_API_KEY

afterEach(() => {
  if (originalGemini === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalGemini
  if (originalWeather === undefined) delete process.env.OPENWEATHER_API_KEY
  else process.env.OPENWEATHER_API_KEY = originalWeather
})

describe.sequential('provider configuration status', () => {
  it.each(['', '   ', 'your_api_key', 'contains whitespace'])('rejects an unusable key: %j', (value) => {
    expect(validProviderKey(value, 256)).toBeNull()
  })

  it('uses the same validity rule for the status semaphores', () => {
    process.env.GEMINI_API_KEY = 'your_gemini_key'
    process.env.OPENWEATHER_API_KEY = 'weather-key-123'
    expect(configuredIntegrations()).toEqual({ gemini: false, openweather: true })
  })
})
