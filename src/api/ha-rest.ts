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

export async function postService(
  domain: string,
  service: string,
  data?: Record<string, unknown>,
) {
  return haApi.service(domain, service, data)
}
