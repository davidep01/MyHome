export const MAX_KNOWN_FACES = 8

export function canAddKnownFace(currentCount: number): boolean {
  return Number.isInteger(currentCount) && currentCount >= 0 && currentCount < MAX_KNOWN_FACES
}
