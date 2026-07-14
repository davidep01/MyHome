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
      <main className="flex min-h-full w-full items-center justify-center bg-[#f5f5f7] px-5 py-8">
        <div className="w-full max-w-md rounded-[22px] border border-red-800/15 bg-white/80 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-700">
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
          <h1 ref={this.heading} tabIndex={-1} className="mt-4 text-xl font-semibold text-[#1d1d1f] outline-none">MyHome ha incontrato un errore</h1>
          <p className="mt-2 text-sm leading-6 text-black/55">Ricarica l’interfaccia. I dati e la configurazione salvata non verranno modificati.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0066cc] px-5 text-sm font-semibold text-white"
          >
            <RefreshCw size={16} aria-hidden="true" /> Ricarica
          </button>
        </div>
      </main>
    )
  }
}
