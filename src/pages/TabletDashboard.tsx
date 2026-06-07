import { KioskWidgetHome } from '../components/home/widgets/KioskWidgetHome'

/** Tablet/kiosk home: operational dashboard; only layout arrangement is editable. */
export function TabletDashboard() {
  return (
    <div className="h-full overflow-hidden">
      <KioskWidgetHome />
    </div>
  )
}
