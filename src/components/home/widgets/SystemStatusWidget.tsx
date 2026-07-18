import { useMemo } from 'react'
import { Wifi, WifiOff, Volume2, VolumeX, Cpu } from 'lucide-react'
import { useEntityStore } from '../../../store/entities'
import { useSoundNotifications } from '../../../hooks/useSoundNotifications'
import { AnimatedCard } from '../../anim/AnimatedCard'
import { LiveDot } from '../../anim/LiveDot'
import type { WidgetSize } from '../../../api/backend'

const STATUS = {
  connected: { label: 'Online', color: '#15803d' },
  connecting: { label: 'Connessione…', color: '#c2410c' },
  disconnected: { label: 'Offline', color: '#dc2626' },
  error: { label: 'Errore', color: '#dc2626' },
  idle: { label: 'In attesa', color: '#6e6e73' },
} as const

/** Live system health: HA connection, entity count, sound state. */
export function SystemStatusWidget({ size }: { size: WidgetSize }) {
  const status = useEntityStore((s) => s.connectionStatus)
  const entities = useEntityStore((s) => s.entities)
  const { muted } = useSoundNotifications()
  const count = useMemo(() => Object.keys(entities).length, [entities])
  const s = STATUS[status] ?? STATUS.idle
  const online = status === 'connected'

  return (
    <AnimatedCard depth ambient="drift" ambientColor={`${s.color}1f`} index={5} className="h-full" contentClassName="gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05]" style={{ color: s.color }}>
          <Cpu size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-black/90">Sistema</p>
          <p className="truncate text-xs text-black/45">{count} entità</p>
        </div>
        {online && <LiveDot color={s.color} />}
      </div>

      {size === 'sm' ? (
        <p className="mt-auto truncate text-sm font-semibold" style={{ color: s.color }}>{s.label}</p>
      ) : (
        <div className="mt-auto space-y-1.5">
          <Row icon={online ? Wifi : WifiOff} label="Home Assistant" value={s.label} color={s.color} />
          <Row icon={muted ? VolumeX : Volume2} label="Audio" value={muted ? 'Muto' : 'Attivo'} color={muted ? '#6e6e73' : '#15803d'} />
          {(size === 'lg' || size === 'wide') && <Row icon={Cpu} label="Entità monitorate" value={String(count)} color="#0066cc" />}
        </div>
      )}
    </AnimatedCard>
  )
}

function Row({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon size={13} className="shrink-0 text-black/40" />
      <span className="flex-1 truncate text-black/55">{label}</span>
      <span className="shrink-0 font-semibold" style={{ color }}>{value}</span>
    </div>
  )
}
