import { useState } from 'react'
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

/**
 * Home a strati (DOMINICA M1): si compone da sola, zero gestione.
 *   1. StatusHeader — ora, presenza, meteo, chip-anomalia. Sempre lì.
 *   2. Adesso — card scelte per rilevanza dal composer (o Momenti se quiete).
 *   3. Stanze — l'inventario completo, un tap di distanza.
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
  const [sheet, setSheet] = useState<RoomTarget | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [spacesOpen, setSpacesOpen] = useState(false)

  const openAlert = (chip: HomeChip) => {
    if (chip.entityIds.length === 1) setSelectedEntity(chip.entityIds[0])
    else if (chip.entityIds.length > 1) setSheet({ title: chip.label, entityIds: chip.entityIds })
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
    <div className="h-full overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
      <div
        className="mx-auto flex min-h-full w-full max-w-[1440px] flex-col gap-4 sm:gap-5 xl:gap-6"
        style={{
          paddingTop: 'calc(clamp(16px, 2vw, 24px) + env(safe-area-inset-top))',
          paddingRight: 'calc(clamp(16px, 2vw, 28px) + env(safe-area-inset-right))',
          paddingBottom: 'calc(28px + env(safe-area-inset-bottom))',
          paddingLeft: 'calc(clamp(16px, 2vw, 28px) + env(safe-area-inset-left))',
        }}
      >
        <StatusHeader userName={layout?.userName} alerts={composed.alerts} onAlertTap={openAlert} onAlertAction={runAlertAction} onClockTap={() => setTimelineOpen(true)} />

        {composed.quiet ? <QuietSection /> : <NowSection hero={composed.hero} overrides={layout?.deviceOverrides} />}

        <RoomsRow
          hiddenEntities={layout?.hiddenEntities}
          overrides={layout?.deviceOverrides}
          onOpen={setSheet}
          onZoomOut={() => setSpacesOpen(true)}
        />

        {/* Zoom-out: il catalogo Spazi sta SOTTO l'EntitySheet — il tap su una
            stanza apre lo sheet sopra il catalogo (drill-down, non swap). */}
        <SpacesCatalog
          open={spacesOpen}
          hiddenEntities={layout?.hiddenEntities}
          overrides={layout?.deviceOverrides}
          onClose={() => setSpacesOpen(false)}
          onOpenRoom={setSheet}
        />
        <EntitySheet target={sheet} overrides={layout?.deviceOverrides} onClose={() => setSheet(null)} />
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
    <section className="grid shrink-0 grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
      <AnimatedCard
        depth
        ambient="drift"
        index={1}
        ambientColor="rgba(41,151,255,0.19)"
        noPadding
        className={cn('min-h-[272px] sm:col-span-2', hasEnergy ? 'xl:col-span-2' : 'xl:col-span-3')}
      >
        <div className="h-full overflow-hidden p-[14px]"><WeatherWidget /></div>
      </AnimatedCard>
      {hasEnergy && <div className="min-w-0 sm:col-span-2 xl:col-span-1 [&>*]:h-full">
        <EnergyCard />
      </div>}
      {hasScenes && <AnimatedCard depth ambient="drift" ambientColor="rgba(99,102,241,0.16)" index={3} className="flex min-h-[120px] items-center overflow-hidden sm:col-span-2 sm:min-w-0 xl:col-span-3">
        <SceneRow />
      </AnimatedCard>}
    </section>
  )
}
