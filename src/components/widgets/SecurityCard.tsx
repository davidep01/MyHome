import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface SecurityCardProps {
  entityId: string
  label?: string
  className?: string
}

const stateConfig: Record<string, { label: string; color: string; glow: string; Icon: React.ElementType }> = {
  disarmed:       { label: 'Disarmato', color: tokens.accent.green, glow: tokens.accent.greenGlow, Icon: ShieldCheck },
  armed_home:     { label: 'Armato Casa', color: tokens.accent.orange, glow: tokens.accent.orangeGlow, Icon: Shield },
  armed_away:     { label: 'Armato Fuori', color: tokens.accent.orange, glow: tokens.accent.orangeGlow, Icon: Shield },
  armed_night:    { label: 'Notte', color: tokens.accent.purple, glow: 'rgba(168,85,247,0.3)', Icon: Shield },
  triggered:      { label: 'ALLARME!', color: tokens.accent.red, glow: 'rgba(239,68,68,0.4)', Icon: ShieldAlert },
  pending:        { label: 'In attesa', color: tokens.accent.yellow, glow: 'rgba(234,179,8,0.3)', Icon: Shield },
  arming:         { label: 'Armamento', color: tokens.accent.yellow, glow: 'rgba(234,179,8,0.3)', Icon: Shield },
}

export function SecurityCard({ entityId, label = 'Sicurezza', className }: SecurityCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { heavy } = useHaptic()

  const state = entity?.state ?? 'unavailable'
  const config = stateConfig[state] ?? { label: state, color: tokens.text.tertiary, glow: '', Icon: Shield }
  const { Icon, label: stateLabel, color, glow } = config

  const toggleArm = () => {
    heavy()
    if (state === 'disarmed') {
      call('alarm_control_panel', 'alarm_arm_home', { entity_id: entityId })
    } else {
      call('alarm_control_panel', 'alarm_disarm', { entity_id: entityId })
    }
  }

  return (
    <GlassCard
      interactive
      glow={glow || undefined}
      onClick={toggleArm}
      className={cn('flex items-center gap-4 min-h-[80px]', className)}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]"
        style={{ background: `${color}20` }}>
        <Icon size={24} style={{ color }} />
      </div>
      <div>
        <p className="text-sm font-medium text-white/90">{label}</p>
        <p className="text-sm font-semibold mt-0.5" style={{ color }}>{stateLabel}</p>
      </div>
    </GlassCard>
  )
}
