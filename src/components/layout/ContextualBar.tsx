import { AnimatePresence, motion } from 'framer-motion'
import { Sun, Sunset, Moon, Coffee } from 'lucide-react'
import { useTimeOfDay, type TimeOfDay } from '../../hooks/useTimeOfDay'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { framerSpring, framerSpringBounce } from '../../design/tokens'

interface ContextualAction {
  label: string
  emoji: string
  entityId?: string
  domain?: string
  service?: string
  serviceData?: Record<string, unknown>
}

const contextualActions: Record<TimeOfDay, ContextualAction[]> = {
  mattina: [
    { label: 'Buongiorno', emoji: '☀️', entityId: 'scene.buongiorno', domain: 'scene', service: 'turn_on' },
    { label: 'Luci cucina', emoji: '💡', entityId: 'light.cucina', domain: 'light', service: 'turn_on' },
    { label: 'Tapparelle su', emoji: '🪟', entityId: 'cover.soggiorno_tende', domain: 'cover', service: 'open_cover' },
    { label: 'Clima', emoji: '🌡️', entityId: 'climate.soggiorno', domain: 'climate', service: 'set_hvac_mode', serviceData: { hvac_mode: 'auto' } },
  ],
  giorno: [
    { label: 'In casa', emoji: '🏠', entityId: 'scene.in_casa', domain: 'scene', service: 'turn_on' },
    { label: 'Luci naturali', emoji: '🔆', entityId: 'light.soggiorno', domain: 'light', service: 'turn_off' },
    { label: 'Tapparelle su', emoji: '🪟', entityId: 'cover.soggiorno_tende', domain: 'cover', service: 'open_cover' },
    { label: 'Clima off', emoji: '❄️', entityId: 'climate.soggiorno', domain: 'climate', service: 'set_hvac_mode', serviceData: { hvac_mode: 'off' } },
  ],
  sera: [
    { label: 'Relax', emoji: '🛋️', entityId: 'scene.soggiorno_relax', domain: 'scene', service: 'turn_on' },
    { label: 'Film', emoji: '🎬', entityId: 'scene.soggiorno_film', domain: 'scene', service: 'turn_on' },
    { label: 'Tapparelle giù', emoji: '🌃', entityId: 'cover.soggiorno_tende', domain: 'cover', service: 'close_cover' },
    { label: 'Luci soffuse', emoji: '🕯️', entityId: 'light.soggiorno_lampada', domain: 'light', service: 'turn_on', serviceData: { brightness_pct: 30 } },
  ],
  notte: [
    { label: 'Buonanotte', emoji: '🌙', entityId: 'scene.buonanotte', domain: 'scene', service: 'turn_on' },
    { label: 'Spegni tutto', emoji: '💤', entityId: 'light.soggiorno', domain: 'light', service: 'turn_off' },
    { label: 'Tapparelle giù', emoji: '🌑', entityId: 'cover.camera_tapparelle', domain: 'cover', service: 'close_cover' },
    { label: 'Fuori casa', emoji: '🔒', entityId: 'scene.fuori_casa', domain: 'scene', service: 'turn_on' },
  ],
}

const periodColors: Record<TimeOfDay, string> = {
  mattina: '#f97316',
  giorno: '#eab308',
  sera: '#a855f7',
  notte: '#3b82f6',
}

const PeriodIcons: Record<TimeOfDay, React.ElementType> = {
  mattina: Coffee,
  giorno: Sun,
  sera: Sunset,
  notte: Moon,
}

export function ContextualBar() {
  const { period, greeting, hour } = useTimeOfDay()
  const { call } = useHAService()
  const { light } = useHaptic()

  const actions = contextualActions[period]
  const color = periodColors[period]
  const PeriodIcon = PeriodIcons[period]

  const runAction = (action: ContextualAction) => {
    if (!action.domain || !action.service) return
    light()
    const data: Record<string, unknown> = { ...(action.serviceData ?? {}) }
    if (action.entityId) data.entity_id = action.entityId
    call(action.domain, action.service, data)
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={period}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={framerSpring}
        className="glass glass-border rounded-[18px] px-4 py-3 flex items-center gap-4"
      >
        {/* Greeting */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[10px]"
            style={{ background: `${color}20` }}
          >
            <PeriodIcon size={16} style={{ color }} />
          </div>
          <div>
            <p className="text-xs font-semibold text-black/85">{greeting}</p>
            <p className="text-[10px]" style={{ color: `${color}cc` }}>
              {hour.toString().padStart(2, '0')}:00
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-black/10 shrink-0" />

        {/* Suggested actions */}
        <div className="flex gap-2 overflow-x-auto">
          {actions.map((action) => (
            <motion.button
              key={action.label}
              onClick={() => runAction(action)}
              whileTap={{ scale: 0.93 }}
              transition={framerSpringBounce}
              className="flex shrink-0 items-center gap-1.5 rounded-[10px] bg-black/8 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/12 hover:text-[#1d1d1f] transition-colors"
            >
              <span>{action.emoji}</span>
              <span>{action.label}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
