export type PhotoOrientation = 'unknown' | 'landscape' | 'portrait' | 'square'

export interface CenteredKenBurnsMove {
  x: [string, string]
  y: [string, string]
  foregroundScale: [number, number]
  backdropScale: [number, number]
}

export function photoOrientation(width: number, height: number): PhotoOrientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'unknown'
  const ratio = width / height
  if (ratio > 1.08) return 'landscape'
  if (ratio < 0.92) return 'portrait'
  return 'square'
}

/**
 * Every movement ends at the optical centre. Vertical photos stay entirely
 * visible above a blurred cover layer; horizontal and square photos use cover
 * and start slightly overscanned, so the physical display is always filled.
 */
export function centeredKenBurnsMove(index: number, orientation: PhotoOrientation): CenteredKenBurnsMove {
  const direction = index % 2 === 0 ? -1 : 1
  if (orientation === 'portrait') {
    return {
      x: ['0%', '0%'],
      y: [`${direction * 0.9}%`, '0%'],
      foregroundScale: [0.965, 1],
      backdropScale: [1.08, 1.15],
    }
  }
  if (orientation === 'square') {
    return {
      x: [`${direction * 0.65}%`, '0%'],
      y: [`${direction * -0.5}%`, '0%'],
      foregroundScale: [1.035, 1],
      backdropScale: [1.08, 1.14],
    }
  }
  if (orientation === 'landscape') {
    return {
      x: [`${direction * 0.8}%`, '0%'],
      y: [`${direction * 0.35}%`, '0%'],
      foregroundScale: [1.045, 1],
      backdropScale: [1.08, 1.14],
    }
  }
  return {
    x: ['0%', '0%'],
    y: ['0%', '0%'],
    foregroundScale: [1, 1],
    backdropScale: [1.08, 1.08],
  }
}
