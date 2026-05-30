import { db } from '../db/client.js'

function envValue(key: string): string {
  const value = process.env[key] ?? ''
  if (!value || value.startsWith('your_') || value === '***') return ''
  return value
}

export async function getHAConfig() {
  const { config } = await db.read()
  const envUrl = envValue('HA_URL') || envValue('VITE_HA_URL')
  const envToken = envValue('HA_TOKEN') || envValue('VITE_HA_TOKEN')

  return {
    haUrl: envUrl || config.haUrl || 'http://homeassistant.local:8123',
    haToken: envToken || config.haToken,
    source: {
      url: envUrl ? 'env' : config.haUrl ? 'db' : 'default',
      token: envToken ? 'env' : config.haToken ? 'db' : 'missing',
    },
    locked: {
      haUrl: Boolean(envUrl),
      haToken: Boolean(envToken),
    },
  }
}

export async function getHABaseUrl() {
  return (await getHAConfig()).haUrl.replace(/\/$/, '')
}
