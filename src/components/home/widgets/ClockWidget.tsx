import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useDashboardConfig } from '../../../hooks/useDashboardConfig'
import { GlassCard } from '../../glass/GlassCard'
import type { WidgetSize } from '../../../api/backend'

export function ClockWidget({ size }: { size: WidgetSize }) {
  const { time, date } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: config } = useDashboardConfig()
  const big = size !== 'sm'

  return (
    <GlassCard className="flex h-full flex-col justify-center">
      <div
        className="font-light leading-none tracking-[-0.03em] text-[#1d1d1f] tabular-nums"
        style={{ fontSize: big ? 'clamp(40px, 7vw, 64px)' : 'clamp(30px, 9vw, 44px)' }}
      >
        {time}
      </div>
      <div className="mt-2 truncate text-sm capitalize text-black/45">{date}</div>
      {big && <div className="mt-0.5 truncate text-sm font-medium text-black/70">{greeting}, {config?.userName ?? 'Casa'}</div>}
    </GlassCard>
  )
}
