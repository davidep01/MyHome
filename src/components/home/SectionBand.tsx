import type { ReactNode } from 'react'

interface SectionBandProps {
  title: string
  count?: number
  action?: ReactNode
  /** Minimum card width for the auto-fill bento grid. */
  minColumn?: number
  children: ReactNode
}

/** Titled section with a responsive bento grid, used across the home and pages. */
export function SectionBand({ title, count, action, minColumn = 180, children }: SectionBandProps) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-base font-semibold text-black/85">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-black/8 px-2 py-0.5 text-xs text-black/40">{count}</span>
        )}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minColumn}px, 1fr))` }}
      >
        {children}
      </div>
    </section>
  )
}
