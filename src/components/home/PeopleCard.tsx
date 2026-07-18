import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'
import { haApi } from '../../api/backend'
import { entityName } from '../widgets/utils/mapEntityToWidgetCard'
import type { WidgetSize } from '../../api/backend'

const PALETTE = ['#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4']

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

export function PeopleCard({ size, className }: { size: WidgetSize; className?: string }) {
  const entities = useEntityStore((s) => s.entities)
  const people = useMemo(
    () => Object.values(entities).filter((e) => e.entity_id.startsWith('person.')),
    [entities],
  )
  const home = people.filter((p) => p.state === 'home').length
  const expanded = size === 'lg' || size === 'wide'
  const visibleCount = size === 'sm' ? 3 : size === 'md' ? 5 : size === 'lg' ? 6 : 10

  return (
    <GlassCard depth className={cn('flex min-h-[96px] gap-3', expanded ? 'flex-col' : 'items-center', className)}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-black/85">Persone</p>
        <p className="mt-0.5 text-xs text-black/40" role="status">
          {people.length === 0 ? 'Nessuna persona configurata' : `${home} a casa · ${people.length} totali`}
        </p>
        <div className="mt-3 flex -space-x-2" role="list" aria-label="Persone configurate">
          {people.length === 0 ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/8 ring-2 ring-white" role="listitem">
              <Users size={16} className="text-black/40" aria-hidden="true" />
            </div>
          ) : (
            people.slice(0, visibleCount).map((p, i) => {
              const name = entityName(p)
              const pic = p.attributes?.entity_picture as string | undefined
              const pictureUrl = pic ? haApi.imageUrl(pic, p.entity_id) : undefined
              return (
                <div
                  key={p.entity_id}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-[#1d1d1f] ring-2 ring-white"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                  title={`${name} — ${p.state === 'home' ? 'a casa' : p.state}`}
                  role="listitem"
                  aria-label={`${name}, ${p.state === 'home' ? 'a casa' : p.state}`}
                >
                  {pictureUrl ? <img src={pictureUrl} alt="" className="h-full w-full object-cover" /> : initials(name)}
                </div>
              )
            })
          )}
          {people.length > visibleCount && (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-[11px] font-semibold text-black/70 ring-2 ring-white" role="listitem" aria-label={`${people.length - visibleCount} altre persone`}>
              +{people.length - visibleCount}
            </div>
          )}
        </div>
      </div>
      {expanded && people.length > 0 && (
        <div className={size === 'wide' ? 'grid min-h-0 grid-cols-2 gap-2 overflow-hidden' : 'min-h-0 space-y-2 overflow-hidden'}>
          {people.slice(0, size === 'wide' ? 2 : 5).map((person) => {
            const name = entityName(person)
            const isHome = person.state === 'home'
            return (
              <div key={person.entity_id} className="flex items-center justify-between gap-3 rounded-[12px] bg-black/[0.035] px-3 py-2 text-sm">
                <span className="truncate font-semibold text-black/70">{name}</span>
                <span className={isHome ? 'shrink-0 text-green-700' : 'shrink-0 text-black/35'}>{isHome ? 'A casa' : person.state}</span>
              </div>
            )
          })}
        </div>
      )}
    </GlassCard>
  )
}
