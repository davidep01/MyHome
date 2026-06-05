import { DoorOpen, DoorClosed, Activity, Droplets, Flame, Wind, Lock, Plug, Eye, CircleDot } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { cn } from '../../lib/utils'

interface Props { entityId: string; label: string; className?: string }

const ICON_BY_CLASS: Record<string, { on: React.ElementType; off: React.ElementType }> = {
  door: { on: DoorOpen, off: DoorClosed },
  garage_door: { on: DoorOpen, off: DoorClosed },
  window: { on: DoorOpen, off: DoorClosed },
  opening: { on: DoorOpen, off: DoorClosed },
  motion: { on: Activity, off: Eye },
  occupancy: { on: Activity, off: Eye },
  presence: { on: Activity, off: Eye },
  moisture: { on: Droplets, off: Droplets },
  smoke: { on: Flame, off: Wind },
  gas: { on: Flame, off: Wind },
  lock: { on: Lock, off: Lock },
  plug: { on: Plug, off: Plug },
}

/** binary_sensor → read-only status with a device_class-aware icon. */
export function BinarySensorCard({ entityId, label, className }: Props) {
  const entity = useHAEntity(entityId)
  const on = entity?.state === 'on'
  const unavailable = !entity || entity.state === 'unavailable'
  const dc = (entity?.attributes?.device_class as string | undefined) ?? ''
  const set = ICON_BY_CLASS[dc] ?? { on: CircleDot, off: CircleDot }
  const Icon = on ? set.on : set.off

  // "on" usually means active/alert → tint amber; "off" = quiet.
  const active = on && ['motion', 'occupancy', 'presence', 'door', 'window', 'opening', 'garage_door', 'moisture', 'smoke', 'gas'].includes(dc)
  const color = active ? 'var(--alert-orange)' : on ? 'var(--ok-green)' : 'var(--ink-tertiary)'

  const stateText = unavailable ? 'Non disponibile'
    : ['door', 'window', 'opening', 'garage_door'].includes(dc) ? (on ? 'Aperto' : 'Chiuso')
    : ['motion', 'occupancy', 'presence'].includes(dc) ? (on ? 'Rilevato' : 'Libero')
    : on ? 'Attivo' : 'Inattivo'

  return (
    <GlassCard className={cn('flex flex-col gap-3', unavailable && 'opacity-55', className)}>
      <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
        <Icon size={18} />
      </div>
      <div className="mt-auto">
        <p className="text-sm font-semibold leading-tight text-black/90">{label}</p>
        <p className="mt-0.5 text-xs" style={{ color }}>{stateText}</p>
      </div>
    </GlassCard>
  )
}
