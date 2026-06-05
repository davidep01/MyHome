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

const HOT = '#dc2626'
const COLD = '#0066cc'

export function SensorStatCard({ entityId, label, className }: SensorStatCardProps) {
  const entity = useHAEntity(entityId)
  const { data: history } = useHistory(entityId, 6)

  const value = Number(entity?.state)
  const hasValue = Number.isFinite(value)
  const deviceClass = entity?.attributes?.device_class as string | undefined
  const unit = (entity?.attributes?.unit_of_measurement as string | undefined) ?? ''
  const isTemp = deviceClass === 'temperature' || unit === '°C' || unit === '°F'

  const values = (history ?? []).map((p) => Number(p.state)).filter(Number.isFinite)
  const trend = values.length > 1 ? values[values.length - 1] - values[0] : 0

  // Temperature: hot → red, cold → blue. Otherwise trend up=green, down=orange.
  let lineColor = trend >= 0 ? tokens.accent.green : tokens.accent.orange
  let valueColor = tokens.text.primary
  if (isTemp && hasValue) {
    const c = unit === '°F' ? (value - 32) * (5 / 9) : value
    if (c >= 24) { lineColor = HOT; valueColor = HOT }
    else if (c <= 18) { lineColor = COLD; valueColor = COLD }
  }

  return (
    <GlassCard className={cn('flex h-full flex-col justify-between min-h-[100px]', className)}>
      <p className="truncate text-xs font-medium text-black/55">{label}</p>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-semibold leading-none tabular-nums" style={{ color: valueColor }}>
          {hasValue ? value : (entity?.state ?? '--')}
        </span>
        {unit && <span className="mb-0.5 text-xs text-black/40">{unit}</span>}
      </div>
      <Sparkline
        values={values.length > 1 ? values : [value || 0, value || 0]}
        color={lineColor}
        className="mt-1 h-5 w-full opacity-70"
      />
    </GlassCard>
  )
}
