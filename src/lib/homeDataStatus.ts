import type { HAConnectionStatus } from '../store/entities'

/** Absence of alerts is only meaningful when HA is connected and hydrated. */
export function homeDataStatus(status: HAConnectionStatus, entityCount: number, hydrated = entityCount > 0): { label: string; detail: string } | null {
  if (status !== 'connected') {
    return { label: 'Stato da verificare', detail: entityCount ? 'Ultimi dati noti: Home Assistant non connesso' : 'In attesa dei dati di Home Assistant' }
  }
  if (!hydrated && entityCount) return { label: 'Stato da verificare', detail: 'In attesa di una nuova sincronizzazione completa di Home Assistant' }
  if (!entityCount) return { label: 'Nessun dato disponibile', detail: 'Home Assistant non ha fornito entità da verificare' }
  return null
}
