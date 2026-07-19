import type { DeviceOverride, WidgetSize } from '../../../api/backend'
import type { WidgetVisualSize } from '../types'

export interface WidgetSizeConfig {
  size: WidgetVisualSize
  minHeight: number
  paddingClass: string
  /** Dimensione del glifo dentro il puck (34/38/44px). */
  icon: number
  valueClass: string
  titleClass: string
  /** Numero di slot orizzontali occupati nella griglia a tre colonne. */
  slots: 1 | 2 | 3
  /** Numero di righe logiche occupate. */
  rows: 1 | 2
}

export const WIDGET_SIZE_CONFIG: Record<WidgetVisualSize, WidgetSizeConfig> = {
  S: {
    size: 'S',
    minHeight: 104,
    paddingClass: 'p-3',
    icon: 18,
    valueClass: 'text-[22px]',
    titleClass: 'text-[13px]',
    slots: 1,
    rows: 1,
  },
  M: {
    size: 'M',
    minHeight: 136,
    paddingClass: 'p-3.5',
    icon: 20,
    valueClass: 'text-[28px]',
    titleClass: 'text-[15px]',
    slots: 2,
    rows: 1,
  },
  L: {
    size: 'L',
    minHeight: 186,
    paddingClass: 'p-4',
    icon: 24,
    valueClass: 'text-[36px]',
    titleClass: 'text-[17px]',
    slots: 3,
    rows: 2,
  },
  XL: {
    size: 'XL',
    minHeight: 136,
    paddingClass: 'p-4',
    icon: 24,
    valueClass: 'text-[36px]',
    titleClass: 'text-[17px]',
    slots: 3,
    rows: 1,
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

const CARD_SIZE_ORDER: WidgetVisualSize[] = ['S', 'M', 'L', 'XL']

/**
 * Rispetta le taglie abilitate dal backend. Una singola taglia è un override
 * esatto; con più taglie il composer conserva l'ideale, oppure usa la più
 * vicina privilegiando quella più compatta a parità di distanza.
 */
export function resolveEnabledCardSize(
  ideal: WidgetVisualSize,
  override?: Pick<DeviceOverride, 'cardSize' | 'cardSizes'>,
): WidgetVisualSize {
  const enabled = override?.cardSizes?.filter((size, index, sizes) => CARD_SIZE_ORDER.includes(size) && sizes.indexOf(size) === index)
  if (!enabled?.length) return override?.cardSize ?? ideal
  if (enabled.includes(ideal)) return ideal
  const idealIndex = CARD_SIZE_ORDER.indexOf(ideal)
  return [...enabled].sort((a, b) => {
    const distance = Math.abs(CARD_SIZE_ORDER.indexOf(a) - idealIndex) - Math.abs(CARD_SIZE_ORDER.indexOf(b) - idealIndex)
    return distance || CARD_SIZE_ORDER.indexOf(a) - CARD_SIZE_ORDER.indexOf(b)
  })[0]
}
