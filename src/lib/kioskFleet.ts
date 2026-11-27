import type { KioskDeviceStatus } from '../api/backend'
import type { SystemProblem } from './attention'
import { durationSince } from './time'

/**
 * Un tablet conosciuto che non manda l'heartbeat è un problema di casa, non un
 * dettaglio di Sistema: il pannello a muro è il modo principale di usare
 * S.I.M.I. Il backend ricorda i tablet anche dopo un riavvio, quindi qui
 * "offline" vuol dire davvero "non risponde", non "non l'abbiamo mai visto".
 */
export function kioskOfflineProblems(devices: Pick<KioskDeviceStatus, 'deviceId' | 'name' | 'online' | 'lastSeenAt'>[], nowMs = Date.now()): SystemProblem[] {
  return devices
    .filter((device) => !device.online)
    .map((device) => {
      const label = device.name ? `Tablet «${device.name}»` : 'Tablet a muro'
      const since = durationSince(device.lastSeenAt, nowMs)
      return {
        id: `kiosk-offline:${device.deviceId}`,
        severity: 'warn' as const,
        text: `${label} non risponde${since ? ` da ${since}` : ''}: controlla che sia acceso e che Fully apra la pagina /kiosk.`,
        actionTarget: 'system' as const,
      }
    })
}
