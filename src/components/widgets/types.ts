import type { ElementType, ReactNode } from 'react'

export type WidgetVisualSize = 'XS' | 'S' | 'M' | 'L' | 'XL'

export type WidgetCardStatus =
  | 'default'
  | 'active'
  | 'inactive'
  | 'on'
  | 'off'
  | 'open'
  | 'closed'
  | 'opening'
  | 'closing'
  | 'locked'
  | 'unlocked'
  | 'armed'
  | 'disarmed'
  | 'triggered'
  | 'detected'
  | 'clear'
  | 'heating'
  | 'cooling'
  | 'idle'
  | 'dry'
  | 'fan'
  | 'charging'
  | 'lowBattery'
  | 'warning'
  | 'critical'
  | 'unavailable'
  | 'unknown'
  | 'offline'
  | 'loading'
  | 'error'
  | 'editing'
  | 'dragging'

export interface WidgetCardBaseProps {
  id?: string
  type?: string
  size?: WidgetVisualSize
  title: string
  icon?: ElementType
  status?: WidgetCardStatus
  accentColor?: string
  isActive?: boolean
  isLoading?: boolean
  isError?: boolean
  isUnavailable?: boolean
  isOffline?: boolean
  /** A service command is in flight; keeps the card visible while disabling controls. */
  isPending?: boolean
  isEditing?: boolean
  isDragging?: boolean
  children?: ReactNode
  /**
   * Layer full-bleed dietro i contenuti (live camera, artwork): riempie tutta
   * la card ignorando il padding, sotto il bottone di apertura e i controlli.
   */
  media?: ReactNode
  className?: string
  onClick?: () => void
  /** Accessible label for the full-card primary action. */
  onClickLabel?: string
  /** Exposes toggle state when the full card behaves as a power button. */
  onClickPressed?: boolean
}
