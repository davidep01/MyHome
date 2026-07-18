import type { WidgetSize } from '../../../api/backend'
import type { WidgetVisualSize } from '../types'

export interface WidgetSizeConfig {
  size: WidgetVisualSize
  minHeight: number
  paddingClass: string
  /** Dimensione del glifo dentro il puck (34/38/44px). */
  icon: number
  valueClass: string
  titleClass: string
}

export const WIDGET_SIZE_CONFIG: Record<WidgetVisualSize, WidgetSizeConfig> = {
  S: {
    size: 'S',
    minHeight: 104,
    paddingClass: 'p-3',
    icon: 18,
    valueClass: 'text-[22px]',
    titleClass: 'text-[13px]',
  },
  M: {
    size: 'M',
    minHeight: 136,
    paddingClass: 'p-3.5',
    icon: 20,
    valueClass: 'text-[28px]',
    titleClass: 'text-[15px]',
  },
  L: {
    size: 'L',
    minHeight: 186,
    paddingClass: 'p-4',
    icon: 24,
    valueClass: 'text-[36px]',
    titleClass: 'text-[17px]',
  },
  XL: {
    size: 'XL',
    minHeight: 136,
    paddingClass: 'p-4',
    icon: 24,
    valueClass: 'text-[36px]',
    titleClass: 'text-[17px]',
  },
}

export function getWidgetSizeConfig(size: WidgetVisualSize = 'M') {
  return WIDGET_SIZE_CONFIG[size]
}

export function widgetVisualSizeFromHomeSize(size?: WidgetSize): WidgetVisualSize {
  if (size === 'sm') return 'S'
  if (size === 'lg') return 'L'
  if (size === 'wide') return 'XL'
  return 'M'
}

export function widgetVisualSizeFromSpan(span: { c: number; r: number }): WidgetVisualSize {
  if (span.c >= 2 && span.r >= 2) return 'L'
  if (span.c >= 2 || span.r >= 2) return 'M'
  return 'S'
}
