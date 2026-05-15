import { useCallback } from 'react'
import { callService } from '../api/ha-websocket'

export function useHAService() {
  const call = useCallback(
    (domain: string, service: string, data?: Record<string, unknown>) =>
      callService(domain, service, data),
    [],
  )
  return { call }
}
