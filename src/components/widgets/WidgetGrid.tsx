import type { RoomEntity } from '../../api/backend'
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

function UnsupportedEntityCard({ entity }: { entity: RoomEntity }) {
  return (
    <GlassCard className="flex min-h-[110px] flex-col justify-center gap-1">
      <p className="text-sm font-medium text-black/85">{entity.label}</p>
      <p className="truncate font-mono text-xs text-black/35">{entity.entityId}</p>
      <p className="text-xs text-black/25">{entity.type}</p>
    </GlassCard>
  )
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
      {entities.map((e) => {
        switch (e.type) {
          case 'light':
            return <LightCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'climate':
            return <ClimateCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'cover':
            return <CoverCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'scene':
            return <SceneCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'media':
            return <MediaCard key={e.id} entityId={e.entityId} label={e.label} className="col-span-2" />
          case 'switch':
            return <SwitchCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'camera':
            return <CameraCard key={e.id} entityId={e.entityId} label={e.label} className="col-span-2" />
          case 'security':
            return <SecurityCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'vacuum':
            return <VacuumCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'lock':
            return <LockCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'alarm':
            return <AlarmCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'sensor':
            return <SensorStatCard key={e.id} entityId={e.entityId} label={e.label} />
          default:
            return <UnsupportedEntityCard key={e.id} entity={e} />
        }
      })}
    </>
  )
}
