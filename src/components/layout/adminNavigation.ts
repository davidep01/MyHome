import { ActivitySquare, Boxes, LayoutGrid, SlidersHorizontal } from 'lucide-react'
import type { AppView } from '../../store/ui'

export const ADMIN_NAVIGATION: { id: AppView; label: string; description: string; Icon: typeof LayoutGrid }[] = [
  { id: 'home', label: 'Stato', description: 'Casa e attività', Icon: LayoutGrid },
  { id: 'entities', label: 'Entità', description: 'Dispositivi e gruppi', Icon: Boxes },
  { id: 'functions', label: 'Funzioni', description: 'Esperienza del tablet', Icon: SlidersHorizontal },
  { id: 'system', label: 'Sistema', description: 'Connessione e diagnostica', Icon: ActivitySquare },
]
