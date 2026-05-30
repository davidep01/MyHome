import { GlassCard } from '../glass/GlassCard'
import { Sparkline } from '../charts/Sparkline'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHistory } from '../../hooks/useHistory'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface SensorStatCardProps {
  entityId: string
  label: string
  className?: string
}

export function SensorStatCard({ entityId, label, className }: SensorStatCardProps) {
  const entity = useHAEntity(entityId)
  const { data: history } = useHistory(entityId, 6)

  const value = Number(entity?.state)
  const hasValue = Number.isFinite(value)
  const unit = (entity?.attributes?.unit_of_measurement as string | undefined) ?? '%'
  const values = (history ?? []).map((p) => Number(p.state)).filter(Number.isFinite)
  const trend = values.length > 1 ? values[values.length - 1] - values[0] : 0
  const color = trend >= 0 ? tokens.accent.green : tokens.accent.orange

  return (
    <GlassCard className={cn('flex flex-col justify-between min-h-[110px]', className)}>
      <p className="truncate text-xs font-medium text-white/55">{label}</p>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-semibold tabular-nums text-white">{hasValue ? value : '--'}</span>
        <span className="mb-1 text-xs text-white/40">{unit}</span>
      </div>
      <Sparkline
        values={values.length > 1 ? values : [value || 0, value || 0]}
        color={color}
        className="mt-1 h-6 w-full opacity-70"
      />
    </GlassCard>
  )
}
