export const tokens = {
  blur: {
    glass: 'blur(20px) saturate(180%)',
    heavy: 'blur(30px) saturate(180%)',
    light: 'blur(12px) saturate(150%)',
  },
  bg: {
    page: 'var(--canvas-page)',
    glass: 'var(--canvas-card)',
    glassHover: 'var(--canvas-card-hover)',
    glassActive: 'var(--fill-subtle)',
    sidebar: 'var(--canvas-card)',
  },
  border: {
    glass: 'var(--hairline)',
    glassStrong: 'var(--hairline-strong)',
  },
  text: {
    // Apple ink ladder: #1d1d1f primary, #6e6e73 secondary, #86868b tertiary
    primary: 'var(--ink)',
    secondary: 'var(--ink-secondary)',
    tertiary: 'var(--ink-tertiary)',
  },
  accent: {
    // Single Action Blue is the interactive accent; the rest are functional state tints.
    blue: 'var(--action-blue)',
    blueGlow: 'rgba(0, 102, 204, 0.18)',
    orange: 'var(--alert-orange)',
    orangeGlow: 'rgba(194, 65, 12, 0.18)',
    green: 'var(--ok-green)',
    greenGlow: 'rgba(21, 128, 61, 0.16)',
    red: 'var(--danger-red)',
    purple: '#7c3aed',
    yellow: 'var(--offline-amber)',
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
