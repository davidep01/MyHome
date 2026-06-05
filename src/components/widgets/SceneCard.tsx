import type { LucideIcon } from 'lucide-react'
import { Sparkles, Moon, Sun, Home, DoorOpen } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { DynamicIcon } from '../DynamicIcon'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { cn } from '../../lib/utils'

const sceneIcons: Record<string, LucideIcon> = {
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

export function SceneCard({ entityId, label, icon, className }: SceneCardProps) {
  const { call } = useHAService()
  const { medium } = useHaptic()

  // Friendly alias → static mapped icon; otherwise resolve any lucide name (DynamicIcon),
  // falling back to a neutral sparkle. Honours the per-scene configured icon.
  const Mapped = icon ? sceneIcons[icon] : undefined

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
        {Mapped
          ? <Mapped size={18} className="text-purple-400" />
          : <DynamicIcon name={icon} fallback={Sparkles} size={18} className="text-purple-400" />}
      </div>
      <span className="text-sm font-medium text-black/85">{label}</span>
    </GlassCard>
  )
}
