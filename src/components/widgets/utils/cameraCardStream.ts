import type { WidgetVisualSize } from '../types'
import type { WidgetFamily } from './mapEntityToWidgetCard'

/**
 * Ogni formato della griglia supporta il live. La matrice è esplicita perché
 * in passato S veniva degradato a sola icona, nonostante CameraStream gestisca
 * già visibilità, sospensione e fallback senza dipendere dalla dimensione.
 */
const LIVE_CAMERA_SIZES = new Set<WidgetVisualSize>(['XS', 'S', 'M', 'L', 'XL'])

export function shouldRenderCameraStream(
  family: WidgetFamily,
  size: WidgetVisualSize,
  unavailable: boolean,
): boolean {
  return (family === 'camera' || family === 'doorbell')
    && LIVE_CAMERA_SIZES.has(size)
    && !unavailable
}
