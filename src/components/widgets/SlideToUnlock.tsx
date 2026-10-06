import { useEffect, useRef, useState } from 'react'
import { ChevronRight, LockKeyhole } from 'lucide-react'
import { unlockProgress } from '../../lib/cardGestures'

/** Full travel + release for pointer; 900ms hold for keyboard. No tap unlock. */
export function SlideToUnlock({ disabled, onUnlock }: {disabled:boolean;onUnlock:()=>void}) {
  const [progress,setProgress]=useState(0)
  const start=useRef<{id:number;x:number;travel:number;progress:number}|null>(null)
  const latest=useRef({disabled,onUnlock})
  useEffect(()=>{latest.current={disabled,onUnlock}},[disabled,onUnlock])
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null)
  const stop=()=>{if(hold.current)clearTimeout(hold.current);hold.current=null;start.current=null;setProgress(0)}
  useEffect(()=>()=>{if(hold.current)clearTimeout(hold.current)},[])
  return <div className="simi-unlock-track pointer-events-auto" data-no-swipe>
    <span aria-hidden="true">Scorri per sbloccare <ChevronRight size={14}/></span>
    <button type="button" className="simi-unlock-thumb" aria-label="Scorri fino in fondo per sbloccare; con tastiera tieni premuto Invio" disabled={disabled}
      style={{left:`calc(${progress*100}% - ${progress*48}px)`}}
      onClick={e=>{e.preventDefault();e.stopPropagation()}}
      onPointerDown={e=>{e.stopPropagation();if(disabled||!e.isPrimary||e.button!==0)return;const travel=(e.currentTarget.parentElement?.clientWidth??48)-48;if(travel<=0)return;start.current={id:e.pointerId,x:e.clientX,travel,progress:0};e.currentTarget.setPointerCapture(e.pointerId)}}
      onPointerMove={e=>{const d=start.current;if(!d||d.id!==e.pointerId)return;d.progress=unlockProgress(e.clientX-d.x,d.travel);setProgress(d.progress)}}
      onPointerUp={e=>{e.stopPropagation();const d=start.current;const complete=d?.id===e.pointerId&&d.progress===1;stop();if(complete&&!disabled)onUnlock()}}
      onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
      onKeyDown={e=>{if(!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();if(disabled||e.repeat||hold.current)return;setProgress(1);hold.current=setTimeout(()=>{hold.current=null;setProgress(0);if(!latest.current.disabled)latest.current.onUnlock()},900)}}
      onKeyUp={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();stop()}}}>
      <LockKeyhole size={18} aria-hidden="true"/>
    </button>
  </div>
}
