import { useTabletLayout } from '../../../hooks/useTabletLayout'
import { formatExact } from '../../widgets/utils/formatWidgetValue'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import { GlassCard } from '../../glass/GlassCard'
import { haApi } from '../../../api/backend'
import { useEntityStore } from '../../../store/entities'
import { cn } from '../../../lib/utils'
import { entityName } from '../../widgets/utils/mapEntityToWidgetCard'
import {
  detectSolarSelfSufficiency, detectSustainedWaterFlow, findSolarProductionSensor, findWaterFlowSensor, timeWeightedPowerKw,
} from '../../../lib/consumptionInsights'
import { HOUSE_CONSUMPTION_ID, powerValueInKw } from '../../../lib/statusBarEnergy'

/**
 * Energia onesta (DOMINICA M5): capability-gated — senza sensori di potenza la
 * card non esiste. Niente somme arbitrarie tra sottocircuiti: mostra il
 * sensore più attivo e lo confronta con la SUA media delle ultime 24h
 * (baseline statistica leggibile, non "ML").
 */
export function EnergyCard() {
  const { data: layout } = useTabletLayout('home')
  const entities = useEntityStore((s) => s.entities)
  const connected = useEntityStore((s) => s.connected)

  const sensor = useMemo(() => {
    const candidates = Object.values(entities).filter((e) =>
      e.attributes?.device_class === 'power'
      && powerValueInKw(e.state, e.attributes?.unit_of_measurement) !== null)
    if (candidates.length === 0) return null
    return [...candidates].sort((a, b) => powerValueInKw(b.state, b.attributes?.unit_of_measurement)! - powerValueInKw(a.state, a.attributes?.unit_of_measurement)! || a.entity_id.localeCompare(b.entity_id))[0]
  }, [entities])

  const { data: history } = useQuery({
    queryKey: ['energy-baseline', sensor?.entity_id],
    enabled: connected && Boolean(sensor),
    refetchInterval: 5 * 60_000,
    refetchOnReconnect: true,
    staleTime: 30 * 60 * 1000,
    queryFn: () => haApi.history(sensor!.entity_id, 24),
  })

  const waterSensor = useMemo(() => findWaterFlowSensor(Object.values(entities)), [entities])
  const { data: waterHistory } = useQuery({
    queryKey: ['water-flow-history', waterSensor?.entityId],
    enabled: connected && Boolean(waterSensor),
    refetchInterval: 60_000,
    refetchOnReconnect: true,
    staleTime: 5 * 60 * 1000,
    queryFn: () => haApi.history(waterSensor!.entityId, 1),
  })
  const solarSensor = useMemo(() => findSolarProductionSensor(Object.values(entities), layout?.solarProductionEntityId), [entities, layout?.solarProductionEntityId])

  // Aggiornato a intervalli, mai letto direttamente durante il render.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  if (!sensor) return null

  const unit = (sensor.attributes?.unit_of_measurement as string | undefined) ?? 'W'
  const nowKw = powerValueInKw(sensor.state, unit)
  const avg = connected && history ? timeWeightedPowerKw(history, unit, nowMs - 24 * 60 * 60_000, nowMs) : null
  const delta = avg !== null && avg > 0.001 && nowKw !== null ? Math.round(((nowKw - avg) / avg) * 100) : null

  const waterInsight = connected && waterSensor && waterHistory
    ? detectSustainedWaterFlow(waterHistory, waterSensor.unit, nowMs)
    : null
  // Only the independently identified whole-house source can substantiate
  // self-sufficiency. The most active device is not household consumption.
  const house = entities[HOUSE_CONSUMPTION_ID]
  const consumptionKw = house ? powerValueInKw(house.state, house.attributes?.unit_of_measurement) : null
  const solarInsight = connected && solarSensor && solarSensor.entityId !== HOUSE_CONSUMPTION_ID && consumptionKw !== null
    ? detectSolarSelfSufficiency(consumptionKw, solarSensor.kw)
    : null

  return (
    <GlassCard
      depth
      className="flex min-h-[200px] flex-col justify-between"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-amber-500/12 text-amber-600">
          <Zap size={17} />
        </div>
        <p className="text-sm font-semibold text-[var(--ink)]">Energia</p>
        {delta !== null && (
          <span className={cn(
            'ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums',
            delta > 15 ? 'bg-orange-500/12 text-[#c2410c]' : delta < -15 ? 'bg-green-500/12 text-green-700' : 'bg-[var(--fill-muted)] text-[var(--ink-secondary)]',
          )}>
            {delta > 0 ? '+' : ''}{delta}% vs media 24h
          </span>
        )}
      </div>
      <div>
        <p className="text-[40px] font-light leading-none text-[var(--ink)] tabular-nums">
          {/* Valore come lo riporta HA: 0,03 kW resta 0,03, mai arrotondato a 0. */}
          {formatExact(sensor.state)}<span className="ml-1 text-lg text-[var(--ink-tertiary)]">{unit}</span>
        </p>
        <p className="mt-2 truncate text-xs text-[var(--ink-tertiary)]">
          {entityName(sensor)}
        </p>
        {(waterInsight || solarInsight) && (
          <div className="mt-1.5 space-y-0.5">
            {waterInsight && <p className="text-[11px] font-semibold leading-snug text-[#c2410c]">{waterInsight.text}</p>}
            {solarInsight && <p className="text-[11px] font-semibold leading-snug text-green-700">{solarInsight.text}</p>}
          </div>
        )}
      </div>
    </GlassCard>
  )
}
