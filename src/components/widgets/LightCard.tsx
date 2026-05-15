import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lightbulb } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { GlassSheet } from '../glass/GlassSheet'
import { DragSlider } from '../glass/DragSlider'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useLongPress } from '../../hooks/useLongPress'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface LightCardProps {
  entityId: string
  label: string
  className?: string
}

export function LightCard({ entityId, label, className }: LightCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light: hapticLight, medium: hapticMedium } = useHaptic()
  const [sheetOpen, setSheetOpen] = useState(false)

  const isOn = entity?.state === 'on'
  const brightness = entity?.attributes?.brightness
    ? Math.round((entity.attributes.brightness / 255) * 100)
    : 0
  const unavailable = !entity || entity.state === 'unavailable'

  const toggle = () => {
    if (unavailable) return
    hapticLight()
    call('light', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId })
  }

  const openDimmer = () => {
    if (unavailable) return
    hapticMedium()
    setSheetOpen(true)
  }

  const longPress = useLongPress(openDimmer, toggle)

  const setBrightness = (val: number) => {
    call('light', 'turn_on', { entity_id: entityId, brightness_pct: val })
  }

  return (
    <>
      <GlassCard
        interactive
        glow={isOn ? tokens.accent.blueGlow : undefined}
        className={cn('flex flex-col gap-3 min-h-[120px]', className)}
        {...longPress}
      >
        <div className="flex items-start justify-between">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-[14px] transition-all duration-300',
              isOn ? 'bg-blue-500/20' : 'bg-white/8',
            )}
          >
            <Lightbulb
              size={20}
              className={cn(
                'transition-colors duration-300',
                isOn ? 'text-blue-400' : 'text-white/30',
                unavailable && 'opacity-30',
              )}
            />
          </div>
          <div
            className={cn(
              'h-5 w-9 rounded-full transition-all duration-300 relative cursor-pointer',
              isOn ? 'bg-blue-500' : 'bg-white/15',
            )}
            onClick={(e) => { e.stopPropagation(); toggle() }}
          >
            <motion.div
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm"
              animate={{ left: isOn ? '18px' : '2px' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </div>
        </div>

        <div className="mt-auto">
          <p className="text-sm font-medium text-white/90 leading-tight">{label}</p>
          <p className="text-xs mt-0.5" style={{ color: tokens.text.tertiary }}>
            {unavailable ? 'Non disponibile' : isOn ? `${brightness}%` : 'Spento'}
          </p>
        </div>
      </GlassCard>

      <GlassSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={label}>
        <div className="space-y-6">
          <div className="flex items-center justify-center">
            <div
              className={cn(
                'flex h-20 w-20 items-center justify-center rounded-full transition-all',
                isOn ? 'bg-blue-500/20' : 'bg-white/8',
              )}
            >
              <Lightbulb size={36} className={isOn ? 'text-blue-400' : 'text-white/30'} />
            </div>
          </div>

          <DragSlider
            value={brightness}
            onChange={setBrightness}
            onChangeEnd={setBrightness}
            color="#3b82f6"
            label="Intensità"
          />

          <div className="grid grid-cols-3 gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => setBrightness(pct)}
                className={cn(
                  'rounded-[14px] py-2.5 text-sm font-medium transition-all',
                  brightness === pct
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/8 text-white/70 hover:bg-white/12',
                )}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>
    </>
  )
}
