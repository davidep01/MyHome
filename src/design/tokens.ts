export const tokens = {
  blur: {
    glass: 'blur(24px) saturate(160%)',
    heavy: 'blur(40px) saturate(180%)',
    light: 'blur(12px) saturate(140%)',
  },
  bg: {
    page: '#08080f',
    glass: 'rgba(15, 15, 25, 0.55)',
    glassHover: 'rgba(20, 20, 35, 0.65)',
    glassActive: 'rgba(255, 255, 255, 0.06)',
    sidebar: 'rgba(10, 10, 18, 0.7)',
  },
  border: {
    glass: 'rgba(255, 255, 255, 0.10)',
    glassStrong: 'rgba(255, 255, 255, 0.18)',
  },
  text: {
    primary: '#f0f0f5',
    secondary: 'rgba(240, 240, 245, 0.55)',
    tertiary: 'rgba(240, 240, 245, 0.30)',
  },
  accent: {
    blue: '#3b82f6',
    blueGlow: 'rgba(59, 130, 246, 0.35)',
    orange: '#f97316',
    orangeGlow: 'rgba(249, 115, 22, 0.35)',
    green: '#22c55e',
    greenGlow: 'rgba(34, 197, 94, 0.30)',
    red: '#ef4444',
    purple: '#a855f7',
    yellow: '#eab308',
  },
  domainColors: {
    light: { color: '#eab308', glow: 'rgba(234, 179, 8, 0.30)', bg: 'rgba(234, 179, 8, 0.18)' },
    climateHeat: { color: '#f97316', glow: 'rgba(249, 115, 22, 0.35)', bg: 'rgba(249, 115, 22, 0.16)' },
    climateCool: { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.35)', bg: 'rgba(59, 130, 246, 0.16)' },
    cover: { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.30)', bg: 'rgba(168, 85, 247, 0.16)' },
    media: { color: '#22c55e', glow: 'rgba(34, 197, 94, 0.30)', bg: 'rgba(34, 197, 94, 0.16)' },
    security: { color: '#ef4444', glow: 'rgba(239, 68, 68, 0.35)', bg: 'rgba(239, 68, 68, 0.16)' },
    switch: { color: '#22c55e', glow: 'rgba(34, 197, 94, 0.30)', bg: 'rgba(34, 197, 94, 0.16)' },
    sensor: { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.25)', bg: 'rgba(59, 130, 246, 0.14)' },
  },
  radius: {
    card: '24px',
    inner: '14px',
    pill: '999px',
    sm: '10px',
  },
  spring: 'cubic-bezier(0.25, 1, 0.5, 1)',
  springBounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
}

export type DomainColorKey = keyof typeof tokens.domainColors

export function domainAccent(key: DomainColorKey) {
  return tokens.domainColors[key]
}

export const framerSpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
}

export const framerSpringBounce = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 25,
}
