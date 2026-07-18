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
    const big = !cameraStrip && index === 0 && slot.priority <= 2 && hero.length > 1
    const featured = !cameraStrip && (big || hero.length === 1)

    return (
      <div
        key={slot.key}
        title={slot.reason}
        className={cn('card-enter h-full min-w-0', featured && 'sm:col-span-2')}
        style={{ '--enter-i': Math.min(index, 8) } as CSSProperties}
      >
        <WidgetErrorBoundary>
          {slot.group ? (
            <GroupCard
              group={{ id: slot.key, label: slot.group.label, entityIds: slot.group.entityIds, type: 'light' }}
              className="h-full"
            />
          ) : slot.entityId ? (
            <EntityCard entity={makeRoomEntity(slot.entityId, entities, overrides)} size={featured ? 'L' : 'M'} />
          ) : null}
        </WidgetErrorBoundary>
      </div>
    )
  }

  return (
    <section className="shrink-0 space-y-3.5">
      {regular.length > 0 && (
        <div className="grid auto-rows-[190px] grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {regular.map((slot) => renderSlot(slot))}
        </div>
      )}
      {cameraTrio.length === 3 && (
        <div
          className="grid auto-rows-[190px] grid-cols-1 gap-3.5 sm:grid-cols-3"
          aria-label="Videocamere in evidenza"
        >
          {cameraTrio.map((slot) => renderSlot(slot, true))}
        </div>
      )}
    </section>
  )
}
