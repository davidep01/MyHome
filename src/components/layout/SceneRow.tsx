import { motion } from 'framer-motion'
import { Music, DoorOpen, Moon, Film, Sunrise, Home as House, Sparkles } from 'lucide-react'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useScenes } from '../../hooks/useScenes'
import { framerSpringBounce } from '../../design/tokens'
import type { WidgetSize } from '../../api/backend'

const sceneIcons: Record<string, React.ElementType> = {
  music: Music,
  'door-open': DoorOpen,
  moon: Moon,
  film: Film,
  sunrise: Sunrise,
  house: House,
  sparkles: Sparkles,
}

export function SceneRow({ size = 'wide' }: { size?: WidgetSize }) {
  const { call } = useHAService()
  const { medium } = useHaptic()
  const scenes = useScenes()

  if (scenes.length === 0) {
    return (
      <div className="flex h-full w-full items-center gap-3 text-black/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-600">
          <Sparkles size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-black/65">Scene</p>
          <p className="truncate text-xs">Nessuna scena configurata</p>
        </div>
      </div>
    )
  }
  const visibleScenes = scenes.slice(0, size === 'sm' ? 2 : size === 'md' ? 4 : size === 'lg' ? 6 : 10)
  const large = size === 'lg'

  const activate = (entityId: string) => {
    medium()
    call('scene', 'turn_on', { entity_id: entityId })
  }

  return (
    // pt/pb give the orb glow + press-scale room — overflow-x:auto also clips
    // the y-axis, so without padding the circles look cut off at the top.
    <div className={large ? 'grid w-full grid-cols-3 gap-x-4 gap-y-5 overflow-hidden px-1 py-2 sm:grid-cols-4' : 'flex shrink-0 items-start gap-[18px] overflow-x-auto px-0.5 pb-3 pt-1.5'}>
      {visibleScenes.map((scene) => {
        const Icon = sceneIcons[scene.icon] ?? Sparkles
        return (
          <motion.button
            key={scene.entityId}
            type="button"
            onClick={() => activate(scene.entityId)}
            whileTap={{ scale: 0.92 }}
            transition={framerSpringBounce}
            className="flex shrink-0 flex-col items-center gap-2"
            style={{ width: large ? '100%' : 68 }}
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
