import type { HassEntity } from 'home-assistant-js-websocket'
export function timerRemaining(entity: HassEntity | undefined, now: number): string | undefined {
  if (!entity || entity.entity_id.split('.')[0] !== 'timer' || entity.state === 'idle') return undefined
  const finishes = typeof entity.attributes.finishes_at === 'string' ? Date.parse(entity.attributes.finishes_at) : NaN
  const remaining = typeof entity.attributes.remaining === 'string' ? /^(\d+):(\d{2}):(\d{2})$/.exec(entity.attributes.remaining) : null
  const seconds = entity.state === 'active' && Number.isFinite(finishes) ? Math.max(0,Math.ceil((finishes-now)/1000))
    : remaining && Number(remaining[2]) < 60 && Number(remaining[3]) < 60 ? Number(remaining[1])*3600+Number(remaining[2])*60+Number(remaining[3]) : undefined
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined
  const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),rest=seconds%60
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2,'0')}:${String(rest).padStart(2,'0')}`
}
