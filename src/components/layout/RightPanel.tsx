import { motion, AnimatePresence } from 'framer-motion'
import { CloudSun, Newspaper } from 'lucide-react'
import { useState } from 'react'
import { WeatherWidget } from '../weather/WeatherWidget'
import { NewsWidget } from '../news/NewsWidget'
import { GlassCard } from '../glass/GlassCard'
import { framerSpring } from '../../design/tokens'
import { cn } from '../../lib/utils'

type Tab = 'weather' | 'news'

/** Weather + news panel — shown on-demand in a centered modal. */
export function InfoPanel() {
  const [tab, setTab] = useState<Tab>('weather')

  return (
    <div className="flex h-full min-h-[60vh] flex-col gap-3">
      <div className="glass glass-border flex gap-1 rounded-[16px] p-1">
        {(['weather', 'news'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-2 text-xs font-medium transition-all',
              tab === t ? 'bg-black/12 text-[#1d1d1f]' : 'text-black/40 hover:text-black/60',
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
