import { useState } from 'react'
import { GlassSheet } from '../../glass/GlassSheet'
import { useDiscoveredEntities } from '../../../hooks/useDiscoveredEntities'
import type { HomeWidget, TabletDashboardLayout } from '../../../api/backend'
import { validStack } from '../../../lib/cardStack'
import { uid } from '../../../lib/uid'

export function StackEditor({ widget, onClose, onSave, curation }: { widget?: HomeWidget; onClose: () => void; onSave: (widget: HomeWidget) => void; curation?: Pick<TabletDashboardLayout, 'hiddenEntities' | 'deviceOverrides' | 'groups'> }) {
  const { sections } = useDiscoveredEntities(curation)
  const [label, setLabel] = useState(widget?.label ?? '')
  const [ids, setIds] = useState(widget?.entityIds ?? [])
  const [query, setQuery] = useState('')
  const choices = sections.flatMap(s => s.entities).filter(e => !e.entityId.startsWith('camera.') && e.type !== 'camera')
  const options = [...new Map(choices.map(e => [e.entityId, e])).values()]
  const filtered = options.filter(e => `${e.label} ${e.entityId}`.toLocaleLowerCase('it').includes(query.toLocaleLowerCase('it')))
  const toggle = (id: string) => setIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : previous.length < 24 ? [...previous, id] : previous)
  return <GlassSheet open onClose={onClose} side="bottom" wide title={widget ? 'Modifica raccolta' : 'Nuova raccolta'}>
    <div className="space-y-3 text-[var(--ink)]">
      <p className="text-sm text-[var(--ink-secondary)]">Riunisci da 2 a 24 dispositivi. Ogni dispositivo mantiene i suoi comandi.</p>
      <label className="block text-sm">Nome<input autoFocus value={label} maxLength={80} onChange={e => setLabel(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-[var(--fill-subtle)] px-3" /></label>
      <input aria-label="Cerca nella raccolta" placeholder="Cerca dispositivo" value={query} onChange={e => setQuery(e.target.value)} className="min-h-11 w-full rounded-xl bg-[var(--fill-subtle)] px-3" />
      <p aria-live="polite" className="text-sm">{ids.length} selezionati / 24</p>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {ids.filter(id => !options.some(e => e.entityId === id)).map(id => <button key={id} type="button" onClick={() => toggle(id)} className="simi-stack-choice" aria-pressed>{id} · rimuovi</button>)}
        {filtered.map(e => <button key={e.entityId} type="button" aria-pressed={ids.includes(e.entityId)} disabled={!ids.includes(e.entityId) && ids.length >= 24} onClick={() => toggle(e.entityId)} className="simi-stack-choice">{e.label}<span aria-hidden="true">{ids.includes(e.entityId) ? '✓' : '+'}</span></button>)}
        {!filtered.length && <p className="py-4 text-sm text-[var(--ink-secondary)]">Nessun dispositivo corrisponde alla ricerca</p>}
      </div>
      <button type="button" className="simi-editor-button w-full" disabled={!validStack({label,entityIds:ids})} onClick={() => { onSave({id:widget?.id ?? uid('w'), type:'stack', size:widget?.size ?? 'md', label:label.trim(), entityIds:ids}); onClose() }}>Salva raccolta</button>
    </div>
  </GlassSheet>
}
