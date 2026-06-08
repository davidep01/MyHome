import type { ComponentProps, ReactNode } from 'react'
import type { Layout } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { MeasuredGridLayout } from './MeasuredGridLayout'
import { HomeWidgetView } from './HomeWidgetView'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'
import { HOME_COLS } from '../../../lib/homeLayout'
import type { HomeWidget, TabletDashboardLayout } from '../../../api/backend'

const GRID_PADDING: [number, number] = [0, 0]

type PublicWidgetConfig = Pick<TabletDashboardLayout, 'deviceOverrides' | 'groups' | 'userName'>

interface HomeGridCanvasProps {
  widgets: HomeWidget[]
  layout: Layout
  rowHeight: number
  gap: readonly [number, number]
  editMode: boolean
  isDraggable: boolean
  onDragStop: (layout: Layout) => void
  onDrag?: ComponentProps<typeof MeasuredGridLayout>['onDrag']
  draggableCancel?: string
  className?: string
  /** Passed to each widget so the kiosk renders from its public layout payload. */
  publicConfig?: PublicWidgetConfig
  /** Per-tile edit overlay (remove/resize on desktop, grip on kiosk) — only while editing. */
  renderOverlay?: (widget: HomeWidget) => ReactNode
  /** Optional per-tile wrapper (e.g. the desktop wobble animation). */
  renderTile?: (widget: HomeWidget, content: ReactNode) => ReactNode
}

/**
 * Shared grid surface for the home: owns the react-grid-layout plumbing (cols,
 * compaction, collision, CSS transforms) so desktop and kiosk can't drift apart.
 * Layout maths come from `homeLayout`; the host components keep their own
 * toolbars, headers and persistence.
 */
export function HomeGridCanvas({
  widgets,
  layout,
  rowHeight,
  gap,
  editMode,
  isDraggable,
  onDragStop,
  onDrag,
  draggableCancel,
  className,
  publicConfig,
  renderOverlay,
  renderTile,
}: HomeGridCanvasProps) {
  return (
    <MeasuredGridLayout
      className={className}
      layout={layout}
      cols={HOME_COLS}
      rowHeight={rowHeight}
      margin={gap as [number, number]}
      containerPadding={GRID_PADDING}
      compactType={null}
      preventCollision={false}
      isBounded
      isDraggable={isDraggable}
      isResizable={false}
      draggableCancel={draggableCancel}
      onDrag={onDrag}
      onDragStop={onDragStop}
      useCSSTransforms
      autoSize
    >
      {widgets.map((widget) => {
        const content = (
          <WidgetErrorBoundary>
            <HomeWidgetView widget={widget} publicConfig={publicConfig} />
          </WidgetErrorBoundary>
        )
        return (
          <div key={widget.id} className="relative min-w-0">
            {renderTile ? renderTile(widget, content) : content}
            {editMode && renderOverlay?.(widget)}
          </div>
        )
      })}
    </MeasuredGridLayout>
  )
}
