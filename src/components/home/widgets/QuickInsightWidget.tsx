import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useHomeSummary } from '../../../hooks/useHomeSummary'
import { useHomeStatus } from '../../../hooks/useHomeStatus'
import { useDoorbellEvents } from '../../../store/doorbellEvents'
import { AnimatedCard } from '../../anim/AnimatedCard'
import { timeAgo } from '../../../lib/time'
import type { WidgetSize } from '../../../api/backend'

/** Rotating one-line insights synthesized from live house state. */
export function QuickInsightWidget({ size }: { size: WidgetSize }) {
  const { lightsOn, climateActive, coversOpen, avgIndoorTemp } = useHomeSummary()
  const status = useHomeStatus()
  const lastEvent = useDoorbellEvents((s) => s.events[0])

  const insights = useMemo(() => {
    const out: string[] = []
    out.push(status.tone === 'ok' ? 'Tutto sotto controllo' : status.label)
    if (lightsOn > 0) out.push(`${lightsOn} ${lightsOn === 1 ? 'luce accesa' : 'luci accese'}`)
    if (avgIndoorTemp !== null) out.push(`${avgIndoorTemp}°C in casa`)
    if (climateActive > 0) out.push(`${climateActive} clima ${climateActive === 1 ? 'attivo' : 'attivi'}`)
    if (coversOpen > 0) out.push(`${coversOpen} ${coversOpen === 1 ? 'tapparella aperta' : 'tapparelle aperte'}`)
    if (lastEvent) out.push(`Ultimo squillo ${timeAgo(lastEvent.timestamp)}`)
    return out.length ? out : ['Sistema online']
  }, [status, lightsOn, avgIndoorTemp, climateActive, coversOpen, lastEvent])

  const [i, setI] = useState(0)
  useEffect(() => {
    if (insights.length < 2) return
    const id = setInterval(() => setI((x) => (x + 1) % insights.length), 6000)
    return () => clearInterval(id)
  }, [insights.length])

  const text = insights[i % insights.length]
  const expanded = size === 'lg' || size === 'wide'

  return (
    <AnimatedCard depth ambient="sheen" index={6} className="h-full" contentClassName="justify-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
        <Sparkles size={17} className="amb-float" />
      </div>
      {expanded ? (
        <div className="min-h-0 overflow-hidden">
          <p className="text-lg font-semibold text-[#1d1d1f]">In questo momento</p>
          <div className={size === 'wide' ? 'mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5' : 'mt-2 space-y-2'}>
            {insights.slice(0, 4).map((insight, index) => (
              <div key={insight} className="flex items-center gap-2 text-sm text-black/65">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0066cc]" />
                <span className={index === 0 ? 'truncate font-semibold text-black/80' : 'truncate'}>{insight}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.p
            key={text}
            className={size === 'sm' ? 'line-clamp-2 text-sm font-semibold leading-tight text-[#1d1d1f]' : 'text-base font-semibold leading-tight text-[#1d1d1f]'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
          >
            {text}
          </motion.p>
        </AnimatePresence>
      )}
    </AnimatedCard>
  )
}
