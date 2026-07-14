import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'
import { haApi } from '../../api/backend'

const PALETTE = ['#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4']

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

export function PeopleCard({ className }: { className?: string }) {
  const entities = useEntityStore((s) => s.entities)
  const people = useMemo(
    () => Object.values(entities).filter((e) => e.entity_id.startsWith('person.')),
    [entities],
  )
  const home = people.filter((p) => p.state === 'home').length

  return (
    <GlassCard depth className={cn('flex min-h-[96px] items-center gap-3', className)}>
      <div className="min-w-0">
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
            people.slice(0, 5).map((p, i) => {
              const name = (p.attributes?.friendly_name as string | undefined) ?? p.entity_id.split('.')[1]
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
          {people.length > 5 && (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-[11px] font-semibold text-black/70 ring-2 ring-white" role="listitem" aria-label={`${people.length - 5} altre persone`}>
              +{people.length - 5}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}
