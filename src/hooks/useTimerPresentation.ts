import { useState,useEffect } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { timerRemaining } from '../lib/timerPresentation'
export function useTimerPresentation(entity?:HassEntity) {
  const [now,setNow]=useState(()=>Date.now())
  const running=entity?.entity_id.startsWith('timer.') && entity.state==='active'
  useEffect(()=>{if(!running)return;const id=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(id)},[running])
  return timerRemaining(entity,now)
}
