import type { CSSProperties } from 'react'
import { useEntityStore } from '../../../store/entities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { GroupCard } from '../../widgets/GroupCard'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { makeRoomEntity } from './makeRoomEntity'
import type { HeroSlot } from '../../../lib/composer'
import type { DeviceOverride } from '../../../api/backend'
import { cn } from '../../../lib/utils'
import { getWidgetSizeConfig, resolveEnabledCardSize } from '../../widgets/utils/getWidgetSizeConfig'

/**
 * Strato 2 — "Adesso": le card scelte dal composer per rilevanza.
 * La prima card (se prioritaria) occupa due colonne; ingressi con la
 * coreografia .card-enter, mai FLIP sugli elementi col blur.
 */
export function NowSection({
  hero,
  overrides,
}: {
  hero: HeroSlot[]
  overrides?: Record<string, DeviceOverride>
}) {
  const entities = useEntityStore((s) => s.entities)

  const renderSlot = (slot: HeroSlot) => {
    const index = hero.findIndex((candidate) => candidate.key === slot.key)
    const size = slot.entityId
      ? resolveEnabledCardSize(slot.visualSize ?? 'M', overrides?.[slot.entityId])
      : slot.visualSize ?? 'M'
    const rows = getWidgetSizeConfig(size).rows
    const span = size === 'L' ? 'sm:col-span-3'
      : size === 'XL' ? 'sm:col-span-3'
        : size === 'M' ? 'sm:col-span-2'
          : 'sm:col-span-1'

    return (
      <div
        key={slot.key}
        title={slot.reason}
        className={cn('card-enter h-full min-h-0 min-w-0 overflow-hidden [&_[data-widget-card]]:!min-h-0', span)}
        style={{
          '--enter-i': Math.min(index, 8),
          gridRow: `span ${rows} / span ${rows}`,
        } as CSSProperties}
      >
        <WidgetErrorBoundary>
          {slot.group ? (
            <GroupCard
              group={{ id: slot.key, label: slot.group.label, entityIds: slot.group.entityIds, type: 'light' }}
              className="h-full"
            />
          ) : slot.entityId ? (
            <EntityCard entity={makeRoomEntity(slot.entityId, entities, overrides)} size={size} />
          ) : null}
        </WidgetErrorBoundary>
      </div>
    )
  }

  return (
    <section className={cn('grid h-full min-h-0 grid-flow-row-dense grid-cols-1 grid-rows-[repeat(6,minmax(0,1fr))] auto-rows-[minmax(0,1fr)] gap-3.5 overflow-hidden sm:grid-cols-3')}>
      {hero.map((slot) => renderSlot(slot))}
    </section>
  )
}
