import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Home, Layers, LoaderCircle, Play } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { DynamicIcon } from '../DynamicIcon'
import { AnimLightbulb } from '../icons/animated'
import { LiveDot } from '../anim/LiveDot'
import { useEntityStore } from '../../store/entities'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import type { EntityGroup } from '../../api/backend'
import type { WidgetVisualSize } from './types'
import { cn } from '../../lib/utils'
import {
  entityDomain,
  groupCapability,
  groupMemberActive,
  homogeneousGroupDomain,
  optimisticGroupState,
} from './utils/groupActions'
import { HoldDangerAction } from '../controls/HoldDangerAction'
import { widgetTones } from './utils/getRingColorScale'

export function GroupCard({ group, size = 'M', className }: { group: EntityGroup; size?: WidgetVisualSize; className?: string }) {
  const entities = useEntityStore((s) => s.entities)
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const { call } = useHAService()
  const { medium } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  const members = group.entityIds.flatMap((id) => entities[id] ? [{ id, entity: entities[id] }] : [])
  const availableMembers = members.filter(({ entity }) => !['unavailable', 'unknown'].includes(entity.state))
  const activeCount = availableMembers.filter(({ id, entity }) => groupMemberActive(entityDomain(id), entity.state)).length
  const anyActive = activeCount > 0
  const total = group.entityIds.length
  const domain = homogeneousGroupDomain(group.entityIds)
  const capability = groupCapability(domain)
  const presentationType = group.type ?? domain ?? group.entityIds[0]?.split('.')[0]

  const run = () => {
    if (busyRef.current || !domain || !capability || availableMembers.length === 0) return
    const turningOn = capability.kind === 'activate' ? true : !anyActive
    const service = turningOn ? capability.onService : capability.offService
    if (!service) return

    const originals = availableMembers.map(({ id, entity }) => ({
      id,
      state: entity.state,
      attributes: entity.attributes,
    }))
    const nextState = capability.kind === 'activate' ? undefined : optimisticGroupState(domain, turningOn)

    busyRef.current = true
    setPending(true)
    setError(null)
    medium()
    if (nextState) {
      for (const { id } of availableMembers) setOptimisticState(id, nextState)
    }

    void call(domain, service, { entity_id: availableMembers.map(({ id }) => id) })
      .catch(() => {
        for (const original of originals) {
          setOptimisticState(original.id, original.state, original.attributes)
        }
        actionFailed()
        setError('Comando non eseguito · riprova')
      })
      .finally(() => {
        busyRef.current = false
        setPending(false)
      })
  }

  const activeTone = presentationType === 'media' ? widgetTones.media
    : presentationType === 'climate' || presentationType === 'water_heater' ? widgetTones.heat
      : presentationType === 'fan' || presentationType === 'cover' ? widgetTones.cool
        : presentationType === 'lock' || presentationType === 'security' || presentationType === 'alarm' ? widgetTones.warning
          : presentationType === 'switch' ? widgetTones.ok
            : widgetTones.light
  const accent = anyActive ? activeTone.bg : widgetTones.neutral.bg
  const iconColor = anyActive ? activeTone.color : 'var(--widget-icon-ink)'
  const missing = total - availableMembers.length
  const status = error
    ?? (pending ? 'Invio comando…'
      : availableMembers.length === 0 ? 'Nessun dispositivo disponibile'
        : !domain ? 'Gruppo misto · controllo non disponibile'
          : !capability ? `${availableMembers.length} dispositivi · solo stato`
            : capability.kind === 'activate' ? `${availableMembers.length} dispositivi`
              : `${activeCount} di ${availableMembers.length} attivi${missing > 0 ? ` · ${missing} non disponibili` : ''}`)

  const actionLabel = capability
    ? capability.kind === 'activate' || !anyActive
      ? capability.onLabel
      : capability.offLabel ?? capability.onLabel
    : ''
  const expanded = size === 'L'

  return (
    <GlassCard
      depth
      className={cn('flex h-full min-h-[104px] flex-col justify-between gap-3', feedbackClass, className)}
      aria-busy={pending}
      style={anyActive ? {
        background: `linear-gradient(145deg, ${activeTone.bg}, color-mix(in srgb, var(--surface-solid) 72%, transparent) 70%)`,
      } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', anyActive && 'ai-active')}
          style={{ background: accent }}
          aria-hidden="true"
        >
          {!group.icon && presentationType === 'light'
            ? <AnimLightbulb size={20} style={{ color: iconColor }} />
            : <DynamicIcon name={group.icon} fallback={Layers} size={20} style={{ color: iconColor }} />}
        </div>

        {capability?.kind === 'switch' && !capability.holdToActivate && (
          <button
            type="button"
            role="switch"
            aria-checked={anyActive}
            aria-label={`${actionLabel} ${group.label}`}
            disabled={pending || availableMembers.length === 0}
            onClick={run}
            className={cn('lg-toggle shrink-0 border-0 p-0 disabled:cursor-not-allowed disabled:opacity-40', anyActive && 'on')}
          >
            <span className="lg-toggle-knob" aria-hidden="true" />
          </button>
        )}
        {capability?.kind === 'switch' && capability.holdToActivate && (
          <HoldDangerAction
            active={anyActive}
            disabled={pending || availableMembers.length === 0}
            onActivate={run}
            onDeactivate={run}
            label={group.label}
          />
        )}
        {(capability?.kind === 'action' || capability?.kind === 'activate') && (
          <button
            type="button"
            onClick={run}
            disabled={pending || availableMembers.length === 0}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-[#0066cc] px-4 text-sm font-semibold text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`${actionLabel} ${group.label}`}
          >
            {pending
              ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              : capability.kind === 'activate'
                ? <Play size={14} aria-hidden="true" />
                : anyActive
                  ? domain === 'cover' || domain === 'valve' ? <ChevronDown size={14} aria-hidden="true" /> : <Home size={14} aria-hidden="true" />
                  : domain === 'cover' || domain === 'valve' ? <ChevronUp size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {size !== 'S' && (pending ? 'Attendi…' : actionLabel)}
          </button>
        )}
      </div>

      <div className="mt-auto min-w-0">
        <p className="truncate text-[15px] font-semibold leading-snug text-[#1d1d1f]">{group.label}</p>
        <p
          className={cn('mt-0.5 flex items-center gap-1.5 text-[13px]', error ? 'text-red-700' : 'text-black/50')}
          role={error ? 'alert' : 'status'}
        >
          {anyActive && capability?.kind !== 'activate' && !error && <span aria-hidden="true"><LiveDot color={activeTone.color} size={7} /></span>}
          <span className="truncate">{status}</span>
        </p>
      </div>
      {expanded && members.length > 0 && (
        <div className="min-h-0 space-y-1.5 overflow-hidden">
          {members.slice(0, 5).map(({ id, entity }) => {
            const memberActive = groupMemberActive(entityDomain(id), entity.state)
            return (
              <div key={id} className="flex items-center gap-2 rounded-[10px] bg-black/[0.035] px-2.5 py-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: memberActive ? activeTone.color : 'rgba(0,0,0,0.18)' }} />
                <span className="min-w-0 flex-1 truncate font-semibold text-black/65">{String(entity.attributes?.friendly_name ?? id.split('.')[1])}</span>
                <span className="shrink-0 text-black/35">{entity.state}</span>
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}
