import { cn } from '../../lib/utils'

export interface AdminSection { id: string; label: string; description: string }


export function AdminSections({ sections, active, onSelect }: { sections: readonly AdminSection[]; active: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Sezioni della pagina" className="flex shrink-0 gap-2 overflow-x-auto border-b border-[var(--hairline)] pb-3">
      {sections.map((item) => <a key={item.id} href={`?section=${item.id}`} aria-current={active === item.id ? 'page' : undefined}
        onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelect(item.id) }}
        className={cn('flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors', active === item.id ? 'bg-[var(--action-blue)] text-[var(--on-accent)]' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)] hover:bg-[var(--fill-muted)]')}>
        {item.label}
      </a>)}
    </nav>
  )
}
