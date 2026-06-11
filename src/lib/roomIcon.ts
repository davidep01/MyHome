import {
  Baby, Bath, Bed, BookOpen, Car, CookingPot, DoorOpen, Dumbbell, Home,
  Monitor, Sofa, Sun, Trees, Utensils, Warehouse, WashingMachine,
} from 'lucide-react'
import type { ElementType } from 'react'

/**
 * Glifo per una stanza, dedotto dal nome dell'area HA (italiano + inglese).
 * Primo match vince: gli specifici ("camera da letto") prima dei generici.
 */
const MATCHERS: [RegExp, ElementType][] = [
  [/soggiorno|salotto|living|lounge|tavern/i, Sofa],
  [/cucin|kitchen/i, CookingPot],
  [/pranzo|dining/i, Utensils],
  [/camer|letto|bedroom|matrimonial/i, Bed],
  [/bagno|bath|doccia|wc|toilet/i, Bath],
  [/studio|ufficio|office/i, Monitor],
  [/garage|box/i, Car],
  [/giardino|garden|esterno|cortile|prato|orto/i, Trees],
  [/ingresso|entrata|entrance|hall|corridoio|disimpegno/i, DoorOpen],
  [/lavanderia|laundry|stireria/i, WashingMachine],
  [/palestra|gym|fitness/i, Dumbbell],
  [/bimb|bamb|nursery|kids|cameretta/i, Baby],
  [/balcon|terrazz|veranda|patio/i, Sun],
  [/cantina|ripostiglio|magazzino|soffitta|mansarda|storage/i, Warehouse],
  [/bibliotec|lettura|library/i, BookOpen],
]

export function roomGlyph(name: string): ElementType {
  const match = MATCHERS.find(([re]) => re.test(name))
  return match ? match[1] : Home
}
