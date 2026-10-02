import { DOORBELL_ACTIVE_STATES } from './doorbell'
const INVALID = new Set(['unknown', 'unavailable', ''])
export function doorbellStateValid(state: string | undefined): state is string { return state !== undefined && !INVALID.has(state) }
export function doorbellTriggered(entityId: string, previous: string | undefined, state: string | undefined, changedAt: string | undefined, now = Date.now()): boolean {
  if (!doorbellStateValid(previous) || !doorbellStateValid(state) || previous === state) return false
  const event = entityId.startsWith('event.')
  const stamp = Date.parse(event ? state : changedAt ?? '')
  if (!Number.isFinite(stamp) || stamp < now - 15_000 || stamp > now + 5_000) return false
  if (event) return Number.isFinite(Date.parse(previous)) && stamp > Date.parse(previous)
  return DOORBELL_ACTIVE_STATES.includes(state) && !DOORBELL_ACTIVE_STATES.includes(previous)
}
