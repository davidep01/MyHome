import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Primitive della vista Memoria: badge, stati UI distinti (caricamento,
 * errore, vuoto) e azioni touch ≥ 44px. "Non so" non diventa mai uno stato
 * verde generico.
 */

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'ok' | 'warn' | 'danger' }) {
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
      tone === 'neutral' && 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)]',
      tone === 'blue' && 'bg-[var(--action-blue)]/12 text-[var(--action-blue)]',
      tone === 'ok' && 'bg-[var(--ok-green)]/12 text-[var(--ok-green)]',
      tone === 'warn' && 'bg-[var(--alert-orange)]/12 text-[var(--alert-orange)]',
      tone === 'danger' && 'bg-[var(--danger-red)]/12 text-[var(--danger-red)]',
    )}>{children}</span>
  )
}

export function Loading({ what }: { what: string }) {
  return <p role="status" className="py-4 text-sm text-[var(--ink-secondary)]">Caricamento {what}…</p>
}

export function Failure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <p role="alert" className="py-4 text-sm text-[var(--ink-secondary)]">
      {message}{' '}
      {onRetry && <button type="button" className="min-h-11 font-semibold text-[var(--action-blue)]" onClick={onRetry}>Riprova</button>}
    </p>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[11px] bg-[var(--fill-subtle)] px-3 py-4 text-center text-sm text-[var(--ink-secondary)]">{children}</p>
}

export function ActionButton({ children, onClick, disabled, tone = 'neutral', label }: { children: ReactNode; onClick: () => void; disabled?: boolean; tone?: 'neutral' | 'primary' | 'danger'; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40',
        tone === 'primary' && 'bg-[var(--action-blue)] text-[var(--on-accent)]',
        tone === 'neutral' && 'bg-[var(--fill-subtle)] text-[var(--ink)]',
        tone === 'danger' && 'bg-[var(--danger-red)]/12 text-[var(--danger-red)]',
      )}
    >
      {children}
    </button>
  )
}

/** Barriera sempre visibile: questa release non comanda nulla. */
export function NoControlNotice() {
  return <p className="text-xs font-semibold text-[var(--ink-secondary)]">Questa versione non controlla i dispositivi.</p>
}
