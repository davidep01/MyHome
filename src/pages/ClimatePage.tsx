import { ClimateSummaryCard } from '../components/home/ClimateSummaryCard'
import { SectionBand } from '../components/home/SectionBand'
import { WidgetGrid } from '../components/widgets/WidgetGrid'
import { useRooms } from '../hooks/useRooms'
import { withAllRoom } from '../lib/rooms'

export function ClimatePage() {
  const { data, isError } = useRooms()
  const entities = withAllRoom(data)[0]?.entities.filter((entity) => entity.type === 'climate') ?? []

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-[#1d1d1f] sm:text-3xl">Clima</h1>
        <p className="mt-1 text-sm text-black/45">Termostati e zone climatiche</p>
      </div>
      <ClimateSummaryCard />
      <SectionBand title="Zone" count={entities.length}>
        {isError ? (
          <p className="col-span-full py-12 text-center text-sm text-red-300/80">Backend non raggiungibile</p>
        ) : (
          <WidgetGrid entities={entities} />
        )}
      </SectionBand>
    </div>
  )
}
