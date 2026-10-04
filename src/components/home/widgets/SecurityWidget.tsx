import { Bell, ShieldCheck } from 'lucide-react'
import { useDoorbellEvents } from '../../../store/doorbellEvents'
import { AnimatedCard } from '../../anim/AnimatedCard'
import { LiveDot } from '../../anim/LiveDot'
import { timeAgo } from '../../../lib/time'
import type { WidgetSize } from '../../../api/backend'

/** Recent doorbell / access events from the runtime log. */
export function SecurityWidget({ size }: { size: WidgetSize }) {
  const events = useDoorbellEvents((s) => s.events)
  const last = events[0]
  const recent = Boolean(last)
  const showList = size === 'lg'
  if (size === 'xs') return <AnimatedCard className="h-full" contentClassName="gap-1">
    <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{last?.doorbellName ?? 'Accessi'}</p>
    <p className="truncate text-[13px] text-[var(--ink-secondary)]">{last ? `Ultimo evento ${timeAgo(last.timestamp)}` : 'Nessun evento recente'}</p>
  </AnimatedCard>

  return (
    <AnimatedCard depth ambient="drift" ambientColor="rgba(220,38,38,0.18)" index={4} className="h-full" contentClassName="gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--fill-subtle)] text-[#dc2626]">
          {last ? <Bell size={18} className="amb-float" /> : <ShieldCheck size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">Accessi</p>
          <p className="truncate text-[13px] text-[var(--ink-secondary)]">{events.length} eventi</p>
        </div>
        {recent && <LiveDot color="#dc2626" />}
      </div>

      {!last ? (
        <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">Nessun evento recente.</p>
      ) : showList ? (
        <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {events.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="truncate text-[var(--ink)]">{e.doorbellName}{e.message ? ` · ${e.message}` : ''}</span>
              <span className="shrink-0 text-[var(--ink-tertiary)]">{timeAgo(e.timestamp)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-auto">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">{last.doorbellName}</p>
          <p className="text-[13px] text-[var(--ink-secondary)]">Ultimo squillo {timeAgo(last.timestamp)}</p>
        </div>
      )}
    </AnimatedCard>
  )
}
