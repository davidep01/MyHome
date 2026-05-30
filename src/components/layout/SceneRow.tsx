import { motion } from 'framer-motion'
import { Music, DoorOpen, Moon, Film, Sunrise, Home as House, Sparkles } from 'lucide-react'
import { quickScenes } from '../../config/rooms'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { framerSpringBounce } from '../../design/tokens'

const sceneIcons: Record<string, React.ElementType> = {
  music: Music,
  'door-open': DoorOpen,
  moon: Moon,
  film: Film,
  sunrise: Sunrise,
  house: House,
}

export function SceneRow() {
  const { call } = useHAService()
  const { medium } = useHaptic()

  const activate = (entityId: string) => {
    medium()
    call('scene', 'turn_on', { entity_id: entityId })
  }

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-1">
      {quickScenes.map((scene) => {
        const Icon = sceneIcons[scene.icon] ?? Sparkles
        return (
          <motion.button
            key={scene.entityId}
            type="button"
            onClick={() => activate(scene.entityId)}
            whileTap={{ scale: 0.9 }}
            transition={framerSpringBounce}
            className="flex shrink-0 flex-col items-center gap-1.5"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-white/10"
              style={{ background: scene.color, boxShadow: `0 6px 18px ${scene.color}55` }}
            >
              <Icon size={20} className="text-white" />
            </span>
            <span className="text-[11px] font-medium text-white/60">{scene.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
