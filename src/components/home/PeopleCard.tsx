import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { GlassSheet } from '../glass/GlassSheet'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import { cn } from '../../lib/utils'
import { haApi, type WidgetSize } from '../../api/backend'
import { entityName } from '../widgets/utils/mapEntityToWidgetCard'
import { stateLabel } from '../widgets/utils/stateLabel'

function initials(name: string) { return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase() }
function Avatar({url, name}: {url?:string;name:string}) {
  const [failed, setFailed] = useState(false)
  return url && !failed ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} /> : <span aria-hidden="true">{initials(name)}</span>
}

export function PeopleCard({size,className}: {size:WidgetSize;className?:string}) {
  const entities = useEntityStore(s=>s.entities)
  const openEntity = useUIStore(s=>s.setSelectedEntity)
  const [open, setOpen] = useState(false)
  const people = useMemo(()=>Object.values(entities).filter(e=>e.entity_id.startsWith('person.')), [entities])
  const home = people.filter(p=>p.state==='home').length
  const expanded = size==='lg'
  const visibleCount = size==='sm' ? 2 : size==='md' ? 5 : 8
  const rows = people.map(person => <button type="button" key={person.entity_id} onClick={()=>openEntity(person.entity_id)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-[var(--fill-subtle)] px-3 py-2 text-left text-sm">
    <span className="truncate font-semibold text-[var(--ink)]">{entityName(person)}</span><span className="shrink-0 text-[var(--ink-secondary)]">{stateLabel(person.state)}</span>
  </button>)
  return <>
    <GlassCard depth className={cn('flex min-h-0 flex-col gap-2',className)}>
      <button type="button" onClick={()=>setOpen(true)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left" aria-label="Apri elenco persone">
        <span className="min-w-0"><span className="block text-sm font-semibold text-[var(--ink)]">Persone</span><span className="block text-[13px] text-[var(--ink-secondary)]" role="status">{people.length ? `${home} a casa · ${people.length} totali` : 'Nessuna persona configurata'}</span></span>
        <Users size={20} className="shrink-0 text-[var(--ink-secondary)]" aria-hidden="true" />
      </button>
      {!expanded && <div className="flex min-h-11 flex-wrap gap-1">
        {people.slice(0,visibleCount).map(p=>{
          const name = entityName(p), pic = typeof p.attributes.entity_picture === 'string' ? haApi.imageUrl(p.attributes.entity_picture,p.entity_id) : undefined
          return <button key={p.entity_id} type="button" title={`${name} · ${stateLabel(p.state)}`} aria-label={`${name}, ${stateLabel(p.state)}`} onClick={()=>openEntity(p.entity_id)} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--fill-subtle)] text-[13px] font-semibold text-[var(--ink)] ring-1 ring-[var(--hairline)]"><Avatar key={pic ?? name} url={pic} name={name} /></button>
        })}
        {people.length > visibleCount && <button type="button" onClick={()=>setOpen(true)} aria-label="Mostra tutte le persone" className="h-11 min-w-11 rounded-full bg-[var(--fill-subtle)] text-sm text-[var(--ink)]">+{people.length-visibleCount}</button>}
      </div>}
      {expanded && <div className="min-h-0 space-y-1 overflow-y-auto">{rows}</div>}
    </GlassCard>
    <GlassSheet open={open} onClose={()=>setOpen(false)} title="Persone" side="center"><div className="space-y-2">{people.length ? rows : <p className="text-sm text-[var(--ink-secondary)]">Aggiungi le persone in Home Assistant</p>}</div></GlassSheet>
  </>
}
