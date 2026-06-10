import { lazy, Suspense } from 'react'
import { LayeredHome } from '../components/home/LayeredHome'

// La griglia manuale è il fallback legacy: lazy, così il percorso primario non
// scarica react-grid-layout (~81KB) al boot.
const KioskWidgetHome = lazy(() =>
  import('../components/home/widgets/KioskWidgetHome').then((m) => ({ default: m.KioskWidgetHome })))

function useGridFallback(): boolean {
  try {
    return localStorage.getItem('myhome.home') === 'grid'
  } catch {
    return false
  }
}

/** Tablet/kiosk home: auto-composta (default) o griglia legacy via flag. */
export function TabletDashboard() {
  const grid = useGridFallback()
  return (
    <div className="h-full overflow-hidden">
      {grid
        ? <Suspense fallback={null}><KioskWidgetHome /></Suspense>
        : <LayeredHome />}
    </div>
  )
}
