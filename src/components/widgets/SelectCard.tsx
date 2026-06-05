import { useState } from 'react'
import { ChevronDown, Check, List } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { GlassSheet } from '../glass/GlassSheet'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'

interface Props { entityId: string; label: string; className?: string }

/** select / input_select → current option + a sheet to pick from `options`. */
export function SelectCard({ entityId, label, className }: Props) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const [open, setOpen] = useState(false)

  const domain = entityId.split('.')[0] // 'select' | 'input_select'
  const current = entity?.state ?? '—'
  const options = (entity?.attributes?.options as string[] | undefined) ?? []
  const unavailable = !entity || entity.state === 'unavailable'

  const choose = (option: string) => {
    light()
    setOptimisticState(entityId, option)
    call(domain, 'select_option', { entity_id: entityId, option })
    setOpen(false)
  }

  return (
    <>
      <GlassCard
        interactive={!unavailable}
        onClick={() => !unavailable && setOpen(true)}
        className={cn('flex flex-col gap-3', unavailable && 'opacity-55', className)}
      >
        <div className="flex items-start justify-between">
          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--ink-secondary)' }}>
            <List size={18} />
          </div>
          <ChevronDown size={16} className="text-black/25" />
        </div>
        <div className="mt-auto">
          <p className="text-sm font-semibold leading-tight text-black/90">{label}</p>
          <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--ink-secondary)' }}>{current}</p>
        </div>
      </GlassCard>

      <GlassSheet open={open} onClose={() => setOpen(false)} title={label} side="bottom">
        <div className="space-y-1.5">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => choose(opt)}
              className={cn(
                'flex w-full items-center justify-between rounded-[12px] px-4 py-3 text-sm transition',
                opt === current ? 'bg-[#0066cc]/12 font-semibold text-[#0066cc]' : 'bg-black/[0.04] text-[#1d1d1f] hover:bg-black/[0.07]',
              )}
            >
              {opt}
              {opt === current && <Check size={16} />}
            </button>
          ))}
        </div>
      </GlassSheet>
    </>
  )
}
