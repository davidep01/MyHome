import { Component, createRef, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  private heading = createRef<HTMLHeadingElement>()

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui]', error, info.componentStack)
    requestAnimationFrame(() => this.heading.current?.focus())
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="flex min-h-full w-full items-center justify-center bg-[var(--canvas-page)] px-5 py-8">
        <div className="w-full max-w-md rounded-[22px] border border-[var(--hairline)] bg-[var(--surface-solid)] p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-[var(--danger-red)]">
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
          <h1 ref={this.heading} tabIndex={-1} className="mt-4 text-xl font-semibold text-[var(--ink)] outline-none">S.I.M.I. ha incontrato un errore</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-secondary)]">Ricarica l’interfaccia. I dati salvati saranno conservati; eventuali modifiche non salvate andranno perse.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--action-blue)] px-5 text-sm font-semibold text-[var(--on-accent)]"
          >
            <RefreshCw size={16} aria-hidden="true" /> Ricarica
          </button>
        </div>
      </main>
    )
  }
}
