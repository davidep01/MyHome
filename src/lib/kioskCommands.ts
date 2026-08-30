import type { KioskDeviceStatus } from '../api/backend'

/**
 * Quali comandi remoti può davvero eseguire un tablet.
 *
 * `reload` e `audioTest` vivono nel browser; tutto il resto passa dall'interfaccia
 * JavaScript di Fully Kiosk. Quando quella manca, la regia mostrava comunque i
 * pulsanti e dichiarava "Comando inviato": il comando *era* stato trasmesso, ma
 * sul tablet non poteva succedere nulla. Meglio dirlo prima di premere.
 */

const BROWSER_COMMANDS = new Set(['reload', 'audioTest'])

export function commandNeedsFully(command: string): boolean {
  return !BROWSER_COMMANDS.has(command)
}

export type FleetReadiness =
  | { canRunAll: true }
  | { canRunAll: false; reason: string }

/** Perché i comandi Fully non sono disponibili su questo tablet, in italiano. */
export function fleetReadiness(device: Pick<KioskDeviceStatus, 'fully'>): FleetReadiness {
  if (device.fully === 'available') return { canRunAll: true }
  if (device.fully === 'blocked') {
    return {
      canRunAll: false,
      reason: 'Fully Kiosk è raggiungibile ma l’indirizzo aperto sul tablet non è considerato locale: apri la dashboard con l’IP della LAN.',
    }
  }
  if (device.fully === 'unavailable') {
    return {
      canRunAll: false,
      reason: 'Interfaccia JavaScript di Fully Kiosk non attiva: in Fully → Settings → Advanced Web Settings attiva “Enable JavaScript Interface”.',
    }
  }
  return {
    canRunAll: false,
    reason: 'Il tablet non ha ancora riportato lo stato di Fully Kiosk.',
  }
}

/** Etichetta leggibile dell'esito riferito dal tablet. */
export function commandResultLabel(result: { ok: boolean; reason?: string; command: string }): string {
  if (result.ok) return `“${result.command}” eseguito sul tablet`
  if (result.reason === 'no-bridge') return `“${result.command}” non eseguito: Fully Kiosk non raggiungibile dalla pagina`
  if (result.reason === 'unsupported') return `“${result.command}” non eseguito: questa versione di Fully non lo supporta`
  return `“${result.command}” non eseguito`
}
