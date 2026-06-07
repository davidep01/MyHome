import type { CSSProperties, ReactNode } from 'react'
import type { EntityType, RoomEntity } from '../../api/backend'
import { tokens } from '../../design/tokens'
import { WidgetCardFactory } from './WidgetCardFactory'
import { widgetVisualSizeFromSpan } from './utils/getWidgetSizeConfig'
import type { WidgetVisualSize } from './types'

/** Bento footprint per device type: { c: columns, r: rows } in grid units. */
const SPAN: Record<EntityType, { c: number; r: number }> = {
  camera: { c: 2, r: 3 },
  media: { c: 2, r: 2 },
  climate: { c: 2, r: 2 },
  alarm: { c: 2, r: 2 },
  vacuum: { c: 1, r: 2 },
  light: { c: 1, r: 2 },
  lock: { c: 1, r: 2 },
  cover: { c: 1, r: 2 },
  fan: { c: 1, r: 2 },
  number: { c: 1, r: 2 },
  select: { c: 1, r: 1 },
  switch: { c: 1, r: 1 },
  scene: { c: 1, r: 1 },
  button: { c: 1, r: 1 },
  siren: { c: 1, r: 1 },
  sensor: { c: 1, r: 1 },
  binary_sensor: { c: 1, r: 1 },
  security: { c: 1, r: 1 },
  automation: { c: 1, r: 1 },
  script: { c: 1, r: 1 },
  person: { c: 1, r: 1 },
  device_tracker: { c: 1, r: 1 },
  weather: { c: 2, r: 2 },
  water_heater: { c: 2, r: 2 },
  valve: { c: 1, r: 1 },
}

function Tile({ type, children }: { type: EntityType; children: ReactNode }) {
  const span = SPAN[type] ?? { c: 1, r: 1 }
  const style: CSSProperties = { gridColumn: `span ${span.c}`, gridRow: `span ${span.r}` }
  return <div className="min-w-0" style={style}>{children}</div>
}

function visualSizeForEntity(entity: RoomEntity): WidgetVisualSize {
  return widgetVisualSizeFromSpan(SPAN[entity.type] ?? { c: 1, r: 1 })
}

/** Renders the right card for a single entity (reused by the editable grid). */
export function EntityCard({ entity, size }: { entity: RoomEntity; size?: WidgetVisualSize }) {
  return <WidgetCardFactory entity={entity} size={size ?? visualSizeForEntity(entity)} className="h-full" />
}

/** Default react-grid-layout footprint (cols≈8 units) per type, derived from SPAN. */
// eslint-disable-next-line react-refresh/only-export-components
export function defaultGridSize(type: EntityType): { w: number; h: number } {
  const s = SPAN[type] ?? { c: 1, r: 1 }
  return { w: s.c * 2, h: s.r * 2 }
}

export function WidgetGrid({ entities }: { entities: RoomEntity[] }) {
  if (entities.length === 0) {
    return (
      <div className="col-span-full flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: tokens.text.tertiary }}>Nessuna entità configurata</p>
      </div>
    )
  }
  return (
    <>
      {entities.map((e) => (
        <Tile key={e.id} type={e.type}>
          <EntityCard entity={e} size={visualSizeForEntity(e)} />
        </Tile>
      ))}
    </>
  )
}
