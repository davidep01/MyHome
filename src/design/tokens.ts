export const tokens = {
  blur: {
    glass: 'blur(20px) saturate(180%)',
    heavy: 'blur(30px) saturate(180%)',
    light: 'blur(12px) saturate(150%)',
  },
  bg: {
    page: '#f5f5f7',
    glass: 'rgba(255, 255, 255, 0.72)',
    glassHover: 'rgba(255, 255, 255, 0.88)',
    glassActive: 'rgba(0, 0, 0, 0.04)',
    sidebar: 'rgba(255, 255, 255, 0.72)',
  },
  border: {
    glass: 'rgba(0, 0, 0, 0.08)',
    glassStrong: 'rgba(0, 0, 0, 0.12)',
  },
  text: {
    // Apple ink ladder: #1d1d1f primary, #6e6e73 secondary, #86868b tertiary
    primary: '#1d1d1f',
    secondary: 'rgba(29, 29, 31, 0.60)',
    tertiary: 'rgba(29, 29, 31, 0.42)',
  },
  accent: {
    // Single Action Blue is the interactive accent; the rest are functional state tints.
    blue: '#0066cc',
    blueGlow: 'rgba(0, 102, 204, 0.18)',
    orange: '#c2410c',
    orangeGlow: 'rgba(194, 65, 12, 0.18)',
    green: '#15803d',
    greenGlow: 'rgba(21, 128, 61, 0.16)',
    red: '#dc2626',
    purple: '#7c3aed',
    yellow: '#b45309',
  },
  domainColors: {
    light: { color: '#b45309', glow: 'rgba(180, 83, 9, 0.16)', bg: 'rgba(234, 179, 8, 0.14)' },
    climateHeat: { color: '#c2410c', glow: 'rgba(194, 65, 12, 0.18)', bg: 'rgba(249, 115, 22, 0.12)' },
    climateCool: { color: '#0066cc', glow: 'rgba(0, 102, 204, 0.18)', bg: 'rgba(0, 102, 204, 0.10)' },
    cover: { color: '#7c3aed', glow: 'rgba(124, 58, 237, 0.16)', bg: 'rgba(124, 58, 237, 0.10)' },
    media: { color: '#15803d', glow: 'rgba(21, 128, 61, 0.16)', bg: 'rgba(21, 128, 61, 0.10)' },
    security: { color: '#dc2626', glow: 'rgba(220, 38, 38, 0.18)', bg: 'rgba(220, 38, 38, 0.10)' },
    switch: { color: '#15803d', glow: 'rgba(21, 128, 61, 0.16)', bg: 'rgba(21, 128, 61, 0.10)' },
    sensor: { color: '#0066cc', glow: 'rgba(0, 102, 204, 0.14)', bg: 'rgba(0, 102, 204, 0.08)' },
  },
  radius: {
    card: '18px',
    inner: '11px',
    pill: '999px',
    sm: '8px',
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
