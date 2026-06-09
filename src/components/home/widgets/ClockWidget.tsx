import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useDashboardConfig } from '../../../hooks/useDashboardConfig'
import { AnimatedCard } from '../../anim/AnimatedCard'
import type { WidgetSize } from '../../../api/backend'

export function ClockWidget({ size, userName }: { size: WidgetSize; userName?: string }) {
  const { time, date } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: config } = useDashboardConfig(userName === undefined)
  const big = size !== 'sm'
  const name = userName ?? config?.userName ?? 'Casa'

  return (
    <AnimatedCard depth ambient="sheen" index={0} contentClassName="justify-center">
      <div
        className="font-light leading-none tracking-[-0.03em] text-[#1d1d1f] tabular-nums"
        style={{ fontSize: big ? 'clamp(40px, 7vw, 64px)' : 'clamp(30px, 9vw, 44px)' }}
      >
        {time}
      </div>
      <div className="mt-2 truncate text-sm capitalize text-black/45">{date}</div>
      {big && <div className="mt-0.5 truncate text-sm font-medium text-black/70">{greeting}, {name}</div>}
    </AnimatedCard>
  )
}
