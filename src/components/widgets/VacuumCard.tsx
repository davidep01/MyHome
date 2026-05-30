import { motion } from 'framer-motion'
import { BatteryCharging, Play, Home as Dock } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface VacuumCardProps {
  entityId: string
  label: string
  className?: string
}

const stateLabels: Record<string, string> = {
  cleaning: 'In pulizia',
  docked: 'In carica',
  charging: 'In carica',
  returning: 'Rientro',
  paused: 'In pausa',
  idle: 'In attesa',
  error: 'Errore',
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/55">{children}</span>
  )
}

export function VacuumCard({ entityId, label, className }: VacuumCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { medium } = useHaptic()

  const unavailable = !entity || entity.state === 'unavailable'
  const state = entity?.state ?? 'docked'
  const cleaning = state === 'cleaning'
  const battery = Number(entity?.attributes?.battery_level ?? 100)
  const area = entity?.attributes?.cleaned_area as number | undefined
  const fanSpeed = (entity?.attributes?.fan_speed as string | undefined) ?? 'Balanced'

  const action = () => {
    if (unavailable) return
    medium()
    call('vacuum', cleaning ? 'return_to_base' : 'start', { entity_id: entityId })
  }

  return (
    <GlassCard className={cn('flex flex-col gap-3 min-h-[150px]', className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <BatteryCharging size={16} style={{ color: tokens.accent.green }} />
          <span className="text-xs font-medium text-white/70">{Math.round(battery)}% Batt.</span>
        </div>
        <button
          type="button"
          onClick={action}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/60 transition hover:text-white"
          aria-label={cleaning ? 'Rientra alla base' : 'Avvia pulizia'}
        >
          {cleaning ? <Dock size={16} /> : <Play size={16} />}
        </button>
      </div>

      <div className="grid flex-1 place-items-center">
        <motion.div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: cleaning ? `${tokens.accent.blue}22` : 'rgba(255,255,255,0.06)' }}
          animate={cleaning ? { rotate: 360 } : { rotate: 0 }}
          transition={cleaning ? { repeat: Infinity, duration: 4, ease: 'linear' } : {}}
        >
          <div className="h-6 w-6 rounded-full border-2 border-white/30 border-t-white/80" />
        </motion.div>
      </div>

      <div>
        <p className="text-sm font-semibold text-white/90">{label}</p>
        <p className="text-xs" style={{ color: tokens.text.tertiary }}>
          {unavailable ? 'Non disponibile' : stateLabels[state] ?? state}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip>{area ? `${area} m²` : '45 m²'}</Chip>
          <Chip>{fanSpeed}</Chip>
        </div>
      </div>
    </GlassCard>
  )
}
