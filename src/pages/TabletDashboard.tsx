import { lazy, Suspense } from 'react'
import { LayeredHome } from '../components/home/LayeredHome'
import { useTabletLayout } from '../hooks/useTabletLayout'

// La griglia manuale è lazy: il percorso composer non scarica
// react-grid-layout (~81KB) al boot.
const KioskWidgetHome = lazy(() =>
  import('../components/home/widgets/KioskWidgetHome').then((m) => ({ default: m.KioskWidgetHome })))

/**
 * Override di diagnostica per-dispositivo: localStorage['myhome.home'] =
 * 'grid' | 'composer' vince sulla config (utile per testare un solo tablet).
 */
function deviceOverride(): 'composer' | 'grid' | null {
  try {
    const v = localStorage.getItem('myhome.home')
    return v === 'grid' || v === 'composer' ? v : null
  } catch {
    return null
  }
}

/**
 * Tablet/kiosk home: auto-composta (default) o griglia drag&drop, scelta da
 * Funzioni → Kiosk (config.kiosk.homeMode, propagata live via /api/layout).
 */
export function TabletDashboard() {
  const { data: layout } = useTabletLayout('home')
  const mode = deviceOverride() ?? layout?.kiosk?.homeMode ?? 'composer'
  return (
    <div className="h-full overflow-hidden">
      {mode === 'grid'
        ? <Suspense fallback={null}><KioskWidgetHome /></Suspense>
        : <LayeredHome />}
    </div>
  )
}
