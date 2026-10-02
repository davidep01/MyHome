import { MAX_KNOWN_FACES } from '../../backend/src/lib/face-limits'
export { MAX_KNOWN_FACES } from '../../backend/src/lib/face-limits'

export function canAddKnownFace(currentCount: number): boolean {
  return Number.isInteger(currentCount) && currentCount >= 0 && currentCount < MAX_KNOWN_FACES
}
