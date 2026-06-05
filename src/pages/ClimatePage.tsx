import { ClimateSummaryCard } from '../components/home/ClimateSummaryCard'
import { SectionBand } from '../components/home/SectionBand'
import { WidgetGrid } from '../components/widgets/WidgetGrid'
import { useDiscoveredEntities } from '../hooks/useDiscoveredEntities'

export function ClimatePage() {
  const { sections } = useDiscoveredEntities()
  const entities = sections.find((s) => s.domain === 'climate')?.entities ?? []

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[#1d1d1f] sm:text-3xl">Clima</h1>
        <p className="mt-1 text-sm text-black/45">Termostati e zone climatiche</p>
      </div>
      <ClimateSummaryCard />
      <SectionBand title="Zone" count={entities.length}>
        {entities.length === 0
          ? <p className="col-span-full py-8 text-center text-sm text-black/40">Nessuna zona climatica esposta da HA</p>
          : <WidgetGrid entities={entities} />}
      </SectionBand>
    </div>
  )
}
