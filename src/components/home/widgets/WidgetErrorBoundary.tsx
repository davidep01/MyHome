import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { GlassCard } from '../../glass/GlassCard'

/**
 * Isolates a single widget: if it throws, the rest of the home keeps working and
 * the tile shows a calm fallback instead of crashing the whole dashboard.
 */
export class WidgetErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[widget] render error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <GlassCard className="flex h-full items-center justify-center gap-2 text-black/35">
          <AlertTriangle size={15} />
          <span className="text-xs">Widget non disponibile</span>
        </GlassCard>
      )
    }
    return this.props.children
  }
}
