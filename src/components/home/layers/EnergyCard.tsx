import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import { GlassCard } from '../../glass/GlassCard'
import { haApi } from '../../../api/backend'
import { useEntityStore } from '../../../store/entities'
import { cn } from '../../../lib/utils'
import { entityName } from '../../widgets/utils/mapEntityToWidgetCard'

/**
 * Energia onesta (DOMINICA M5): capability-gated — senza sensori di potenza la
 * card non esiste. Niente somme arbitrarie tra sottocircuiti: mostra il
 * sensore più attivo e lo confronta con la SUA media delle ultime 24h
 * (baseline statistica leggibile, non "ML").
 */
export function EnergyCard() {
  const entities = useEntityStore((s) => s.entities)

  const sensor = useMemo(() => {
    const candidates = Object.values(entities).filter((e) =>
      e.attributes?.device_class === 'power'
      && e.state !== 'unavailable'
      && Number.isFinite(parseFloat(e.state)))
    if (candidates.length === 0) return null
    return [...candidates].sort((a, b) => parseFloat(b.state) - parseFloat(a.state) || a.entity_id.localeCompare(b.entity_id))[0]
  }, [entities])

  const { data: history } = useQuery({
    queryKey: ['energy-baseline', sensor?.entity_id],
    enabled: Boolean(sensor),
    staleTime: 30 * 60 * 1000,
    queryFn: () => haApi.history(sensor!.entity_id, 24),
  })

  if (!sensor) return null

  const now = parseFloat(sensor.state)
  const unit = (sensor.attributes?.unit_of_measurement as string | undefined) ?? 'W'
  const values = (history ?? []).map((h) => parseFloat(h.state)).filter(Number.isFinite)
  const avg = values.length >= 8 ? values.reduce((a, b) => a + b, 0) / values.length : null
  const delta = avg && avg > 1 ? Math.round(((now - avg) / avg) * 100) : null

  return (
    <GlassCard
      depth
      className="flex min-h-[200px] flex-col justify-between"
      style={{ background: 'linear-gradient(145deg, rgba(245,158,11,0.16), color-mix(in srgb, var(--surface-solid) 72%, transparent) 72%)' }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-amber-500/12 text-amber-600">
          <Zap size={17} />
        </div>
        <p className="text-sm font-semibold text-[#1d1d1f]">Energia</p>
        {delta !== null && (
          <span className={cn(
            'ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums',
            delta > 15 ? 'bg-orange-500/12 text-[#c2410c]' : delta < -15 ? 'bg-green-500/12 text-green-700' : 'bg-black/[0.06] text-black/45',
          )}>
            {delta > 0 ? '+' : ''}{delta}% vs media 24h
          </span>
        )}
      </div>
      <div>
        <p className="text-[40px] font-light leading-none text-[#1d1d1f] tabular-nums">
          {Math.round(now)}<span className="ml-1 text-lg text-black/40">{unit}</span>
        </p>
        <p className="mt-2 truncate text-xs text-black/40">
          {entityName(sensor)}
        </p>
      </div>
    </GlassCard>
  )
}
