import { useState } from 'react'
import { StatusHeader } from './layers/StatusHeader'
import { NowSection } from './layers/NowSection'
import { RoomsRow, type RoomTarget } from './layers/RoomsRow'
import { EntitySheet } from './layers/EntitySheet'
import { TimelineSheet } from './layers/TimelineSheet'
import { GlassCard } from '../glass/GlassCard'
import { AnimatedCard } from '../anim/AnimatedCard'
import { WeatherWidget } from '../weather/WeatherWidget'
import { SceneRow } from '../layout/SceneRow'
import { useComposedHome } from '../../hooks/useComposedHome'
import { useTabletLayout } from '../../hooks/useTabletLayout'
import { useUIStore } from '../../store/ui'
import type { AlertChip } from '../../lib/composer'

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
  const [sheet, setSheet] = useState<RoomTarget | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)

  const openAlert = (chip: AlertChip) => {
    if (chip.entityIds.length === 1) setSelectedEntity(chip.entityIds[0])
    else if (chip.entityIds.length > 1) setSheet({ title: chip.label, entityIds: chip.entityIds })
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 pb-8">
      <StatusHeader userName={layout?.userName} alerts={composed.alerts} onAlertTap={openAlert} onClockTap={() => setTimelineOpen(true)} />

      {composed.quiet ? <QuietSection /> : <NowSection hero={composed.hero} overrides={layout?.deviceOverrides} />}

      <RoomsRow
        hiddenEntities={layout?.hiddenEntities}
        overrides={layout?.deviceOverrides}
        onOpen={setSheet}
      />

      <EntitySheet target={sheet} overrides={layout?.deviceOverrides} onClose={() => setSheet(null)} />
      <TimelineSheet open={timelineOpen} onClose={() => setTimelineOpen(false)} />
    </div>
  )
}

/** Quiete: niente in corso — Momenti (scene) e meteo esteso. */
function QuietSection() {
  return (
    <section className="grid shrink-0 grid-cols-1 gap-3.5 xl:grid-cols-2">
      <AnimatedCard depth ambient="drift" index={1} ambientColor="rgba(41,151,255,0.12)" noPadding className="min-h-[200px]">
        <div className="h-full overflow-hidden p-[14px]"><WeatherWidget /></div>
      </AnimatedCard>
      <GlassCard depth className="flex min-h-[200px] items-center overflow-hidden">
        <SceneRow />
      </GlassCard>
    </section>
  )
}
