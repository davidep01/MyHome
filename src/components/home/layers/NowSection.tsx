import type { CSSProperties } from 'react'
import { useEntityStore } from '../../../store/entities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { GroupCard } from '../../widgets/GroupCard'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { makeRoomEntity } from './makeRoomEntity'
import type { HeroSlot } from '../../../lib/composer'
import type { DeviceOverride } from '../../../api/backend'
import { resolveEnabledCardSize } from '../../widgets/utils/getWidgetSizeConfig'
import { bentoCardSize, bentoLayout } from '../../../lib/bentoHome'

/**
 * Strato 2 — la home bento: tutte le card scelte nel wizard, sempre a schermo
 * pieno. `bentoLayout` decide colonne/righe e quali card prendono la tessera
 * doppia; le righe si dividono l'altezza disponibile (1fr) così la griglia è
 * sempre satura. Le righe hanno un'altezza minima touch-friendly: se lo
 * schermo non basta, la sezione scorre invece di schiacciare le card. Ingressi con la coreografia .card-enter, mai FLIP sul blur.
 */
export function NowSection({
  hero,
  overrides,
}: {
  hero: HeroSlot[]
  overrides?: Record<string, DeviceOverride>
}) {
  const entities = useEntityStore((s) => s.entities)
  const layout = bentoLayout(hero.length)

  return (
    <section
      className="kiosk-bento h-full min-h-0 overflow-y-auto overscroll-contain p-2"
      style={{
        '--bento-cols': layout.cols,
        '--bento-rows': layout.rows,
      } as CSSProperties}
    >
      {hero.map((slot, index) => {
        const span = layout.spans[index] ?? 1
        const fitted = bentoCardSize(span, layout)
        const size = slot.entityId ? resolveEnabledCardSize(fitted, overrides?.[slot.entityId]) : fitted
        return (
          <div
            key={slot.key}
            title={slot.reason}
            className="card-enter h-full min-h-0 min-w-0"
            style={{ '--enter-i': Math.min(index, 8), gridColumn: `span ${span} / span ${span}` } as CSSProperties}
          >
            <WidgetErrorBoundary>
              {slot.group ? (
                <GroupCard
                  group={{ id: slot.key, label: slot.group.label, entityIds: slot.group.entityIds, type: 'light' }}
                  size={size}
                  className="h-full"
                />
              ) : slot.entityId ? (
                <EntityCard entity={makeRoomEntity(slot.entityId, entities, overrides)} size={size} />
              ) : null}
            </WidgetErrorBoundary>
          </div>
        )
      })}
    </section>
  )
}
