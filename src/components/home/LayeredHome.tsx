import { useMemo, useState } from 'react'
import { StatusHeader } from './layers/StatusHeader'
import { NowSection } from './layers/NowSection'
import { RoomsRow, type RoomTarget } from './layers/RoomsRow'
import { EntitySheet } from './layers/EntitySheet'
import { TimelineSheet } from './layers/TimelineSheet'
import { SpacesCatalog } from './layers/SpacesCatalog'
import { AnimatedCard } from '../anim/AnimatedCard'
import { WeatherWidget } from '../weather/WeatherWidget'
import { SceneRow } from '../layout/SceneRow'
import { EnergyCard } from './layers/EnergyCard'
import { DuskLayer } from './layers/DuskLayer'
import { useComposedHome, type HomeChip } from '../../hooks/useComposedHome'
import { useTabletLayout } from '../../hooks/useTabletLayout'
import { useHaptic } from '../../hooks/useHaptic'
import { callService } from '../../api/ha-websocket'
import { useUIStore } from '../../store/ui'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'
import { selectDashboardCameraIds } from '../../lib/dashboardSelection'
import { useRoomsOverview } from '../../hooks/useRoomsOverview'
import { CameraMonitoringRow } from './layers/CameraMonitoringRow'
import { RoomDashboard } from './layers/RoomDashboard'
import { useCameraRowVisibility } from '../../hooks/useCameraRowVisibility'

/**
 * Home a strati (DOMINICA M1): si compone da sola, zero gestione.
 *   1. StatusHeader — ora, temperature, notifiche e chip-anomalia.
 *   2. Monitoraggio — prima fila stabile di tre camere.
 *   3. Adesso — card scelte per rilevanza dal composer (o Momenti se quiete).
 *   4. Stanze — seleziona una dashboard kiosk dedicata, non un popup.
 * La griglia manuale resta raggiungibile con localStorage['myhome.home']='grid'.
 */
