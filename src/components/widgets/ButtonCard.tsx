import { useState } from 'react'
import { Zap, Check } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { cn } from '../../lib/utils'

interface Props { entityId: string; label: string; className?: string }

/** button / input_button → press. remote → toggle. */
export function ButtonCard({ entityId, label, className }: Props) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { medium } = useHaptic()
  const [pressed, setPressed] = useState(false)
  const domain = entityId.split('.')[0]
  const unavailable = !entity || entity.state === 'unavailable'

  const press = () => {
    if (unavailable) return
    medium()
    if (domain === 'remote') call('remote', 'toggle', { entity_id: entityId })
    else call(domain, 'press', { entity_id: entityId })
    setPressed(true)
    setTimeout(() => setPressed(false), 1200)
  }

  return (
    <GlassCard
      interactive={!unavailable}
      onClick={press}
      className={cn('flex flex-col items-center justify-center gap-2', unavailable && 'opacity-55', className)}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full transition-colors"
        style={pressed ? { background: 'rgba(0,102,204,0.16)', color: 'var(--action-blue)' } : { background: 'rgba(0,0,0,0.05)', color: 'var(--ink-secondary)' }}
      >
        {pressed ? <Check size={22} /> : <Zap size={20} />}
      </div>
      <p className="text-center text-sm font-semibold leading-tight text-black/90">{label}</p>
    </GlassCard>
  )
}
