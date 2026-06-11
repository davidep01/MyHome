import { useState } from 'react'
import { StatusHeader } from './layers/StatusHeader'
import { NowSection } from './layers/NowSection'
import { RoomsRow, type RoomTarget } from './layers/RoomsRow'
import { EntitySheet } from './layers/EntitySheet'
import { TimelineSheet } from './layers/TimelineSheet'
import { SpacesCatalog } from './layers/SpacesCatalog'
import { GlassCard } from '../glass/GlassCard'
import { AnimatedCard } from '../anim/AnimatedCard'
import { WeatherWidget } from '../weather/WeatherWidget'
import { SceneRow } from '../layout/SceneRow'
import { EnergyCard } from './layers/EnergyCard'
import { AmbientLayer } from './layers/AmbientLayer'
import { DuskLayer } from './layers/DuskLayer'
import { useComposedHome, type HomeChip } from '../../hooks/useComposedHome'
import { useTabletLayout } from '../../hooks/useTabletLayout'
import { useHaptic } from '../../hooks/useHaptic'
import { callService } from '../../api/ha-websocket'
import { useUIStore } from '../../store/ui'

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
  const [sheet, setSheet] = useState<RoomTarget | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [spacesOpen, setSpacesOpen] = useState(false)

  const openAlert = (chip: HomeChip) => {
    if (chip.entityIds.length === 1) setSelectedEntity(chip.entityIds[0])
    else if (chip.entityIds.length > 1) setSheet({ title: chip.label, entityIds: chip.entityIds })
  }

  // Il tap sul bottone-azione del suggerimento È la conferma (mai auto-esecuzione).
  const runAlertAction = (chip: HomeChip) => {
    if (!chip.action) return
    medium()
    callService(chip.action.domain, chip.action.service, { entity_id: chip.action.entityIds }).catch(() => {})
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 pb-8">
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

      {/* Strato 4 + polish: ambient su idle (mai sopra un'anomalia danger) e dusk shift */}
      <AmbientLayer
        wakeEntityId={layout?.kiosk?.wakeEntityId}
        forceWake={composed.alerts.some((a) => a.severity === 'danger')}
      />
      <DuskLayer />
    </div>
  )
}

/** Quiete: niente in corso — Momenti (scene), meteo esteso ed energia (se c'è). */
function QuietSection() {
  return (
    <section className="grid shrink-0 grid-cols-1 gap-3.5 xl:grid-cols-3">
      <AnimatedCard depth ambient="drift" index={1} ambientColor="rgba(41,151,255,0.12)" noPadding className="min-h-[200px] xl:col-span-2">
        <div className="h-full overflow-hidden p-[14px]"><WeatherWidget /></div>
      </AnimatedCard>
      <EnergyCard />
      <GlassCard depth className="flex min-h-[120px] items-center overflow-hidden xl:col-span-3">
        <SceneRow />
      </GlassCard>
    </section>
  )
}
