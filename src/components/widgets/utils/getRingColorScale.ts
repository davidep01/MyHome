/**
 * Palette funzionale delle card — SOLO colori di stato dal design system.
 * Il colore vive nell'icona e nella riga di stato, mai come lavaggio di fondo:
 * niente gradienti per famiglia, niente secondo colore brand (il viola è
 * riservato al solo bottone AI).
 */
export interface RingTone {
  color: string
  bg: string
  glow: string
}

export const widgetTones = {
  neutral: {
    color: 'rgba(29,29,31,0.62)',
    bg: 'rgba(0,0,0,0.05)',
    glow: 'rgba(0,0,0,0.10)',
  },
  /** Lampadine accese — l'ambra alla HomeKit, l'unica eccezione "calda". */
  light: {
    color: '#b45309',
    bg: 'rgba(234,179,8,0.15)',
    glow: 'rgba(234,179,8,0.30)',
  },
  /** Freddo / azione — l'accento blu unico del design system. */
  cool: {
    color: '#0066cc',
    bg: 'rgba(0,102,204,0.12)',
    glow: 'rgba(0,102,204,0.26)',
  },
  heat: {
    color: '#c2410c',
    bg: 'rgba(249,115,22,0.14)',
    glow: 'rgba(249,115,22,0.30)',
  },
  ok: {
    color: '#15803d',
    bg: 'rgba(21,128,61,0.12)',
    glow: 'rgba(21,128,61,0.22)',
  },
  warning: {
    color: '#b45309',
    bg: 'rgba(245,158,11,0.14)',
    glow: 'rgba(245,158,11,0.26)',
  },
  critical: {
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.13)',
    glow: 'rgba(220,38,38,0.34)',
  },
  /** Energia/consumi: ambra calda, non viola. */
  energy: {
    color: '#b45309',
    bg: 'rgba(245,158,11,0.14)',
    glow: 'rgba(245,158,11,0.26)',
  },
  water: {
    color: '#0891b2',
    bg: 'rgba(8,145,178,0.12)',
    glow: 'rgba(8,145,178,0.24)',
  },
  /** Media/scene: l'accento blu — il viola non è un colore di MyHome. */
  media: {
    color: '#0066cc',
    bg: 'rgba(0,102,204,0.12)',
    glow: 'rgba(0,102,204,0.26)',
  },
}

export function temperatureTone(value: number | undefined): RingTone {
  if (value === undefined || Number.isNaN(value)) return widgetTones.neutral
  if (value < 19) return widgetTones.cool
  if (value < 25) return widgetTones.ok
  if (value < 29) return widgetTones.heat
  return widgetTones.critical
}

export function batteryTone(value: number | undefined): RingTone {
  if (value === undefined || Number.isNaN(value)) return widgetTones.neutral
  if (value > 60) return widgetTones.ok
  if (value > 30) return widgetTones.warning
  if (value > 15) return widgetTones.heat
  return widgetTones.critical
}

export function airQualityTone(value: number | undefined): RingTone {
  if (value === undefined || Number.isNaN(value)) return widgetTones.neutral
  if (value < 800) return widgetTones.ok
  if (value < 1200) return widgetTones.warning
  if (value < 1800) return widgetTones.heat
  return widgetTones.critical
}

export function securityTone(ok: boolean, warning = false): RingTone {
  if (warning) return widgetTones.warning
  return ok ? widgetTones.ok : widgetTones.critical
}
