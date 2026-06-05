import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, LockOpen } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface LockCardProps {
  entityId: string
  label: string
  className?: string
}

const HOLD_MS = 900

/** Press-and-hold lock/gate control — "Tieni premuto per aprire". */
export function LockCard({ entityId, label, className }: LockCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { medium, heavy } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const domain = entityId.split('.')[0]
  const isLock = domain === 'lock'
  const locked = isLock ? entity?.state === 'locked' : entity?.state === 'closed'
  const unavailable = !entity || entity.state === 'unavailable'

  const fire = () => {
    heavy()
    if (isLock) {
      const next = locked ? 'unlocked' : 'locked'
      setOptimisticState(entityId, next)
      call('lock', locked ? 'unlock' : 'lock', { entity_id: entityId })
    } else {
      setOptimisticState(entityId, locked ? 'open' : 'closed')
      call('cover', locked ? 'open_cover' : 'close_cover', { entity_id: entityId })
    }
  }

  const STEP_MS = 16

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setProgress(0)
  }

  const start = () => {
    if (unavailable || timerRef.current) return // guard: never run two timers at once
    medium()
    let p = 0
    timerRef.current = setInterval(() => {
      p += STEP_MS / HOLD_MS
      if (p >= 1) {
        stop()
        fire()
        return
      }
      setProgress(p)
    }, STEP_MS)
  }

  const Icon = locked ? Lock : LockOpen
  const color = locked ? tokens.accent.green : tokens.accent.orange

  return (
    <GlassCard
      className={cn('flex flex-col items-center justify-center gap-2 min-h-[150px] select-none', className)}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      <p className="text-sm font-semibold text-black/90">{label}</p>
      <div className="relative grid h-16 w-16 place-items-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
          <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(0,0,0,0.10)" strokeWidth="4" />
          <circle
            cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${progress * 2 * Math.PI * 28} ${2 * Math.PI * 28}`}
          />
        </svg>
        <motion.div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: `${color}22` }}
          animate={{ scale: progress > 0 ? 1 + progress * 0.08 : 1 }}
        >
          <Icon size={22} style={{ color: unavailable ? 'rgba(0,0,0,0.28)' : color }} />
        </motion.div>
      </div>
      <p className="text-[11px]" style={{ color: tokens.text.tertiary }}>
        {unavailable ? 'Non disponibile' : 'Tieni premuto per aprire'}
      </p>
    </GlassCard>
  )
}
