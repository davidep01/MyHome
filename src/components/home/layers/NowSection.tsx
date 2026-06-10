import type { CSSProperties } from 'react'
import { useEntityStore } from '../../../store/entities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { GroupCard } from '../../widgets/GroupCard'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { makeRoomEntity } from './makeRoomEntity'
import type { HeroSlot } from '../../../lib/composer'
import type { DeviceOverride } from '../../../api/backend'
import { cn } from '../../../lib/utils'

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

  return (
    <section className="shrink-0">
      <div className="grid grid-cols-2 gap-3.5 auto-rows-[170px] xl:grid-cols-3">
        {hero.map((slot, index) => {
          const big = index === 0 && slot.priority <= 2 && hero.length > 1
          return (
            <div
              key={slot.key}
              title={slot.reason}
              className={cn('card-enter h-full min-w-0', big && 'col-span-2')}
              style={{ '--enter-i': Math.min(index, 8) } as CSSProperties}
            >
              <WidgetErrorBoundary>
                {slot.group ? (
                  <GroupCard
                    group={{ id: slot.key, label: slot.group.label, entityIds: slot.group.entityIds, type: 'light' }}
                    className="h-full"
                  />
                ) : slot.entityId ? (
                  <EntityCard entity={makeRoomEntity(slot.entityId, entities, overrides)} size={big ? 'L' : 'M'} />
                ) : null}
              </WidgetErrorBoundary>
            </div>
          )
        })}
      </div>
    </section>
  )
}
