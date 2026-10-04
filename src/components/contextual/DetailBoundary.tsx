import { Component, type ReactNode } from 'react'

/** An unavailable detail chunk must never replace the dashboard. */
export class DetailBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <div role="alert" className="rounded-2xl bg-[var(--fill-subtle)] p-5 text-[var(--ink-secondary)]">
      <p>Il pannello non è disponibile. La dashboard resta utilizzabile.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="simi-editor-button" onClick={this.props.onRetry}>Riprova</button>
        <button type="button" className="simi-editor-button" onClick={() => window.location.reload()}>Ricarica applicazione</button>
      </div>
    </div>
  }
}
