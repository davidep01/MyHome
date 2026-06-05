import type { CSSProperties, ReactNode } from 'react'
import type { EntityType, RoomEntity } from '../../api/backend'
import { tokens } from '../../design/tokens'
import { GlassCard } from '../glass/GlassCard'
import { AlarmCard } from './AlarmCard'
import { CameraCard } from './CameraCard'
import { ClimateCard } from './ClimateCard'
import { CoverCard } from './CoverCard'
import { LightCard } from './LightCard'
import { LockCard } from './LockCard'
import { MediaCard } from './MediaCard'
import { SceneCard } from './SceneCard'
import { SecurityCard } from './SecurityCard'
import { SensorStatCard } from './SensorStatCard'
import { SwitchCard } from './SwitchCard'
import { VacuumCard } from './VacuumCard'
import { NumberCard } from './NumberCard'
import { SelectCard } from './SelectCard'
import { ButtonCard } from './ButtonCard'
import { BinarySensorCard } from './BinarySensorCard'
import { SirenCard } from './SirenCard'
import { FanCard } from './FanCard'

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
}

function Tile({ type, children }: { type: EntityType; children: ReactNode }) {
  const span = SPAN[type] ?? { c: 1, r: 1 }
  const style: CSSProperties = { gridColumn: `span ${span.c}`, gridRow: `span ${span.r}` }
  return <div className="min-w-0" style={style}>{children}</div>
}

function UnsupportedEntityCard({ entity }: { entity: RoomEntity }) {
  return (
    <GlassCard className="flex h-full flex-col justify-center gap-1">
      <p className="text-sm font-medium text-black/85">{entity.label}</p>
      <p className="truncate font-mono text-xs text-black/35">{entity.entityId}</p>
    </GlassCard>
  )
}

function renderCard(e: RoomEntity): ReactNode {
  const cls = 'h-full'
  switch (e.type) {
    case 'light': return <LightCard entityId={e.entityId} label={e.label} className={cls} />
    case 'climate': return <ClimateCard entityId={e.entityId} label={e.label} className={cls} />
    case 'cover': return <CoverCard entityId={e.entityId} label={e.label} className={cls} />
    case 'scene': return <SceneCard entityId={e.entityId} label={e.label} className={cls} icon={e.icon} />
    case 'media': return <MediaCard entityId={e.entityId} label={e.label} className={cls} />
    case 'switch': return <SwitchCard entityId={e.entityId} label={e.label} className={cls} iconName={e.icon} />
    case 'camera': return <CameraCard entityId={e.entityId} label={e.label} className={cls} />
    case 'security': return <SecurityCard entityId={e.entityId} label={e.label} className={cls} />
    case 'vacuum': return <VacuumCard entityId={e.entityId} label={e.label} className={cls} />
    case 'lock': return <LockCard entityId={e.entityId} label={e.label} className={cls} />
    case 'alarm': return <AlarmCard entityId={e.entityId} label={e.label} className={cls} />
    case 'sensor': return <SensorStatCard entityId={e.entityId} label={e.label} className={cls} />
    case 'number': return <NumberCard entityId={e.entityId} label={e.label} className={cls} />
    case 'select': return <SelectCard entityId={e.entityId} label={e.label} className={cls} />
    case 'button': return <ButtonCard entityId={e.entityId} label={e.label} className={cls} />
    case 'binary_sensor': return <BinarySensorCard entityId={e.entityId} label={e.label} className={cls} />
    case 'siren': return <SirenCard entityId={e.entityId} label={e.label} className={cls} />
    case 'fan': return <FanCard entityId={e.entityId} label={e.label} className={cls} />
    default: return <UnsupportedEntityCard entity={e} />
  }
}

/** Renders the right card for a single entity (reused by the editable grid). */
export function EntityCard({ entity }: { entity: RoomEntity }) {
  return <>{renderCard(entity)}</>
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
        <Tile key={e.id} type={e.type}>{renderCard(e)}</Tile>
      ))}
    </>
  )
}
