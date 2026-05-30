import { ThermometerSun } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { RadialDial } from '../glass/RadialDial'
import { useEntityStore } from '../../store/entities'
import { tokens } from '../../design/tokens'

export function ClimateSummaryCard() {
  const entities = useEntityStore((s) => s.entities)
  const climates = Object.values(entities).filter((entity) => entity.entity_id.startsWith('climate.'))
  const temps = climates
    .map((entity) => entity.attributes?.current_temperature as number | undefined)
    .filter((value): value is number => typeof value === 'number')
  const average = temps.length ? temps.reduce((sum, value) => sum + value, 0) / temps.length : undefined
  const activeZones = climates.filter((entity) => {
    const action = entity.attributes?.hvac_action
    return action === 'heating' || action === 'cooling'
  })
  const isHeating = activeZones.some((entity) => entity.attributes?.hvac_action === 'heating')
  const color = isHeating ? tokens.accent.orange : tokens.accent.blue

  return (
    <GlassCard glow={activeZones.length ? (isHeating ? tokens.accent.orangeGlow : tokens.accent.blueGlow) : undefined} className="min-h-[184px]">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/8">
            <ThermometerSun size={19} style={{ color }} />
          </div>
          <p className="mt-4 text-sm font-semibold text-white/90">Clima</p>
          <p className="mt-1 text-xs text-white/40">
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
