import { Layers, Play } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { DynamicIcon } from '../DynamicIcon'
import { AnimLightbulb } from '../icons/animated'
import { LiveDot } from '../anim/LiveDot'
import { useEntityStore } from '../../store/entities'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import type { EntityGroup } from '../../api/backend'
import { cn } from '../../lib/utils'

/** Is a member "active" for its domain (on / open / playing …). */
function memberActive(entityId: string, state: string | undefined): boolean {
  if (!state || state === 'unavailable') return false
  const domain = entityId.split('.')[0]
  switch (domain) {
    case 'cover': return state === 'open'
    case 'media_player': return state === 'playing'
    case 'lock': return state === 'unlocked'
    case 'climate': return state !== 'off'
    default: return state === 'on'
  }
}

const ONOFF_TYPES = new Set(['light', 'switch', 'fan', 'cover'])
const ACTIVATE_TYPES = new Set(['scene', 'button'])

export function GroupCard({ group, className }: { group: EntityGroup; className?: string }) {
  const entities = useEntityStore((s) => s.entities)
  const { call } = useHAService()
  const { medium } = useHaptic()

  const members = group.entityIds.map((id) => ({ id, e: entities[id] })).filter((m) => m.e)
  const activeCount = members.filter((m) => memberActive(m.id, m.e?.state)).length
  const anyOn = activeCount > 0
  const total = group.entityIds.length

  const type = group.type ?? group.entityIds[0]?.split('.')[0]
  const isOnOff = ONOFF_TYPES.has(type ?? '')
  const isActivate = ACTIVATE_TYPES.has(type ?? '')

  const toggleAll = () => {
    medium()
    call('homeassistant', anyOn ? 'turn_off' : 'turn_on', { entity_id: group.entityIds })
  }
  const activateAll = () => {
    medium()
    if (type === 'scene') call('scene', 'turn_on', { entity_id: group.entityIds })
    else call('button', 'press', { entity_id: group.entityIds })
  }

  const accent = anyOn ? 'rgba(234,179,8,0.15)' : 'rgba(0,0,0,0.05)'
  const iconColor = anyOn ? '#b45309' : 'rgba(29,29,31,0.40)'

  return (
    <GlassCard
      depth
      interactive={isOnOff}
      onClick={isOnOff ? toggleAll : undefined}
      className={cn('flex h-full items-center gap-3 min-h-[104px]', className)}
    >
      <div
        className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', anyOn && 'ai-active')}
        style={{ background: accent }}
      >
        {/* Gruppi luce senza icona custom: lampadina animata (raggi accesi). */}
        {!group.icon && type === 'light'
          ? <AnimLightbulb size={20} style={{ color: iconColor }} />
          : <DynamicIcon name={group.icon} fallback={Layers} size={20} style={{ color: iconColor }} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-snug text-[#1d1d1f]">{group.label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-black/50">
          {anyOn && isOnOff && <LiveDot color="#eab308" size={7} />}
          {isOnOff ? `${activeCount}/${total} attive` : `${total} dispositivi`}
        </p>
      </div>

      {isOnOff && (
        <div className={cn('lg-toggle shrink-0', anyOn && 'on')} onClick={(e) => { e.stopPropagation(); toggleAll() }}>
          <span className="lg-toggle-knob" />
        </div>
      )}
      {isActivate && (
        <button
          onClick={(e) => { e.stopPropagation(); activateAll() }}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#0066cc] px-4 text-sm font-medium text-white active:scale-95"
        >
          <Play size={14} /> Attiva
        </button>
      )}
    </GlassCard>
  )
}
