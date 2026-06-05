import { Lightbulb, Thermometer, Blinds, Power } from 'lucide-react'
import { useHomeSummary } from '../../hooks/useHomeSummary'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'

/**
 * Glanceable live summary of the house with one-tap actions — the kind of thing
 * you read across the room from a wall tablet. Only shows chips that are relevant.
 */
export function QuickStats() {
  const { lightsOn, lightIds, climateActive, coversOpen, avgIndoorTemp } = useHomeSummary()
  const { call } = useHAService()
  const { medium } = useHaptic()
  const tempUnit = useEntityStore((s) => s.temperatureUnit)

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
          className="press-card flex items-center gap-2 rounded-full bg-[rgba(234,179,8,0.16)] py-2.5 pl-3.5 pr-3 text-[15px] font-medium text-[#7a5b08] active:scale-95"
        >
          <Lightbulb size={17} className="fill-[#eab308]/30" />
          <span className="tabular-nums">{lightsOn}</span>
          <span className="text-[#7a5b08]/70">{lightsOn === 1 ? 'luce accesa' : 'luci accese'}</span>
          <span className="ml-1 flex items-center gap-1 rounded-full bg-black/8 px-2 py-0.5 text-xs text-[#7a5b08]">
            <Power size={11} /> Spegni
          </span>
        </button>
      )}

      {avgIndoorTemp !== null && (
        <div className="flex items-center gap-2 rounded-full bg-black/[0.05] py-2.5 px-3.5 text-[15px] font-medium text-black/70">
          <Thermometer size={17} className="text-[#0066cc]" />
          <span className="tabular-nums">{avgIndoorTemp}{tempUnit}</span>
          <span className="text-black/40">in casa</span>
        </div>
      )}

      {climateActive > 0 && (
        <div className="flex items-center gap-2 rounded-full bg-[rgba(220,38,38,0.10)] py-2.5 px-3.5 text-[15px] font-medium text-[#b91c1c]">
          <Thermometer size={17} />
          <span className="tabular-nums">{climateActive}</span>
          <span className="text-[#b91c1c]/70">clima attivo</span>
        </div>
      )}

      {coversOpen > 0 && (
        <div className="flex items-center gap-2 rounded-full bg-black/[0.05] py-2.5 px-3.5 text-[15px] font-medium text-black/70">
          <Blinds size={17} className="text-[#7c3aed]" />
          <span className="tabular-nums">{coversOpen}</span>
          <span className="text-black/40">{coversOpen === 1 ? 'aperta' : 'aperte'}</span>
        </div>
      )}
    </div>
  )
}
