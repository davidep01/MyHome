const BASE = import.meta.env.VITE_HA_URL ?? 'http://homeassistant.local:8123'
const TOKEN = import.meta.env.VITE_HA_TOKEN ?? ''

const headers = () => ({
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
})

export async function getStates() {
  const res = await fetch(`${BASE}/api/states`, { headers: headers() })
  if (!res.ok) throw new Error(`HA REST error: ${res.status}`)
  return res.json()
}

export async function getState(entityId: string) {
  const res = await fetch(`${BASE}/api/states/${entityId}`, { headers: headers() })
  if (!res.ok) throw new Error(`HA REST error: ${res.status}`)
  return res.json()
}

export function getCameraProxyUrl(entityId: string): string {
  return `${BASE}/api/camera_proxy/${entityId}?token=${TOKEN}`
}

export async function postService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
) {
  const res = await fetch(`${BASE}/api/services/${domain}/${service}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data ?? {}),
  })
  if (!res.ok) throw new Error(`HA REST error: ${res.status}`)
  return res.json()
}
