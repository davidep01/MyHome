/**
 * Coda locale per la foto-allarme (§11): UNA foto dal tablet per evento,
 * caricata sul backend appena raggiungibile. Se la rete è giù la foto resta
 * in coda (max 3, la più vecchia decade) — mai perdere l'evento, mai
 * accumulare immagini all'infinito su un tablet a muro.
 */

export interface AlarmPhoto {
  /** data URL JPEG dalla fotocamera del tablet */
  image: string
  alertId: string
  takenAt: string
  deviceId?: string
}

export const ALARM_PHOTO_QUEUE_KEY = 'myhome.alarmPhotoQueue'
export const MAX_QUEUED_PHOTOS = 3

interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export function readQueue(storage: StorageLike): AlarmPhoto[] {
  try {
    const raw = storage.getItem(ALARM_PHOTO_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is AlarmPhoto =>
      typeof item === 'object' && item !== null
      && typeof (item as AlarmPhoto).image === 'string'
      && typeof (item as AlarmPhoto).alertId === 'string'
      && typeof (item as AlarmPhoto).takenAt === 'string')
  } catch {
    return []
  }
}

export function enqueuePhoto(storage: StorageLike, photo: AlarmPhoto): boolean {
  const queue = [...readQueue(storage).filter((entry) => entry.alertId !== photo.alertId || entry.takenAt !== photo.takenAt), photo].slice(-MAX_QUEUED_PHOTOS)
  try {
    storage.setItem(ALARM_PHOTO_QUEUE_KEY, JSON.stringify(queue))
    return true
  } catch {
    // Deliver immediately if persistence is unavailable.
    return false
  }
}

/** Remove only the acknowledged entry; preserve photos added during upload. */
export function acknowledgePhoto(storage: StorageLike, photo: AlarmPhoto): void {
  const queue = readQueue(storage).filter((entry) => entry.alertId !== photo.alertId || entry.takenAt !== photo.takenAt)
  storage.setItem(ALARM_PHOTO_QUEUE_KEY, JSON.stringify(queue))
}

export async function flushPhotoQueue(storage: StorageLike, upload: (photo: AlarmPhoto) => Promise<unknown>, shouldContinue = () => true): Promise<void> {
  for (const photo of readQueue(storage)) {
    if (!shouldContinue()) return
    await upload(photo)
    acknowledgePhoto(storage, photo)
  }
}
