import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useHomeSummary } from '../../../hooks/useHomeSummary'
import { useHomeStatus } from '../../../hooks/useHomeStatus'
import { useDoorbellEvents } from '../../../store/doorbellEvents'
import { AnimatedCard } from '../../anim/AnimatedCard'
import { timeAgo } from '../../../lib/time'

/** Rotating one-line insights synthesized from live house state. */
export function QuickInsightWidget() {
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
    setI(0)
    if (insights.length < 2) return
    const id = setInterval(() => setI((x) => (x + 1) % insights.length), 6000)
    return () => clearInterval(id)
  }, [insights.length])

  const text = insights[Math.min(i, insights.length - 1)]

  return (
    <AnimatedCard ambient="sheen" index={6} contentClassName="justify-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
        <Sparkles size={17} className="amb-float" />
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={text}
          className="text-base font-semibold leading-tight text-[#1d1d1f]"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4 }}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </AnimatedCard>
  )
}
