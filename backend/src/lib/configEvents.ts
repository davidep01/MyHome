import { EventEmitter } from 'node:events'

/**
 * In-process bus that fans config changes out to every connected client via SSE,
 * so editing the (global) dashboard on one device updates all others live.
 */
export const configEvents = new EventEmitter()
configEvents.setMaxListeners(0) // unlimited SSE subscribers

export function emitConfigChange() {
  configEvents.emit('change', Date.now())
}
