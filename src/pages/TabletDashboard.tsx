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
 * Tablet/kiosk home: sempre la home dinamica (tutte le card attive, ordinate
 * per uso e attività). `config.kiosk.homeMode: 'grid'` salvato in passato non
 * la sostituisce più: con la griglia manuale i dispositivi attivati nel wizard
 * non comparivano finché non venivano aggiunti a mano, cioè "non vedo le
 * card". La griglia legacy resta raggiungibile solo dall'override di
 * diagnostica per-dispositivo `localStorage['myhome.home'] = 'grid'`.
 */
export function TabletDashboard() {
  const { data: layout } = useTabletLayout('home')
  const mode = deviceOverride() ?? 'composer'
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {layout?.source === 'cache' && <div role="status" className="shrink-0 bg-[var(--fill-muted)] px-5 py-2 text-center text-xs font-semibold text-[var(--ink-secondary)]">Configurazione locale · server temporaneamente non raggiungibile</div>}
      <div className="min-h-0 flex-1 overflow-hidden">
      {mode === 'grid'
        ? <Suspense fallback={null}><KioskWidgetHome /></Suspense>
        : <LayeredHome />}
      </div>
    </div>
  )
}
