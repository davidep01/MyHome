import { useMemo } from 'react'
import { ChevronRight, Users } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'

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
    <GlassCard interactive className={cn('flex items-center justify-between gap-3 min-h-[96px]', className)}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white/85">Persone</p>
        <p className="mt-0.5 text-xs text-white/40">
          {people.length === 0 ? 'Nessuna persona configurata' : `${home} a casa · ${people.length} totali`}
        </p>
        <div className="mt-3 flex -space-x-2">
          {people.length === 0 ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 ring-2 ring-[#0b0b14]">
              <Users size={16} className="text-white/40" />
            </div>
          ) : (
            people.slice(0, 5).map((p, i) => {
              const name = (p.attributes?.friendly_name as string | undefined) ?? p.entity_id.split('.')[1]
              const pic = p.attributes?.entity_picture as string | undefined
              return (
                <div
                  key={p.entity_id}
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white ring-2 ring-[#0b0b14]"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                  title={`${name} — ${p.state === 'home' ? 'a casa' : p.state}`}
                >
                  {pic ? <img src={pic} alt={name} className="h-full w-full object-cover" /> : initials(name)}
                </div>
              )
            })
          )}
          {people.length > 5 && (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/70 ring-2 ring-[#0b0b14]">
              +{people.length - 5}
            </div>
          )}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-white/30" />
    </GlassCard>
  )
}
