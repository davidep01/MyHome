import { useState } from 'react'
import { TimelineSheet } from '../layers/TimelineSheet'
import { useClock } from '../../../hooks/useClock'
import { useTimeOfDay } from '../../../hooks/useTimeOfDay'
import { useDashboardConfig } from '../../../hooks/useDashboardConfig'
import { AnimatedCard } from '../../anim/AnimatedCard'
import type { WidgetSize } from '../../../api/backend'

export function ClockWidget({ size, userName }: { size: WidgetSize; userName?: string }) {
  const [open,setOpen] = useState(false)
  const { time, date } = useClock()
  const { greeting } = useTimeOfDay()
  const { data: config } = useDashboardConfig(userName === undefined)
  const expanded = size === 'lg'
  const name = userName ?? config?.userName ?? 'Casa'

  return (
    <>
    <AnimatedCard depth ambient="sheen" index={0} className="h-full" contentClassName="justify-center">
      <button type="button" onClick={()=>setOpen(true)} aria-label="Apri attività di casa"
        className="min-h-11 w-fit text-left font-light leading-none tracking-[-0.03em] text-[var(--ink)] tabular-nums"
        style={{
          fontSize: size === 'xs' ? '28px' : size === 'sm' ? 'clamp(30px, 5vw, 42px)'
            : size === 'md' ? 'clamp(42px, 6vw, 58px)'
              : size === 'lg' ? 'clamp(58px, 8vw, 78px)'
                : 'clamp(46px, 6vw, 62px)',
        }}
      >
        {time}
      </button>
      <div className="mt-2 truncate text-sm capitalize text-[var(--ink-secondary)]">{date}</div>
      {size !== 'sm' && size !== 'xs' && <div className={expanded ? 'mt-1 truncate text-lg font-semibold text-[var(--ink)]' : 'mt-0.5 truncate text-sm font-semibold text-[var(--ink)]'}>{greeting}, {name}</div>}
    </AnimatedCard>
    <TimelineSheet open={open} onClose={()=>setOpen(false)} />
    </>
  )
}
