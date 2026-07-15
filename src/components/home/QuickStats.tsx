import { Lightbulb, Thermometer, Blinds, Power } from 'lucide-react'
import { useHomeSummary } from '../../hooks/useHomeSummary'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { TEMP_UNIT } from '../../lib/units'
import { CountUp } from '../anim/CountUp'
import { LiveDot } from '../anim/LiveDot'

/**
 * Glanceable live summary of the house with one-tap actions — the kind of thing
 * you read across the room from a wall tablet. Only shows chips that are relevant.
 */
export function QuickStats() {
  const { lightsOn, lightIds, climateActive, coversOpen, avgIndoorTemp } = useHomeSummary()
  const { call } = useHAService()
  const { medium } = useHaptic()

  const allLightsOff = () => {
    if (lightIds.length === 0) return
    medium()
    call('light', 'turn_off', { entity_id: lightIds })
  }

  const hasAny = lightsOn > 0 || climateActive > 0 || coversOpen > 0 || avgIndoorTemp !== null
  if (!hasAny) return null

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Lights — tap to turn everything off */}
      {lightsOn > 0 && (
        <button
          onClick={allLightsOff}
          className="press-card flex items-center gap-2 rounded-full bg-[rgba(234,179,8,0.16)] py-2.5 pl-3.5 pr-3 text-[15px] font-semibold text-[#7a5b08] active:scale-95"
        >
          <Lightbulb size={17} className="amb-float fill-[#eab308]/30" />
          <CountUp value={lightsOn} className="tabular-nums" />
          <span className="text-[#7a5b08]/70">{lightsOn === 1 ? 'luce accesa' : 'luci accese'}</span>
          <span className="ml-1 flex items-center gap-1 rounded-full bg-black/8 px-2 py-0.5 text-xs text-[#7a5b08]">
            <Power size={11} /> Spegni
          </span>
        </button>
      )}

      {avgIndoorTemp !== null && (
        <div className="flex items-center gap-2 rounded-full bg-black/[0.05] py-2.5 px-3.5 text-[15px] font-semibold text-black/70">
          <Thermometer size={17} className="text-[#0066cc]" />
          <CountUp value={avgIndoorTemp} decimals={1} suffix={TEMP_UNIT} className="tabular-nums" />
          <span className="text-black/40">in casa</span>
        </div>
      )}

      {climateActive > 0 && (
        <div className="flex items-center gap-2 rounded-full bg-[rgba(220,38,38,0.10)] py-2.5 px-3.5 text-[15px] font-semibold text-[#b91c1c]">
          <LiveDot color="#dc2626" size={8} />
          <CountUp value={climateActive} className="tabular-nums" />
          <span className="text-[#b91c1c]/70">clima attivo</span>
        </div>
      )}

      {coversOpen > 0 && (
        <div className="flex items-center gap-2 rounded-full bg-black/[0.05] py-2.5 px-3.5 text-[15px] font-semibold text-black/70">
          <Blinds size={17} className="text-[#7c3aed]" />
          <CountUp value={coversOpen} className="tabular-nums" />
          <span className="text-black/40">{coversOpen === 1 ? 'aperta' : 'aperte'}</span>
        </div>
      )}
    </div>
  )
}
