const DEFAULT_BACKOFF_MS = 5 * 60_000

/**
 * Circuit breaker condiviso dalle card della stessa camera. Quando Home
 * Assistant rifiuta la segnalazione ICE, le nuove card saltano temporaneamente
 * WebRTC e passano direttamente a HLS/MJPEG invece di ripetere la raffica.
 */
export class CameraWebRtcHealth {
  private readonly blockedUntil = new Map<string, number>()

  canAttempt(entityId: string, now = Date.now()): boolean {
    const until = this.blockedUntil.get(entityId)
    if (until === undefined) return true
    if (until > now) return false
    this.blockedUntil.delete(entityId)
    return true
  }

  recordFailure(entityId: string, now = Date.now(), backoffMs = DEFAULT_BACKOFF_MS): void {
    this.blockedUntil.set(entityId, now + Math.max(1_000, backoffMs))
  }

  recordSuccess(entityId: string): void {
    this.blockedUntil.delete(entityId)
  }

  reset(): void {
    this.blockedUntil.clear()
  }
}

export const cameraWebRtcHealth = new CameraWebRtcHealth()

