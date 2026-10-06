import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, List } from 'lucide-react'
import { swipePage } from '../../lib/cardGestures'

/** One live page, native vertical scrolling, explicit navigation alternatives. */
export function CardPager({ ids, title, render, onInventory }: { ids:string[]; title:string; render:(id:string)=>ReactNode; onInventory:()=>void }) {
  const [selected, setSelected] = useState(ids[0])
  const [delta, setDelta] = useState(0)
  const [direction, setDirection] = useState(1)
  const drag = useRef<{id:number;x:number;y:number;horizontal:boolean;width:number} | null>(null)
  const suppressUntil = useRef(0)
  const index = Math.max(0,ids.indexOf(selected))
  const active = ids[index]
  const navigate = (step:number) => {
    const next = Math.max(0,Math.min(ids.length-1,index+step))
    if (next !== index) {setDirection(step);setSelected(ids[next])}
    setDelta(0)
  }
  return <div className="simi-card-pager" role="region" aria-roledescription="carosello" aria-label={title}>
    <div className="simi-card-pager-viewport"
      onClickCapture={e=>{if(Date.now()<suppressUntil.current){e.preventDefault();e.stopPropagation()}}}
      onPointerDownCapture={e=>{
        const target=e.target as HTMLElement
        const control=target.closest('button,input,select,textarea,a,[role="slider"],[data-no-swipe]')
        if(ids.length<2 || !e.isPrimary || e.button!==0 || control && !control.classList.contains('widget-card-primary-action'))return
        drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,horizontal:false,width:e.currentTarget.clientWidth}
      }}
      onPointerMove={e=>{
        const d=drag.current;if(!d || d.id!==e.pointerId)return
        const dx=e.clientX-d.x,dy=e.clientY-d.y
        if(!d.horizontal){if(Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){drag.current=null;suppressUntil.current=Date.now()+500;return}if(Math.abs(dx)<12)return;d.horizontal=true;e.currentTarget.setPointerCapture(e.pointerId)}
        setDelta(Math.max(-d.width*.4,Math.min(d.width*.4,dx)))
      }}
      onPointerUp={e=>{
        const d=drag.current;drag.current=null
        if(!d || d.id!==e.pointerId || !d.horizontal)return
        suppressUntil.current=Date.now()+500;e.preventDefault()
        navigate(swipePage(e.clientX-d.x,e.clientY-d.y,d.width))
      }}
      onPointerCancel={()=>{drag.current=null;setDelta(0)}}
      onLostPointerCapture={()=>{drag.current=null;setDelta(0)}}>
      <div key={active} className="simi-card-page" data-dragging={delta!==0} style={{transform:`translateX(${delta}px)`,'--page-direction':direction} as CSSProperties}>
        {active ? render(active) : <p className="p-3 text-sm text-[var(--ink-secondary)]">Nessun dispositivo selezionato</p>}
      </div>
    </div>
    <div className="simi-card-pager-controls">
      <button type="button" onClick={onInventory} aria-label={`Apri inventario ${title}`}><List size={18}/></button>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-secondary)]" aria-live="polite">{title} · {ids.length ? index+1 : 0}/{ids.length}</span>
      <button type="button" aria-label="Dispositivo precedente" disabled={index===0} onClick={()=>navigate(-1)}><ChevronLeft size={18}/></button>
      <button type="button" aria-label="Dispositivo successivo" disabled={index>=ids.length-1} onClick={()=>navigate(1)}><ChevronRight size={18}/></button>
    </div>
  </div>
}
