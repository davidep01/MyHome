import { useState } from 'react'
import { Layers } from 'lucide-react'
import type { HomeWidget, TabletDashboardLayout } from '../../../api/backend'
import { useEntityStore } from '../../../store/entities'
import { visibleStackIds } from '../../../lib/cardStack'
import { groupMemberActive } from '../../widgets/utils/groupActions'
import { WidgetCardShell, WidgetCardIcon, WidgetCardIdentity } from '../../widgets/WidgetCardBase'
import { widgetVisualSizeFromHomeSize } from '../../widgets/utils/getWidgetSizeConfig'
import { EntitySheet } from '../layers/EntitySheet'

export function StackCard({ widget, config }: { widget: HomeWidget; config?: Partial<Pick<TabletDashboardLayout, 'deviceOverrides' | 'hiddenEntities'>> }) {
  const [open, setOpen] = useState(false)
  const entities = useEntityStore(s => s.entities)
  const ids = visibleStackIds(widget.entityIds ?? [], config?.deviceOverrides, config?.hiddenEntities)
  const unavailable = ids.filter(id => !entities[id] || ['unknown', 'unavailable'].includes(entities[id].state)).length
  const active = ids.filter(id => entities[id] && groupMemberActive(id.split('.')[0], entities[id].state)).length
  const size = widgetVisualSizeFromHomeSize(widget.size)
  const title = widget.label || 'Raccolta'
  const state = !ids.length ? 'Nessun dispositivo selezionato' : `${ids.length} dispositivi · ${active} attivi${unavailable ? ` · ${unavailable} non disponibili` : ''}`
  return <>
    <WidgetCardShell id={widget.id} type="stack" title={title} icon={Layers} size={size} status="idle" onClick={() => setOpen(true)}>
      <div className="flex items-center gap-3">
        <WidgetCardIcon Icon={Layers} size={size} />
        <WidgetCardIdentity title={title} state={state} size={size} />
      </div>
      {size === 'L' && <div className="mt-3 min-h-0 space-y-2 overflow-y-auto text-sm text-[var(--ink-secondary)]">
        {ids.map(id => <p key={id} className="truncate">{config?.deviceOverrides?.[id]?.label || entities[id]?.attributes.friendly_name || id}</p>)}
      </div>}
    </WidgetCardShell>
    <EntitySheet target={open ? { key:widget.id, title, entityIds:ids } : null} overrides={config?.deviceOverrides} onClose={() => setOpen(false)} />
  </>
}
