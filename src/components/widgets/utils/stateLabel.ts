/**
 * Traduzione italiana degli stati Home Assistant per le card.
 * Copre ogni dominio supportato + i meteo; gli stati ignoti degradano
 * con grazia a "snake_case → parole".
 */
const STATE_LABELS: Record<string, string> = {
  // generici
  on: 'Acceso',
  off: 'Spento',
  unavailable: 'Non disponibile',
  unknown: 'Sconosciuto',
  idle: 'Inattivo',
  active: 'Attivo',
  standby: 'Standby',
  // aperture (cover, valve, porte/finestre)
  open: 'Aperta',
  opening: 'In apertura',
  closed: 'Chiusa',
  closing: 'In chiusura',
  stopped: 'Ferma',
  // serrature
  locked: 'Bloccata',
  unlocked: 'Sbloccata',
  locking: 'In blocco',
  unlocking: 'In sblocco',
  jammed: 'Inceppata',
  // media
  playing: 'In riproduzione',
  paused: 'In pausa',
  buffering: 'Caricamento',
  // presenza
  home: 'A casa',
  not_home: 'Fuori casa',
  away: 'Fuori casa',
  // clima (modi e azioni)
  heat: 'Riscaldamento',
  cool: 'Raffrescamento',
  heat_cool: 'Auto',
  auto: 'Auto',
  dry: 'Deumidifica',
  fan_only: 'Ventilazione',
  heating: 'In riscaldamento',
  cooling: 'In raffrescamento',
  drying: 'Deumidifica',
  fan: 'Ventilazione',
  // robot (vacuum / lawn_mower)
  cleaning: 'Pulizia in corso',
  mowing: 'Taglio in corso',
  docked: 'In base',
  returning: 'Rientro alla base',
  error: 'Errore',
  // allarme
  armed_home: 'Inserito (casa)',
  armed_away: 'Inserito (fuori)',
  armed_night: 'Inserito (notte)',
  armed_vacation: 'Inserito (vacanza)',
  armed_custom_bypass: 'Inserito',
  disarmed: 'Disinserito',
  arming: 'Inserimento…',
  disarming: 'Disinserimento…',
  pending: 'In attesa',
  triggered: 'ALLARME',
  // camera
  recording: 'Registrazione',
  streaming: 'Live',
  // sole
  above_horizon: 'Giorno',
  below_horizon: 'Notte',
  // meteo (weather.*)
  sunny: 'Soleggiato',
  'clear-night': 'Sereno',
  cloudy: 'Nuvoloso',
  partlycloudy: 'Parz. nuvoloso',
  rainy: 'Pioggia',
  pouring: 'Pioggia forte',
  snowy: 'Neve',
  'snowy-rainy': 'Nevischio',
  fog: 'Nebbia',
  windy: 'Vento',
  'windy-variant': 'Vento forte',
  hail: 'Grandine',
  lightning: 'Temporale',
  'lightning-rainy': 'Temporale',
  exceptional: 'Allerta meteo',
}

export function stateLabel(state?: string | null): string {
  if (!state) return '—'
  return STATE_LABELS[state] ?? state.replace(/_/g, ' ')
}
