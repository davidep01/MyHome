import type { CSSProperties } from 'react'
import { useEntityStore } from '../../../store/entities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { GroupCard } from '../../widgets/GroupCard'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { makeRoomEntity } from './makeRoomEntity'
import type { HeroSlot } from '../../../lib/composer'
import type { DeviceOverride } from '../../../api/backend'
import { cn } from '../../../lib/utils'
import { groupCameraTrio } from '../../../lib/nowSectionLayout'

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
  const { regular, cameraTrio } = groupCameraTrio(hero)

  const renderSlot = (slot: HeroSlot, cameraStrip = false) => {
    const index = hero.findIndex((candidate) => candidate.key === slot.key)
    const size = cameraStrip ? 'M' : (slot.visualSize ?? 'M')
    const span = cameraStrip ? ''
      : size === 'XL' ? 'sm:col-span-2 lg:col-span-6'
        : size === 'L' ? 'sm:col-span-2 lg:col-span-3'
          : 'lg:col-span-2'

    return (
      <div
        key={slot.key}
        title={slot.reason}
        className={cn('card-enter h-full min-w-0', span)}
        style={{ '--enter-i': Math.min(index, 8) } as CSSProperties}
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
    <section className={cn(
      'grid h-full min-h-0 gap-3.5 overflow-hidden',
      regular.length > 0 && cameraTrio.length === 3 && 'grid-rows-2',
    )}>
      {regular.length > 0 && (
        <div className="grid h-full min-h-0 auto-rows-[minmax(0,1fr)] grid-flow-row-dense grid-cols-1 gap-3.5 overflow-hidden sm:grid-cols-2 lg:grid-cols-6">
          {regular.map((slot) => renderSlot(slot))}
        </div>
      )}
      {cameraTrio.length === 3 && (
        <div
          className="grid h-full min-h-0 grid-cols-3 gap-3.5 overflow-hidden"
          aria-label="Videocamere in evidenza"
        >
          {cameraTrio.map((slot) => renderSlot(slot, true))}
        </div>
      )}
    </section>
  )
}
