import type { ReactNode } from 'react'

/** Bento grid base: a 1×1 tile is `minColumn` wide × ROW_UNIT tall; cards span N units. */
export const BENTO_ROW_UNIT = 112

interface SectionBandProps {
  title: string
  count?: number
  action?: ReactNode
  /** Base tile width (1-column span). Cards span 1–2 of these. */
  minColumn?: number
  children: ReactNode
}

/** Titled section rendering a dense bento grid of variable-size cards. */
export function SectionBand({ title, count, action, minColumn = 150, children }: SectionBandProps) {
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
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${minColumn}px, 1fr))`,
          gridAutoRows: `${BENTO_ROW_UNIT}px`,
          gridAutoFlow: 'row dense',
        }}
      >
        {children}
      </div>
    </section>
  )
}
