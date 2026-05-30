import { useMemo } from 'react'
import { EnergyCard } from '../components/home/EnergyCard'
import { SectionBand } from '../components/home/SectionBand'
import { Sparkline } from '../components/charts/Sparkline'
import { GlassCard } from '../components/glass/GlassCard'
import { useEntityStore } from '../store/entities'
import { tokens } from '../design/tokens'

export function EnergyPage() {
  const entities = useEntityStore((s) => s.entities)
  const sensors = useMemo(() => Object.values(entities).filter((entity) => {
    const deviceClass = entity.attributes?.device_class
    const unit = entity.attributes?.unit_of_measurement
    return entity.entity_id.startsWith('sensor.') && (deviceClass === 'power' || deviceClass === 'energy' || unit === 'W' || unit === 'kWh')
  }), [entities])

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-white sm:text-3xl">Energia</h1>
        <p className="mt-1 text-sm text-white/45">Consumi e produzione</p>
      </div>
      <EnergyCard />
      <SectionBand title="Sensori" count={sensors.length}>
        {sensors.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-white/40">Nessun sensore di consumo rilevato</p>
        ) : (
          sensors.map((sensor) => {
            const value = Number(sensor.state)
            return (
              <GlassCard key={sensor.entity_id} className="min-h-[120px]">
                <p className="truncate text-sm font-semibold text-white/85">{(sensor.attributes?.friendly_name as string | undefined) ?? sensor.entity_id}</p>
                <p className="mt-4 text-2xl font-semibold tabular-nums text-white">
                  {Number.isFinite(value) ? value : '--'}
                  <span className="ml-1 text-xs font-normal text-white/40">{sensor.attributes?.unit_of_measurement as string | undefined}</span>
                </p>
                <Sparkline values={[value, value, value]} color={tokens.accent.green} className="mt-4 h-7 w-full opacity-60" />
              </GlassCard>
            )
          })
        )}
      </SectionBand>
    </div>
  )
}
