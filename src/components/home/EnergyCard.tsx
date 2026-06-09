import { Zap } from 'lucide-react'
import type { HassEntities } from 'home-assistant-js-websocket'
import { GlassCard } from '../glass/GlassCard'
import { Sparkline } from '../charts/Sparkline'
import { useEntityStore } from '../../store/entities'
import { useHistory } from '../../hooks/useHistory'
import { tokens } from '../../design/tokens'

function findPowerEntity(entities: HassEntities) {
  return Object.values(entities).find((entity) => {
    const deviceClass = entity.attributes?.device_class
    const unit = entity.attributes?.unit_of_measurement
    return entity.entity_id.startsWith('sensor.') && (deviceClass === 'power' || unit === 'W' || unit === 'kW')
  })
}

export function EnergyCard() {
  const entities = useEntityStore((s) => s.entities)
  const powerEntity = findPowerEntity(entities)
  const unit = (powerEntity?.attributes?.unit_of_measurement as string | undefined) ?? 'W'
  const rawValue = Number(powerEntity?.state)
  const watts = Number.isFinite(rawValue) ? (unit === 'kW' ? rawValue * 1000 : rawValue) : undefined
  const kilowatts = watts === undefined ? undefined : watts / 1000
  const { data: history } = useHistory(powerEntity?.entity_id, 1)
  const values = (history ?? []).map((point) => {
    const state = Number(point.state)
    return Number.isFinite(state) ? (unit === 'kW' ? state : state / 1000) : NaN
  })
  const color =
    watts === undefined ? tokens.text.tertiary :
    watts > 2500 ? tokens.accent.red :
    watts > 1200 ? tokens.accent.orange :
    tokens.accent.green

  return (
    <GlassCard depth glow={watts && watts > 1200 ? tokens.accent.orangeGlow : undefined} className="min-h-[184px]">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-black/8">
            <Zap size={18} style={{ color }} />
          </div>
          <span className="rounded-full bg-black/8 px-2 py-1 text-[10px] text-black/45">live</span>
        </div>
        <div className="mt-auto">
          <p className="text-[32px] font-semibold leading-none tabular-nums text-[#1d1d1f]">
            {kilowatts === undefined ? '--' : kilowatts.toFixed(2)}
            <span className="ml-1 text-sm font-normal text-black/40">kW</span>
          </p>
          <p className="mt-2 text-xs text-black/40">{(powerEntity?.attributes?.friendly_name as string | undefined) ?? 'Consumo istantaneo'}</p>
          <Sparkline values={values} color={color} className="mt-3 h-8 w-full" />
        </div>
      </div>
    </GlassCard>
  )
}
