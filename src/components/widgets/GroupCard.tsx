import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Home, Layers, LoaderCircle, Play } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { GlassSheet } from '../glass/GlassSheet'
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
  groupMemberStateLabel,
  groupShowsMemberDetails,
  homogeneousGroupDomain,
  optimisticGroupState,
} from './utils/groupActions'
import { HoldDangerAction } from '../controls/HoldDangerAction'
import { widgetTones } from './utils/getRingColorScale'
import { WidgetCardPowerState } from './WidgetCardBase'

export function GroupCard({ group, size = 'M', className }: { group: EntityGroup; size?: WidgetVisualSize; className?: string }) {
  const entities = useEntityStore((s) => s.entities)
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const { call } = useHAService()
  const { medium } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const [detailsOpen, setDetailsOpen] = useState(false)
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
  const expanded = groupShowsMemberDetails(size)
  const compact = size === 'XS' || size === 'S'
  const lightPowerCard = !compact && presentationType === 'light' && capability?.kind === 'switch'
  const openDetails = () => setDetailsOpen(true)

  return (
    <>
    <GlassCard
      depth
      interactive={lightPowerCard || compact}
      role={lightPowerCard || compact ? 'button' : undefined}
      tabIndex={lightPowerCard || compact ? 0 : undefined}
      aria-label={compact ? `Dettagli del gruppo ${group.label}` : lightPowerCard ? `${anyActive ? 'Spegni' : 'Accendi'} ${group.label}` : undefined}
      aria-pressed={lightPowerCard ? anyActive : undefined}
      onClick={compact ? openDetails : lightPowerCard ? run : undefined}
      onKeyDown={lightPowerCard || compact ? (event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        if (compact) openDetails()
        else run()
      } : undefined}
      data-widget-type={lightPowerCard ? 'light' : undefined}
      data-widget-status={lightPowerCard ? (anyActive ? 'on' : 'off') : undefined}
      className={cn('group-card flex h-full min-h-[90px] flex-col justify-between gap-2', (size === 'XS' || size === 'M' || size === 'XL') && 'group-card-horizontal', size === 'XS' && 'group-card-mini', feedbackClass, lightPowerCard && 'widget-card-light-power', className)}
      aria-busy={pending}
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

        {lightPowerCard && (
          <WidgetCardPowerState active={anyActive} pending={pending} compact={false} />
        )}
        {!compact && capability?.kind === 'switch' && !capability.holdToActivate && !lightPowerCard && (
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
        {!compact && capability?.kind === 'switch' && capability.holdToActivate && (
          <HoldDangerAction
            active={anyActive}
            disabled={pending || availableMembers.length === 0}
            onActivate={run}
            onDeactivate={run}
            label={group.label}
          />
        )}
        {!compact && (capability?.kind === 'action' || capability?.kind === 'activate') && (
          <button
            type="button"
            onClick={run}
            disabled={pending || availableMembers.length === 0}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--action-fill)] px-4 text-sm font-semibold text-[var(--on-accent)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={`${actionLabel} ${group.label}`}
          >
            {pending
              ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              : capability.kind === 'activate'
                ? <Play size={14} aria-hidden="true" />
                : anyActive
                  ? domain === 'cover' || domain === 'valve' ? <ChevronDown size={14} aria-hidden="true" /> : <Home size={14} aria-hidden="true" />
                  : domain === 'cover' || domain === 'valve' ? <ChevronUp size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            <span className={size === 'M' || size === 'XL' ? 'sr-only' : undefined}>{pending ? 'Attendi…' : actionLabel}</span>
          </button>
        )}
        {!compact && <button type="button" aria-label={`Dettagli del gruppo ${group.label}`} onClick={(event) => { event.stopPropagation(); openDetails() }} className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--widget-control)] text-[var(--ink-secondary)]"><ChevronDown size={18} aria-hidden="true" /></button>}
        {compact && <ChevronDown size={18} className="text-[var(--ink-secondary)]" aria-hidden="true" />}
      </div>

      <div className="mt-auto min-w-0">
        <p className="truncate text-[15px] font-semibold leading-snug text-[var(--ink)]">{group.label}</p>
        <p
          className={cn('mt-0.5 flex items-center gap-1.5 text-[13px]', error ? 'text-red-700' : 'text-[var(--ink-secondary)]')}
          role={error ? 'alert' : 'status'}
        >
          {anyActive && capability?.kind !== 'activate' && !error && <span aria-hidden="true"><LiveDot color={activeTone.color} size={7} /></span>}
          <span className="truncate">{status}</span>
        </p>
      </div>
      {expanded && members.length > 0 && (
        <div className={cn('min-h-0 overflow-y-auto', 'space-y-1.5')}>
          {members.map(({ id, entity }) => {
            const memberActive = groupMemberActive(entityDomain(id), entity.state)
            return (
              <div key={id} className="flex min-w-0 items-center gap-2 rounded-[10px] bg-[var(--fill-subtle)] px-2.5 py-2 text-xs ">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: memberActive ? activeTone.color : 'var(--ink-tertiary)' }} />
                <span className="min-w-0 flex-1 truncate font-semibold text-[var(--ink-secondary)]">{String(entity.attributes?.friendly_name ?? id.split('.')[1])}</span>
                <span className="shrink-0 text-[var(--ink-tertiary)]">{groupMemberStateLabel(entityDomain(id), entity.state)}</span>
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
    <GlassSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} side="center" title={group.label} ariaLabel={`Dettagli del gruppo ${group.label}`}>
      <div className="space-y-3">
        <p className="text-[13px] text-[var(--ink-secondary)]">{status}</p>
        {capability && availableMembers.length > 0 && (capability.holdToActivate ? <HoldDangerAction active={anyActive} disabled={pending} onActivate={run} onDeactivate={run} label={group.label} /> : <button type="button" disabled={pending} onClick={run} className="min-h-11 rounded-full bg-[var(--action-fill)] px-4 text-[13px] font-semibold text-[var(--on-accent)] disabled:opacity-50">{pending ? 'Invio comando…' : actionLabel}</button>)}
        <ul className="space-y-2">
          {group.entityIds.map((id) => <li key={id} className="flex min-h-11 items-center justify-between gap-3 rounded-[12px] bg-[var(--fill-subtle)] px-3 py-2 text-[13px]">
            <span className="min-w-0 break-words font-semibold text-[var(--ink)]">{String(entities[id]?.attributes?.friendly_name ?? id.split('.')[1]?.replace(/_/g, ' ') ?? id)}</span>
            <span className="shrink-0 text-[var(--ink-secondary)]">{groupMemberStateLabel(entityDomain(id), entities[id]?.state ?? 'unavailable')}</span>
          </li>)}
        </ul>
      </div>
    </GlassSheet>
    </>
  )
}
