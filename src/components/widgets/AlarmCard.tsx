import { ShieldCheck, ShieldOff, ShieldAlert, ChevronRight } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import { ALARM_STATE_LABELS, alarmTone, availableArmModes, isArmed } from '../../lib/alarm'
import { cn } from '../../lib/utils'

interface AlarmCardProps {
  entityId: string
  label: string
  className?: string
}

export function AlarmCard({ entityId, label, className }: AlarmCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { medium } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)

  const state = entity?.state ?? 'disarmed'
  const unavailable = !entity || entity.state === 'unavailable'
  const armed = isArmed(state)
  const feat = Number(entity?.attributes?.supported_features ?? 0)
  const codeRequired = Boolean(entity?.attributes?.code_arm_required)
  const codeFormat = entity?.attributes?.code_format as string | undefined
  // Disarming a numeric-code panel needs the PIN → send the user to the keypad.
  const needsCodeToDisarm = armed && codeFormat === 'number'
  const modes = availableArmModes(feat)
  const tone = alarmTone(state)
  const Icon = state === 'triggered' ? ShieldAlert : armed ? ShieldCheck : ShieldOff

  const send = (service: string, next: string) => {
    if (unavailable) return
    medium()
    setOptimisticState(entityId, next)
    call('alarm_control_panel', service, { entity_id: entityId })
  }

  // Primary arm mode for the quick button = first available (Away preferred).
  const primaryArm = modes.find((m) => m.id === 'away') ?? modes[0]

  return (
    <GlassCard
      interactive
      onClick={() => setSelectedEntity(entityId)}
      className={cn('flex flex-col gap-3 min-h-[110px]', unavailable && 'opacity-55', className)}
      style={!unavailable && armed ? { background: tone.tint } : undefined}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${tone.color}22` }}>
          <Icon size={17} style={{ color: tone.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-black/90">{label}</p>
          <p className="truncate text-xs" style={{ color: tone.color }}>
            {unavailable ? 'Non disponibile' : ALARM_STATE_LABELS[state] ?? state}
          </p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-black/25" />
      </div>

      {/* Quick actions — full mode picker is in the contextual panel */}
      <div className="mt-auto grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => (needsCodeToDisarm ? setSelectedEntity(entityId) : send('alarm_disarm', 'disarmed'))}
          disabled={unavailable}
          className={cn(
            'rounded-[10px] py-2 text-xs font-semibold transition',
            !armed ? 'bg-green-500/20 text-green-700' : 'bg-black/8 text-black/60 hover:bg-black/12',
          )}
        >
          Disins.
        </button>
        <button
          type="button"
          onClick={() => (codeRequired ? setSelectedEntity(entityId) : primaryArm && send(primaryArm.service, primaryArm.state))}
          disabled={unavailable || !primaryArm}
          className={cn(
            'rounded-[10px] py-2 text-xs font-semibold transition',
            armed ? 'bg-orange-500/20 text-orange-700' : 'bg-black/8 text-black/60 hover:bg-black/12',
          )}
        >
          {primaryArm ? `Inser. ${primaryArm.label}` : 'Inser.'}
        </button>
      </div>
    </GlassCard>
  )
}
