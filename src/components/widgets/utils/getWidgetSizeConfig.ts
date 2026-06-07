import type { WidgetSize } from '../../../api/backend'
import type { WidgetVisualSize } from '../types'

export interface WidgetSizeConfig {
  size: WidgetVisualSize
  minHeight: number
  paddingClass: string
  icon: number
  valueClass: string
  ring: number
  titleClass: string
}

export const WIDGET_SIZE_CONFIG: Record<WidgetVisualSize, WidgetSizeConfig> = {
  S: {
    size: 'S',
    minHeight: 104,
    paddingClass: 'p-[12px]',
    icon: 26,
    valueClass: 'text-[28px]',
    ring: 54,
    titleClass: 'text-[13px]',
  },
  M: {
    size: 'M',
    minHeight: 136,
    paddingClass: 'p-[14px]',
    icon: 34,
    valueClass: 'text-[34px]',
    ring: 82,
    titleClass: 'text-sm',
  },
  L: {
    size: 'L',
    minHeight: 186,
    paddingClass: 'p-4',
    icon: 42,
    valueClass: 'text-[44px]',
    ring: 122,
    titleClass: 'text-base',
  },
}

export function getWidgetSizeConfig(size: WidgetVisualSize = 'M') {
  return WIDGET_SIZE_CONFIG[size]
}

export function widgetVisualSizeFromHomeSize(size?: WidgetSize): WidgetVisualSize {
  if (size === 'sm') return 'S'
  if (size === 'lg') return 'L'
  return 'M'
}

export function widgetVisualSizeFromSpan(span: { c: number; r: number }): WidgetVisualSize {
  if (span.c >= 2 && span.r >= 2) return 'L'
  if (span.c >= 2 || span.r >= 2) return 'M'
  return 'S'
}
