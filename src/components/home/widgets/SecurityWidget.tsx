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
  const recent = Date.now() - (last ? new Date(last.timestamp).getTime() : 0) < 5 * 60_000
  const showList = size === 'lg' || size === 'wide'

  return (
    <AnimatedCard ambient="drift" ambientColor="rgba(220,38,38,0.12)" index={4} contentClassName="gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-[#dc2626]">
          {last ? <Bell size={18} className="amb-float" /> : <ShieldCheck size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-black/90">Accessi</p>
          <p className="truncate text-xs text-black/45">{events.length} eventi</p>
        </div>
        {recent && <LiveDot color="#dc2626" />}
      </div>

      {!last ? (
        <p className="mt-1 text-xs text-black/40">Nessun evento recente.</p>
      ) : showList ? (
        <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-hidden">
          {events.slice(0, 4).map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-black/70">{e.doorbellName}{e.message ? ` · ${e.message}` : ''}</span>
              <span className="shrink-0 text-black/35">{timeAgo(e.timestamp)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-auto">
          <p className="truncate text-sm font-medium text-black/80">{last.doorbellName}</p>
          <p className="text-xs text-black/45">Ultimo squillo {timeAgo(last.timestamp)}</p>
        </div>
      )}
    </AnimatedCard>
  )
}
