import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useDashboardConfig } from '../../../hooks/useDashboardConfig'
import { AnimatedCard } from '../../anim/AnimatedCard'
import type { WidgetSize } from '../../../api/backend'

export function ClockWidget({ size, userName }: { size: WidgetSize; userName?: string }) {
  const { time, date } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: config } = useDashboardConfig(userName === undefined)
  const expanded = size === 'lg'
  const name = userName ?? config?.userName ?? 'Casa'

  return (
    <AnimatedCard depth ambient="sheen" index={0} className="h-full" contentClassName="justify-center">
      <div
        className="font-light leading-none tracking-[-0.03em] text-[#1d1d1f] tabular-nums"
        style={{
          fontSize: size === 'sm' ? 'clamp(30px, 5vw, 42px)'
            : size === 'md' ? 'clamp(42px, 6vw, 58px)'
              : size === 'lg' ? 'clamp(58px, 8vw, 78px)'
                : 'clamp(46px, 6vw, 62px)',
        }}
      >
        {time}
      </div>
      <div className="mt-2 truncate text-sm capitalize text-black/45">{date}</div>
      {size !== 'sm' && <div className={expanded ? 'mt-1 truncate text-lg font-semibold text-black/70' : 'mt-0.5 truncate text-sm font-semibold text-black/70'}>{greeting}, {name}</div>}
    </AnimatedCard>
  )
}
