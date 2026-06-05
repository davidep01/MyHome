import { haApi } from './backend'

export async function getStates() {
  return haApi.states()
}

export async function getState(entityId: string) {
  return haApi.state(entityId)
}

export function getCameraProxyUrl(entityId: string): string {
  return haApi.cameraProxyUrl(entityId)
}

export function getCameraStreamUrl(entityId: string): string {
  return haApi.cameraStreamUrl(entityId)
}

/**
 * Rewrites an HA HLS url (`/api/hls/<token>/playlist.m3u8`) to route through the
 * backend proxy (`/api/ha/hls/...`), keeping it same-origin so the browser's HLS
 * player isn't blocked by CORS. Relative segment URLs resolve back through here.
 */
export function toProxiedHlsUrl(haRelativeUrl: string): string {
  if (haRelativeUrl.startsWith('/api/hls/')) {
    return haRelativeUrl.replace('/api/hls/', '/api/ha/hls/')
  }
  return haRelativeUrl
}

export async function postService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
) {
  return haApi.service(domain, service, data)
}
