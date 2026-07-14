export const KIOSK_ACTIVITY_EVENT = 'myhome:kiosk-activity'
export const KIOSK_SCREENSAVER_EVENT = 'myhome:kiosk-screensaver'

export interface KioskScreensaverDetail {
  active: boolean
  brightness: number
}

function clampBrightness(value: number): number {
  if (!Number.isFinite(value)) return 28
  return Math.round(Math.min(255, Math.max(0, value)))
}

export function markKioskActivity(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(KIOSK_ACTIVITY_EVENT))
}

export function reportKioskScreensaver(active: boolean, brightness: number): void {
  if (typeof window === 'undefined') return
  const detail: KioskScreensaverDetail = { active, brightness: clampBrightness(brightness) }
  window.dispatchEvent(new CustomEvent<KioskScreensaverDetail>(KIOSK_SCREENSAVER_EVENT, { detail }))
}

export function onKioskActivity(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(KIOSK_ACTIVITY_EVENT, listener)
  return () => window.removeEventListener(KIOSK_ACTIVITY_EVENT, listener)
}

export function onKioskScreensaver(listener: (detail: KioskScreensaverDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handle = (event: Event) => {
    if (!(event instanceof CustomEvent)) return
    const detail = event.detail as Partial<KioskScreensaverDetail> | null
    if (!detail || typeof detail.active !== 'boolean' || typeof detail.brightness !== 'number') return
    listener({ active: detail.active, brightness: clampBrightness(detail.brightness) })
  }
  window.addEventListener(KIOSK_SCREENSAVER_EVENT, handle)
  return () => window.removeEventListener(KIOSK_SCREENSAVER_EVENT, handle)
}
