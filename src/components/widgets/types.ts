import type { ElementType, ReactNode } from 'react'

export type WidgetVisualSize = 'S' | 'M' | 'L'

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

export type WidgetAnimationPreset =
  | 'none'
  | 'softGlow'
  | 'pulse'
  | 'breathing'
  | 'shimmer'
  | 'rotate'
  | 'ripple'
  | 'wave'
  | 'snow'
  | 'heat'
  | 'rain'
  | 'fanSpin'
  | 'lockSnap'
  | 'gateSlide'
  | 'blindMove'
  | 'alarmPulse'
  | 'liveBlink'
  | 'energyFlow'
  | 'waterWave'
  | 'sparkle'
  | 'errorShake'
  | 'successPop'

export interface WidgetAction {
  id: string
  label: string
  Icon?: ElementType
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}

export interface WidgetCardBaseProps {
  id?: string
  type?: string
  size?: WidgetVisualSize
  title: string
  subtitle?: string
  icon?: ElementType
  state?: string
  status?: WidgetCardStatus
  primaryValue?: ReactNode
  secondaryValue?: ReactNode
  unit?: string
  room?: string
  entityId?: string
  deviceClass?: string
  accentColor?: string
  gradient?: string
  animationPreset?: WidgetAnimationPreset
  isActive?: boolean
  isLoading?: boolean
  isError?: boolean
  isUnavailable?: boolean
  isOffline?: boolean
  isEditing?: boolean
  isDragging?: boolean
  actions?: WidgetAction[]
  children?: ReactNode
  className?: string
  onClick?: () => void
}