export function LayeredHome() {
  const { data: layout } = useTabletLayout('home')
  const composed = useComposedHome({
    hiddenEntities: layout?.hiddenEntities,
    deviceOverrides: layout?.deviceOverrides,
  })
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const { medium } = useHaptic()
  const { actionFailed } = useActionFeedback()
  const entities = useEntityStore((state) => state.entities)
  const { rooms } = useRoomsOverview({
    hiddenEntities: layout?.hiddenEntities,
    overrides: layout?.deviceOverrides,
  })
  const [alertSheet, setAlertSheet] = useState<RoomTarget | null>(null)
  const [activeRoomKey, setActiveRoomKey] = useState<string | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [spacesOpen, setSpacesOpen] = useState(false)
  const { cameraRowVisible, toggleCameraRow } = useCameraRowVisibility()
  const activeRoom = rooms.find((room) => room.key === activeRoomKey) ?? null
  const preferredCameraIds = useMemo(
    () => (layout?.doorbells ?? [])
      .filter((doorbell) => doorbell.active !== false && doorbell.cameraEntityId)
      .map((doorbell) => doorbell.cameraEntityId!),
    [layout?.doorbells],
  )
  const cameraIds = useMemo(() => selectDashboardCameraIds(entities, {
    hiddenEntities: layout?.hiddenEntities,
    overrides: layout?.deviceOverrides,
    preferredEntityIds: preferredCameraIds,
    limit: 3,
  }), [entities, layout?.hiddenEntities, layout?.deviceOverrides, preferredCameraIds])

  const openAlert = (chip: HomeChip) => {
    if (chip.entityIds.length === 1) setSelectedEntity(chip.entityIds[0])
    else if (chip.entityIds.length > 1) setAlertSheet({ key: chip.id, title: chip.label, entityIds: chip.entityIds })
  }

  const openRoom = (room: RoomTarget) => {
    setActiveRoomKey(room.key)
    setSpacesOpen(false)
  }

  // Il tap sul bottone-azione del suggerimento È la conferma (mai auto-esecuzione).
  const runAlertAction = async (chip: HomeChip) => {
    if (!chip.action) return
    medium()
    try {
      await callService(chip.action.domain, chip.action.service, { entity_id: chip.action.entityIds })
    } catch (error) {
      actionFailed()
      throw error
    }
  }

  return (
    <div className="h-full overflow-hidden">
      <div
        className="mx-auto grid h-full w-full max-w-[1440px] grid-rows-[auto_minmax(0,1fr)_auto] gap-[clamp(10px,1.8vh,20px)] overflow-hidden"
        style={{
          paddingTop: 'calc(clamp(10px, 2vh, 20px) + env(safe-area-inset-top))',
          paddingRight: 'calc(clamp(16px, 2vw, 28px) + env(safe-area-inset-right))',
          paddingBottom: 'calc(clamp(10px, 2vh, 20px) + env(safe-area-inset-bottom))',
          paddingLeft: 'calc(clamp(16px, 2vw, 28px) + env(safe-area-inset-left))',
        }}
      >
        <StatusHeader
          userName={layout?.userName}
          contextTitle={activeRoom?.title}
          alerts={composed.alerts}
          onAlertTap={openAlert}
          onAlertAction={runAlertAction}
          onClockTap={() => setTimelineOpen(true)}
          cameraRowVisible={cameraRowVisible}
          onCameraRowToggle={toggleCameraRow}
        />

        <div className="min-h-0 overflow-hidden">
          {activeRoom ? (
            <RoomDashboard room={activeRoom} overrides={layout?.deviceOverrides} />
          ) : (
            <div className={cn(
              'grid h-full min-h-0 overflow-hidden',
              cameraRowVisible ? 'grid-rows-[clamp(111px,17.25vh,162px)_minmax(0,1fr)] gap-3.5' : 'grid-rows-1',
            )}>
              {cameraRowVisible && <CameraMonitoringRow entityIds={cameraIds} overrides={layout?.deviceOverrides} compact />}
              <div className="min-h-0 overflow-hidden">
                {composed.quiet ? <QuietSection /> : <NowSection hero={composed.hero} overrides={layout?.deviceOverrides} />}
              </div>
            </div>
          )}
        </div>

        <RoomsRow
          hiddenEntities={layout?.hiddenEntities}
          overrides={layout?.deviceOverrides}
          onOpen={openRoom}
          onZoomOut={() => setSpacesOpen(true)}
          activeRoomKey={activeRoom?.key}
          onHome={() => setActiveRoomKey(null)}
        />

        {/* Zoom-out: il tap su una stanza chiude il catalogo e apre la relativa
            dashboard kiosk nello stesso canvas della Home. */}
        <SpacesCatalog
          open={spacesOpen}
          hiddenEntities={layout?.hiddenEntities}
          overrides={layout?.deviceOverrides}
          onClose={() => setSpacesOpen(false)}
          onOpenRoom={openRoom}
        />
        <EntitySheet target={alertSheet} overrides={layout?.deviceOverrides} onClose={() => setAlertSheet(null)} />
        <TimelineSheet open={timelineOpen} onClose={() => setTimelineOpen(false)} />

        {/* Strato 4: lo screensaver ambient è montato dal KioskShell così copre
            sia il composer sia la griglia manuale. */}
        <DuskLayer />
      </div>
    </div>
  )
}

/** Quiete: niente in corso — Momenti (scene), meteo esteso ed energia (se c'è). */
function QuietSection() {
  const hasScenes = useEntityStore((state) => Object.keys(state.entities).some((id) => id.startsWith('scene.')))
  const hasEnergy = useEntityStore((state) => Object.values(state.entities).some((entity) =>
    entity.attributes?.device_class === 'power'
    && entity.state !== 'unavailable'
    && Number.isFinite(Number.parseFloat(entity.state))))

  return (
    <section className="grid h-full min-h-0 grid-cols-1 gap-3.5 overflow-hidden sm:grid-cols-2 xl:grid-cols-3">
      <AnimatedCard
        depth
        ambient="drift"
        index={1}
        ambientColor="rgba(41,151,255,0.19)"
        noPadding
        className={cn('min-h-0 sm:col-span-2', hasEnergy ? 'xl:col-span-2' : 'xl:col-span-3')}
      >
        <div className="h-full overflow-hidden p-[14px]"><WeatherWidget /></div>
      </AnimatedCard>
      {hasEnergy && <div className="min-w-0 sm:col-span-2 xl:col-span-1 [&>*]:h-full">
        <EnergyCard />
      </div>}
      {hasScenes && <AnimatedCard depth ambient="drift" ambientColor="rgba(99,102,241,0.16)" index={3} className="flex min-h-0 items-center overflow-hidden sm:col-span-2 sm:min-w-0 xl:col-span-3">
        <SceneRow />
      </AnimatedCard>}
    </section>
  )
}
