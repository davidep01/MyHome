import { ShieldCheck, ShieldOff } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface AlarmCardProps {
  entityId: string
  label: string
  className?: string
}

const stateLabels: Record<string, string> = {
  disarmed: 'Disinserito',
  armed_home: 'Inserito (Casa)',
  armed_away: 'Inserito (Fuori)',
  armed_night: 'Inserito (Notte)',
  arming: 'Inserimento…',
  pending: 'In attesa…',
  triggered: 'Allarme!',
}

export function AlarmCard({ entityId, label, className }: AlarmCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { medium } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)

  const state = entity?.state ?? 'disarmed'
  const unavailable = !entity || entity.state === 'unavailable'
  const armed = state.startsWith('armed') || state === 'triggered' || state === 'arming'
  const color = state === 'triggered' ? tokens.accent.red : armed ? tokens.accent.orange : tokens.accent.green
  const Icon = armed ? ShieldCheck : ShieldOff

  const send = (service: string, next: string) => {
    if (unavailable) return
    medium()
    setOptimisticState(entityId, next)
    call('alarm_control_panel', service, { entity_id: entityId })
  }

  return (
    <GlassCard className={cn('flex flex-col gap-3 min-h-[110px]', className)}>
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-[12px]" style={{ background: `${color}22` }}>
          <Icon size={17} style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-black/90">{label}</p>
          <p className="truncate text-xs" style={{ color: tokens.text.tertiary }}>
            {unavailable ? 'Non disponibile' : stateLabels[state] ?? state}
          </p>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => send('alarm_disarm', 'disarmed')}
          className={cn(
            'rounded-[12px] py-2 text-xs font-medium transition',
            !armed ? 'bg-green-500/20 text-green-300' : 'bg-black/8 text-black/60 hover:bg-black/12',
          )}
        >
          Disins.
        </button>
        <button
          type="button"
          onClick={() => send('alarm_arm_away', 'armed_away')}
          className={cn(
            'rounded-[12px] py-2 text-xs font-medium transition',
            armed ? 'bg-orange-500/20 text-orange-300' : 'bg-black/8 text-black/60 hover:bg-black/12',
          )}
        >
          Inser.
        </button>
      </div>
    </GlassCard>
  )
}
