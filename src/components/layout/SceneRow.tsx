import { motion } from 'framer-motion'
import { Music, DoorOpen, Moon, Film, Sunrise, Home as House, Sparkles } from 'lucide-react'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useScenes } from '../../hooks/useScenes'
import { framerSpringBounce } from '../../design/tokens'

const sceneIcons: Record<string, React.ElementType> = {
  music: Music,
  'door-open': DoorOpen,
  moon: Moon,
  film: Film,
  sunrise: Sunrise,
  house: House,
  sparkles: Sparkles,
}

export function SceneRow() {
  const { call } = useHAService()
  const { medium } = useHaptic()
  const scenes = useScenes()

  if (scenes.length === 0) return null

  const activate = (entityId: string) => {
    medium()
    call('scene', 'turn_on', { entity_id: entityId })
  }

  return (
    // pt/pb give the orb glow + press-scale room — overflow-x:auto also clips
    // the y-axis, so without padding the circles look cut off at the top.
    <div className="flex shrink-0 items-start gap-[18px] overflow-x-auto px-0.5 pt-1.5 pb-3">
      {scenes.map((scene) => {
        const Icon = sceneIcons[scene.icon] ?? Sparkles
        return (
          <motion.button
            key={scene.entityId}
            type="button"
            onClick={() => activate(scene.entityId)}
            whileTap={{ scale: 0.92 }}
            transition={framerSpringBounce}
            className="flex shrink-0 flex-col items-center gap-2"
            style={{ width: 68 }}
          >
            {/* Scene orb — uses the .scene-orb CSS class from index.css */}
            <span className="scene-orb" style={{ background: scene.color, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 14px ${scene.color}50` }}>
              <Icon size={22} color="#fff" strokeWidth={2.1} />
            </span>
            <span className="w-full truncate text-center capitalize" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-secondary)', letterSpacing: '-0.1px' }}>
              {scene.label}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
