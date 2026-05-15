import { Sparkles, Moon, Sun, Home, DoorOpen } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { cn } from '../../lib/utils'

const sceneIcons: Record<string, React.ElementType> = {
  sunrise: Sun,
  moon: Moon,
  house: Home,
  'door-open': DoorOpen,
}

interface SceneCardProps {
  entityId: string
  label: string
  icon?: string
  className?: string
}

export function SceneCard({ entityId, label, icon = 'sunrise', className }: SceneCardProps) {
  const { call } = useHAService()
  const { medium } = useHaptic()

  const Icon = sceneIcons[icon] ?? Sparkles

  const activate = () => {
    medium()
    call('scene', 'turn_on', { entity_id: entityId })
  }

  return (
    <GlassCard
      interactive
      onClick={activate}
      className={cn('flex items-center gap-3 min-h-[64px]', className)}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-purple-500/15">
        <Icon size={18} className="text-purple-400" />
      </div>
      <span className="text-sm font-medium text-white/85">{label}</span>
    </GlassCard>
  )
}
