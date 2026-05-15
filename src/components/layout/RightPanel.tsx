import { motion, AnimatePresence } from 'framer-motion'
import { CloudSun, Newspaper } from 'lucide-react'
import { useState } from 'react'
import { WeatherWidget } from '../weather/WeatherWidget'
import { NewsWidget } from '../news/NewsWidget'
import { GlassCard } from '../glass/GlassCard'
import { framerSpring } from '../../design/tokens'
import { cn } from '../../lib/utils'

type Tab = 'weather' | 'news'

export function RightPanel() {
  const [tab, setTab] = useState<Tab>('weather')

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Tabs */}
      <div className="glass glass-border flex rounded-[16px] p-1 gap-1">
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

      {/* Content */}
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
