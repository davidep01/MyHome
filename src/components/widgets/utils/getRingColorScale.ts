export interface RingTone {
  color: string
  bg: string
  glow: string
  gradient: string
}

export const widgetTones = {
  neutral: {
    color: 'rgba(29,29,31,0.62)',
    bg: 'rgba(0,0,0,0.055)',
    glow: 'rgba(0,0,0,0.10)',
    gradient: 'linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,255,255,0.48))',
  },
  light: {
    color: '#b45309',
    bg: 'rgba(234,179,8,0.15)',
    glow: 'rgba(234,179,8,0.30)',
    gradient: 'linear-gradient(135deg, rgba(255,247,214,0.92), rgba(255,255,255,0.52))',
  },
  cool: {
    color: '#0066cc',
    bg: 'rgba(0,102,204,0.12)',
    glow: 'rgba(0,102,204,0.26)',
    gradient: 'linear-gradient(135deg, rgba(219,239,255,0.88), rgba(255,255,255,0.52))',
  },
  heat: {
    color: '#c2410c',
    bg: 'rgba(249,115,22,0.14)',
    glow: 'rgba(249,115,22,0.30)',
    gradient: 'linear-gradient(135deg, rgba(255,230,214,0.88), rgba(255,255,255,0.52))',
  },
  ok: {
    color: '#15803d',
    bg: 'rgba(21,128,61,0.12)',
    glow: 'rgba(21,128,61,0.22)',
    gradient: 'linear-gradient(135deg, rgba(220,252,231,0.88), rgba(255,255,255,0.52))',
  },
  warning: {
    color: '#b45309',
    bg: 'rgba(245,158,11,0.14)',
    glow: 'rgba(245,158,11,0.26)',
    gradient: 'linear-gradient(135deg, rgba(254,243,199,0.88), rgba(255,255,255,0.52))',
  },
  critical: {
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.13)',
    glow: 'rgba(220,38,38,0.34)',
    gradient: 'linear-gradient(135deg, rgba(254,226,226,0.92), rgba(255,255,255,0.52))',
  },
  energy: {
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.12)',
    glow: 'rgba(124,58,237,0.24)',
    gradient: 'linear-gradient(135deg, rgba(237,233,254,0.92), rgba(219,234,254,0.54))',
  },
  water: {
    color: '#0891b2',
    bg: 'rgba(8,145,178,0.12)',
    glow: 'rgba(8,145,178,0.24)',
    gradient: 'linear-gradient(135deg, rgba(207,250,254,0.88), rgba(255,255,255,0.52))',
  },
  media: {
    color: '#9333ea',
    bg: 'rgba(147,51,234,0.12)',
    glow: 'rgba(147,51,234,0.24)',
    gradient: 'linear-gradient(135deg, rgba(243,232,255,0.88), rgba(255,255,255,0.52))',
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
