import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Music, DoorOpen, Moon, Film, Sunrise, Home as House, Sparkles } from 'lucide-react'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useScenes } from '../../hooks/useScenes'
import { framerSpringBounce } from '../../design/tokens'
import { cn } from '../../lib/utils'
import type { WidgetSize } from '../../api/backend'

type ScenePhase = 'idle' | 'pending' | 'done' | 'failed'

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
  const { medium, heavy } = useHaptic()
  const scenes = useScenes()
  const [phases, setPhases] = useState<Record<string, ScenePhase>>({})

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

  const setPhase = (entityId: string, phase: ScenePhase) => setPhases((current) => ({ ...current, [entityId]: phase }))

  const activate = async (entityId: string) => {
    if (phases[entityId] === 'pending') return
    medium()
    setPhase(entityId, 'pending')
    try {
      await call('scene', 'turn_on', { entity_id: entityId })
      setPhase(entityId, 'done')
      window.setTimeout(() => setPhase(entityId, 'idle'), 1800)
    } catch {
      heavy()
      setPhase(entityId, 'failed')
      window.setTimeout(() => setPhase(entityId, 'idle'), 2200)
    }
  }

  return (
    // pt/pb give the orb glow + press-scale room — overflow-x:auto also clips
    // the y-axis, so without padding the circles look cut off at the top.
    <div className={large ? 'grid w-full grid-cols-3 gap-x-4 gap-y-5 overflow-hidden px-1 py-2 sm:grid-cols-4' : 'flex shrink-0 items-start gap-[18px] overflow-x-auto px-0.5 pb-3 pt-1.5'}>
      {visibleScenes.map((scene) => {
        const Icon = sceneIcons[scene.icon] ?? Sparkles
        const phase = phases[scene.entityId] ?? 'idle'
        return (
          <motion.button
            key={scene.entityId}
            type="button"
            onClick={() => void activate(scene.entityId)}
            disabled={phase === 'pending'}
            whileTap={{ scale: 0.92 }}
            transition={framerSpringBounce}
            className={cn('flex shrink-0 flex-col items-center gap-2', phase === 'failed' && 'widget-anim-errorShake')}
            style={{ width: large ? '100%' : 68 }}
          >
            {/* Scene orb — uses the .scene-orb CSS class from index.css */}
            <span className="relative scene-orb" style={{ background: scene.color, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 14px ${scene.color}50` }}>
              {phase === 'done'
                ? <Check size={22} color="#fff" strokeWidth={2.6} />
                : <Icon size={22} color="#fff" strokeWidth={2.1} />}
              {phase === 'pending' && (
                <span
                  aria-hidden="true"
                  className="absolute inset-[3px] animate-spin rounded-full border-2 border-white/70 border-t-transparent"
                />
              )}
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
