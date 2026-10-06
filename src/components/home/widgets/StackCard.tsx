import { useState } from 'react'
import type { HomeWidget, TabletDashboardLayout, EntityType } from '../../../api/backend'
import { useEntityStore } from '../../../store/entities'
import { visibleStackIds } from '../../../lib/cardStack'
import { widgetVisualSizeFromHomeSize } from '../../widgets/utils/getWidgetSizeConfig'
import { EntitySheet } from '../layers/EntitySheet'
import { CardPager } from '../../widgets/CardPager'
import { WidgetCardFactory } from '../../widgets/WidgetCardFactory'
import { DOMAIN_TYPE } from '../../../hooks/useDiscoveredEntities'

export function StackCard({ widget, config }: { widget: HomeWidget; config?: Partial<Pick<TabletDashboardLayout, 'deviceOverrides' | 'hiddenEntities'>> }) {
  const [open,setOpen]=useState(false)
  const entities=useEntityStore(s=>s.entities)
  const ids=visibleStackIds(widget.entityIds??[],config?.deviceOverrides,config?.hiddenEntities)
  const size=widgetVisualSizeFromHomeSize(widget.size)
  const title=widget.label||'Raccolta'
  return <>
    <CardPager ids={ids} title={title} onInventory={()=>setOpen(true)} render={id=>{
      const override=config?.deviceOverrides?.[id]
      return <WidgetCardFactory entity={{id,entityId:id,roomId:'auto',sortOrder:0,type:(override?.type??DOMAIN_TYPE[id.split('.')[0]]??'sensor') as EntityType,label:override?.label||entities[id]?.attributes.friendly_name||id,icon:override?.icon}} size={size==='L'?'L':'XS'} />
    }}/>
    <EntitySheet target={open?{key:widget.id,title,entityIds:ids}:null} overrides={config?.deviceOverrides} onClose={()=>setOpen(false)}/>
  </>
}
