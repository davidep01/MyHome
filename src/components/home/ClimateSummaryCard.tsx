import { ThermometerSun } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { RadialDial } from '../glass/RadialDial'
import { useEntityStore } from '../../store/entities'
import { tokens } from '../../design/tokens'
import { getClimateVisualState } from '../../lib/climate'

export function ClimateSummaryCard() {
  const entities = useEntityStore((s) => s.entities)
  const climates = Object.values(entities).filter((entity) => entity.entity_id.startsWith('climate.'))
  const temps = climates
    .map((entity) => entity.attributes?.current_temperature as number | undefined)
    .filter((value): value is number => typeof value === 'number')
  const average = temps.length ? temps.reduce((sum, value) => sum + value, 0) / temps.length : undefined
  const activeZones = climates.filter((entity) => {
    const action = getClimateVisualState(entity).activeAction
    return action === 'heating' || action === 'cooling' || action === 'drying' || action === 'fan'
  })
  const isHeating = activeZones.some((entity) => getClimateVisualState(entity).activeAction === 'heating')
  const isCooling = activeZones.some((entity) => getClimateVisualState(entity).activeAction === 'cooling')
  const color = isHeating ? tokens.accent.orange : isCooling ? tokens.accent.blue : tokens.accent.green

  return (
    <GlassCard depth glow={activeZones.length ? (isHeating ? tokens.accent.orangeGlow : isCooling ? tokens.accent.blueGlow : tokens.accent.greenGlow) : undefined} className="min-h-[184px]">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-black/8">
            <ThermometerSun size={19} style={{ color }} />
          </div>
          <p className="mt-4 text-sm font-semibold text-black/90">Clima</p>
          <p className="mt-1 text-xs text-black/40">
            {activeZones.length > 0
              ? `${activeZones.length} zone attive`
              : climates.length > 0 ? 'Impianti in pausa' : 'Nessun clima'}
          </p>
        </div>
        <RadialDial
          value={average ?? 0}
          min={10}
          max={30}
          color={color}
          label={average === undefined ? '--' : `${average.toFixed(1)}°`}
          sublabel="media"
        />
      </div>
    </GlassCard>
  )
}
