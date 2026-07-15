import { useMemo, useState } from 'react'
import type { ElementType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { HassEntity } from 'home-assistant-js-websocket'
import { AlarmClock, Bell, ChevronDown, ChevronRight, CloudRain, DoorOpen, Droplets, Fan, Flame, ShieldAlert, Snowflake, Video, Waves } from 'lucide-react'
import { useDashboardConfig } from '../../hooks/useDashboardConfig'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import { timeAgo } from '../../lib/time'
import { cn } from '../../lib/utils'
import { entityName } from '../widgets/utils/mapEntityToWidgetCard'

type LivePriority = 'critical' | 'high' | 'normal'

interface LiveActivity {
  id: string
  title: string
  status: string
  detail?: string
  entityId?: string
  priority: LivePriority
  Icon: ElementType
  color: string
  progress?: number
}

const ACTIVE_COVER_STATES = new Set(['opening', 'closing'])
const OPEN_STATES = new Set(['open', 'on'])
const CLIMATE_ACTIONS = new Set(['heating', 'cooling', 'drying', 'fan'])

function label(entity: HassEntity): string {
  return entityName(entity)
}

function includesAny(text: string, words: string[]) {
  const haystack = text.toLowerCase()
  return words.some((word) => haystack.includes(word))
}

function numeric(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function climateProgress(entity: HassEntity): number | undefined {
  const current = numeric(entity.attributes?.current_temperature)
  const target = numeric(entity.attributes?.temperature)
  if (current === undefined || target === undefined) return undefined
  const diff = Math.abs(target - current)
  return Math.max(0.08, Math.min(1, 1 - diff / 6))
}

function activitySort(a: LiveActivity, b: LiveActivity) {
  const rank: Record<LivePriority, number> = { critical: 0, high: 1, normal: 2 }
  return rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title)
}

function buildActivities(entities: Record<string, HassEntity>, doorbellIds: string[]): LiveActivity[] {
  const activities: LiveActivity[] = []

  for (const entity of Object.values(entities)) {
    const domain = entity.entity_id.split('.')[0]
    const name = label(entity)
    const text = `${entity.entity_id} ${name}`
    const state = entity.state

    if (doorbellIds.includes(entity.entity_id) && OPEN_STATES.has(state)) {
      activities.push({
        id: `doorbell:${entity.entity_id}`,
        title: name,
        status: 'Campanello attivo',
        detail: timeAgo(entity.last_changed),
        entityId: entity.entity_id,
        priority: 'high',
        Icon: Bell,
        color: '#0066cc',
      })
    }

    if (domain === 'alarm_control_panel' && ['pending', 'arming', 'triggered'].includes(state)) {
      activities.push({
        id: `alarm:${entity.entity_id}`,
        title: 'Allarme',
        status: state === 'triggered' ? 'Intrusione rilevata' : 'Countdown attivo',
        detail: name,
        entityId: entity.entity_id,
        priority: state === 'triggered' ? 'critical' : 'high',
        Icon: state === 'triggered' ? ShieldAlert : AlarmClock,
        color: state === 'triggered' ? '#dc2626' : '#c2410c',
        progress: 0.55,
      })
    }

    if (domain === 'cover' && ACTIVE_COVER_STATES.has(state)) {
      activities.push({
        id: `cover:${entity.entity_id}`,
        title: name,
        status: state === 'opening' ? 'In apertura' : 'In chiusura',
        entityId: entity.entity_id,
        priority: includesAny(text, ['garage', 'cancello', 'gate']) ? 'high' : 'normal',
        Icon: DoorOpen,
        color: '#0066cc',
        progress: numeric(entity.attributes?.current_position) !== undefined ? numeric(entity.attributes?.current_position)! / 100 : 0.5,
      })
    }

    if (domain === 'cover' && state === 'open' && includesAny(text, ['garage', 'cancello', 'gate'])) {
      activities.push({
        id: `gate-open:${entity.entity_id}`,
        title: name,
        status: 'Aperto',
        detail: timeAgo(entity.last_changed),
        entityId: entity.entity_id,
        priority: 'high',
        Icon: DoorOpen,
        color: '#c2410c',
      })
    }

    if (domain === 'vacuum' && ['cleaning', 'returning', 'paused'].includes(state)) {
      activities.push({
        id: `vacuum:${entity.entity_id}`,
        title: name,
        status: state === 'cleaning' ? 'Pulizia in corso' : state,
        entityId: entity.entity_id,
        priority: 'normal',
        Icon: Waves,
        color: '#15803d',
        progress: numeric(entity.attributes?.battery_level) !== undefined ? numeric(entity.attributes?.battery_level)! / 100 : undefined,
      })
    }

    if (domain === 'climate' && CLIMATE_ACTIONS.has(String(entity.attributes?.hvac_action))) {
      const action = String(entity.attributes?.hvac_action)
      const climateMeta =
        action === 'heating'
          ? { status: 'Riscaldamento', Icon: Flame, color: '#c2410c' }
          : action === 'cooling'
            ? { status: 'Raffrescamento', Icon: Snowflake, color: '#0066cc' }
            : action === 'drying'
              ? { status: 'Deumidificazione', Icon: Droplets, color: '#0891b2' }
              : { status: 'Ventilazione', Icon: Fan, color: '#15803d' }
      activities.push({
        id: `climate:${entity.entity_id}`,
        title: name,
        status: climateMeta.status,
        detail: `${entity.attributes?.current_temperature ?? '--'} °C → ${entity.attributes?.temperature ?? '--'} °C`,
        entityId: entity.entity_id,
        priority: 'normal',
        Icon: climateMeta.Icon,
        color: climateMeta.color,
        progress: climateProgress(entity),
      })
    }

    if ((domain === 'switch' || domain === 'input_boolean') && state === 'on' && includesAny(text, ['irrigazione', 'irrigation', 'piscina', 'pool', 'pompa', 'pump', 'filtrazione'])) {
      activities.push({
        id: `water:${entity.entity_id}`,
        title: name,
        status: includesAny(text, ['irrigazione', 'irrigation']) ? 'Irrigazione attiva' : 'Ciclo attivo',
        entityId: entity.entity_id,
        priority: 'normal',
        Icon: Droplets,
        color: '#0066cc',
      })
    }

    if (domain === 'binary_sensor' && state === 'on' && includesAny(String(entity.attributes?.device_class ?? ''), ['door', 'window', 'garage_door', 'opening'])) {
      activities.push({
        id: `opening:${entity.entity_id}`,
        title: name,
        status: 'Aperto',
        detail: timeAgo(entity.last_changed),
        entityId: entity.entity_id,
        priority: includesAny(text, ['garage', 'cancello', 'gate']) ? 'high' : 'normal',
        Icon: DoorOpen,
        color: '#c2410c',
      })
    }

    if (domain === 'weather' && includesAny(state, ['rain', 'pouring', 'lightning'])) {
      activities.push({
        id: `weather:${entity.entity_id}`,
        title: name,
        status: 'Pioggia imminente',
        entityId: entity.entity_id,
        priority: 'normal',
        Icon: CloudRain,
        color: '#0066cc',
      })
    }

    if (domain === 'camera' && state === 'streaming') {
      activities.push({
        id: `camera:${entity.entity_id}`,
        title: name,
        status: 'Streaming live',
        entityId: entity.entity_id,
        priority: 'normal',
        Icon: Video,
        color: '#0066cc',
      })
    }
  }

  return activities.sort(activitySort).slice(0, 8)
}

export function LiveActivityBar() {
  const entities = useEntityStore((s) => s.entities)
  const { data: config } = useDashboardConfig()
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const [expanded, setExpanded] = useState(false)
  const doorbellIds = useMemo(() => (config?.doorbells ?? []).map((doorbell) => doorbell.entityId), [config?.doorbells])
  const activities = useMemo(() => buildActivities(entities, doorbellIds), [entities, doorbellIds])

  if (activities.length === 0) return null

  const primary = activities[0]
  const visible = expanded ? activities : activities.slice(0, 1)

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className={cn(
          'glass glass-border shrink-0 rounded-[20px] px-3 py-2',
          primary.priority === 'critical' && 'bg-red-500/12',
        )}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            {visible.map((activity) => (
              <button
                key={activity.id}
                type="button"
                onClick={() => activity.entityId && setSelectedEntity(activity.entityId)}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-[15px] px-2 py-1.5 text-left transition hover:bg-black/5 active:scale-[0.99]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${activity.color}1f`, color: activity.color }}>
                  <activity.Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[#1d1d1f]">{activity.title}</p>
                    {activity.priority !== 'normal' && <span className="shrink-0 rounded-full bg-black/8 px-1.5 py-0.5 text-[9px] font-bold uppercase text-black/45">{activity.priority}</span>}
                  </div>
                  <p className="truncate text-xs text-black/45">{activity.status}{activity.detail ? ` · ${activity.detail}` : ''}</p>
                  {activity.progress !== undefined && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/8">
                      <motion.div className="h-full rounded-full" style={{ background: activity.color }} initial={false} animate={{ width: `${Math.round(activity.progress * 100)}%` }} />
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="shrink-0 text-black/30" />
              </button>
            ))}
          </div>

          {activities.length > 1 && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/6 text-black/45 transition hover:bg-black/10"
              aria-label={expanded ? 'Comprimi attività live' : 'Espandi attività live'}
            >
              <ChevronDown size={17} className={cn('transition-transform', expanded && 'rotate-180')} />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
