import { BRAND_EXPANDED, BRAND_LOGO_SRC, BRAND_NAME } from '../../lib/brand'
import { cn } from '../../lib/utils'

/**
 * Il volto di S.I.M.I.: la scimmietta con le cuffie e il nome SOTTO, sempre
 * insieme. Unico punto in cui il logo viene reso: ovunque compaia il brand,
 * si usa questo componente (mai il nome da solo, mai il logo da solo).
 *
 * `tone="light"` è per le superfici sempre scure (ambient, aggiornamento): lì
 * il nome resta chiaro indipendentemente dal tema. Il logo è un'illustrazione
 * a colori fissi e non viene mai alterato dal tema.
 */
export function BrandMark({
  size = 48,
  tone = 'brand',
  className,
}: {
  /** Larghezza del logo in px. */
  size?: number
  tone?: 'brand' | 'light'
  className?: string
}) {
  return (
    <span className={cn('inline-flex shrink-0 flex-col items-center gap-1', className)} title={BRAND_EXPANDED}>
      <img
        src={BRAND_LOGO_SRC}
        alt=""
        width={size}
        height={Math.round(size * 0.81)}
        draggable={false}
        decoding="async"
        className="select-none object-contain"
        style={{ width: size, height: Math.round(size * 0.81) }}
      />
      <span
        className={cn(
          'whitespace-nowrap font-bold uppercase leading-none tracking-[0.14em]',
          size >= 64 ? 'text-xs' : 'text-[10px]',
          tone === 'light' ? 'text-white/70' : 'text-[var(--action-blue)]',
        )}
      >
        {BRAND_NAME}
      </span>
    </span>
  )
}
