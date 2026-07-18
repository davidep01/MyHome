import type { HeroSlot } from './composer'

export interface NowSectionGroups {
  regular: HeroSlot[]
  cameraTrio: HeroSlot[]
}

function isCameraSlot(slot: HeroSlot): boolean {
  return slot.entityId?.startsWith('camera.') === true
}

/**
 * Three pinned cameras are more useful as a single monitoring strip than as
 * a 2+1 masonry block. Keep every non-camera slot in composer priority order
 * and move only the exact camera trio into its dedicated row.
 */
export function groupCameraTrio(hero: HeroSlot[]): NowSectionGroups {
  const cameraTrio = hero.filter(isCameraSlot)
  if (cameraTrio.length !== 3) return { regular: hero, cameraTrio: [] }

  return {
    regular: hero.filter((slot) => !isCameraSlot(slot)),
    cameraTrio,
  }
}
