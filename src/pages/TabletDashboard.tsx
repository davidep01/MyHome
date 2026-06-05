import { WidgetHome } from '../components/home/widgets/WidgetHome'

/** The home is a single iOS-style widget canvas: add/configure/arrange widgets. */
export function TabletDashboard() {
  return (
    <div className="h-full overflow-hidden">
      <WidgetHome />
    </div>
  )
}
