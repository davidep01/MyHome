import type { DeviceOverride, EntityType } from '../api/backend'

export interface DeviceCategoryOption {
  value: EntityType
  label: string
  description: string
  icon: string
}

/** Tassonomia completa delle card supportate, condivisa da editor e wizard. */
export const DEVICE_CATEGORY_OPTIONS: DeviceCategoryOption[] = [
  { value: 'light', label: 'Luce', description: 'Accensione e luminosità', icon: 'lightbulb' },
  { value: 'switch', label: 'Interruttore', description: 'Comando acceso o spento', icon: 'toggle-left' },
  { value: 'climate', label: 'Clima', description: 'Temperatura e modalità', icon: 'thermometer' },
  { value: 'cover', label: 'Tapparella', description: 'Apertura e posizione', icon: 'blinds' },
  { value: 'lock', label: 'Serratura', description: 'Blocco e sicurezza', icon: 'lock' },
  { value: 'fan', label: 'Ventilazione', description: 'Velocità e modalità', icon: 'fan' },
  { value: 'media', label: 'Media', description: 'Riproduzione e volume', icon: 'play' },
  { value: 'camera', label: 'Videocamera', description: 'Flusso video e stato', icon: 'video' },
  { value: 'vacuum', label: 'Robot', description: 'Pulizia e rientro', icon: 'bot' },
  { value: 'scene', label: 'Scena', description: 'Attiva una configurazione', icon: 'sparkles' },
  { value: 'alarm', label: 'Allarme', description: 'Inserimento e stato', icon: 'shield-alert' },
  { value: 'siren', label: 'Sirena', description: 'Comando di emergenza', icon: 'badge-alert' },
  { value: 'number', label: 'Regolazione', description: 'Valore su cursore', icon: 'sliders-horizontal' },
  { value: 'select', label: 'Selettore', description: 'Scelta tra modalità', icon: 'list-check' },
  { value: 'button', label: 'Pulsante', description: 'Azione istantanea', icon: 'circle-dot' },
  { value: 'binary_sensor', label: 'Sensore stato', description: 'Aperto, chiuso o rilevato', icon: 'radar' },
  { value: 'sensor', label: 'Sensore valore', description: 'Misura e unità', icon: 'gauge' },
  { value: 'weather', label: 'Meteo', description: 'Condizioni e previsione', icon: 'cloud-sun' },
  { value: 'water_heater', label: 'Acqua calda', description: 'Temperatura e attività', icon: 'shower-head' },
  { value: 'valve', label: 'Valvola', description: 'Apertura del flusso', icon: 'circle-gauge' },
  { value: 'automation', label: 'Automazione', description: 'Regola automatica', icon: 'workflow' },
  { value: 'script', label: 'Script', description: 'Sequenza di azioni', icon: 'scroll-text' },
  { value: 'person', label: 'Persona', description: 'Presenza in casa', icon: 'user' },
  { value: 'device_tracker', label: 'Localizzatore', description: 'Posizione del dispositivo', icon: 'map-pin' },
  { value: 'security', label: 'Sicurezza', description: 'Stato di protezione', icon: 'shield-check' },
]

export interface DeviceSetupSelection {
  type?: EntityType
  areaId?: string
}

/** Applica le sole scelte del wizard, conservando ogni altra cura della card. */
export function applyDeviceSetup(
  current: DeviceOverride | undefined,
  selection: DeviceSetupSelection,
): DeviceOverride {
  const next: DeviceOverride = { ...(current ?? {}) }
  if (selection.type) next.type = selection.type
  else delete next.type
  if (selection.areaId) next.areaId = selection.areaId
  else delete next.areaId
  return next
}
