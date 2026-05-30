import { motion, AnimatePresence } from 'framer-motion'
import { CloudSun, Newspaper } from 'lucide-react'
import { useState } from 'react'
import { WeatherWidget } from '../weather/WeatherWidget'
import { NewsWidget } from '../news/NewsWidget'
import { GlassCard } from '../glass/GlassCard'
import { ContextualPanel } from '../contextual/ContextualPanel'
import { useUIStore } from '../../store/ui'
import { framerSpring } from '../../design/tokens'
import { cn } from '../../lib/utils'

type Tab = 'weather' | 'news'

function DefaultPanel() {
  const [tab, setTab] = useState<Tab>('weather')

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="glass glass-border flex gap-1 rounded-[16px] p-1">
        {(['weather', 'news'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-2 text-xs font-medium transition-all',
              tab === t ? 'bg-white/12 text-white' : 'text-white/40 hover:text-white/60',
            )}
          >
            {t === 'weather' ? <CloudSun size={13} /> : <Newspaper size={13} />}
            {t === 'weather' ? 'Meteo' : 'News'}
          </button>
        ))}
      </div>

      <GlassCard noPadding className="flex-1 overflow-hidden p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={framerSpring}
            className="h-full"
          >
            {tab === 'weather' ? <WeatherWidget /> : <NewsWidget />}
          </motion.div>
        </AnimatePresence>
      </GlassCard>
    </div>
  )
}

export function RightPanel() {
  const selectedEntityId = useUIStore((s) => s.selectedEntityId)

  return (
    <div className="h-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedEntityId ?? 'default'}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={framerSpring}
          className="h-full"
        >
          {selectedEntityId ? <ContextualPanel entityId={selectedEntityId} /> : <DefaultPanel />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
