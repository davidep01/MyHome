import { useId, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, Zap } from 'lucide-react'
import type { ActionShortcut } from '../../api/backend'
import { useEntityStore } from '../../store/entities'
import { entityName } from '../widgets/utils/mapEntityToWidgetCard'
import { MAX_SHORTCUTS, SHORTCUT_DOMAINS, shortcutRequiresHold } from '../../lib/actionShortcuts'
import { uid } from '../../lib/uid'
import { cn } from '../../lib/utils'

/**
 * Editor admin delle azioni rapide (§10.3/§11): elenco riordinabile con
 * etichetta pubblica, entità bersaglio e conferma. I domini critici (serrature,
 * cancelli, sirene) sono SEMPRE a pressione prolungata: il toggle è mostrato
 * bloccato, non nascosto — l'admin vede la regola invece di scoprirla sul muro.
 */
export function ShortcutsEditor({
  value,
  onChange,
  disabled,
  title = 'Azioni rapide',
  hint,
}: {
  value: ActionShortcut[]
  onChange: (next: ActionShortcut[]) => void
  disabled?: boolean
  title?: string
  hint?: string
}) {
  const entities = useEntityStore((s) => s.entities)
  const [pendingEntity, setPendingEntity] = useState('')
  const id = useId()

  const options = useMemo(
    () => Object.values(entities)
      .filter((e) => SHORTCUT_DOMAINS.includes(e.entity_id.split('.')[0]))
      .sort((a, b) => entityName(a).localeCompare(entityName(b), 'it')),
    [entities],
  )

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  const add = () => {
    const entity = entities[pendingEntity]
    if (!entity || value.length >= MAX_SHORTCUTS) return
    onChange([...value, { id: uid('sc'), label: entityName(entity), entityId: entity.entity_id }])
    setPendingEntity('')
  }

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-black/50" id={`${id}-title`}>
        <Zap size={12} aria-hidden="true" /> {title} ({value.length}/{MAX_SHORTCUTS})
      </p>
      {value.map((shortcut, index) => {
        const forcedHold = shortcutRequiresHold({ ...shortcut, confirm: false })
        return (
          <div key={shortcut.id} className="flex items-center gap-2 rounded-[10px] bg-black/[0.04] px-2.5 py-2">
            <div className="flex shrink-0 flex-col">
              <button type="button" onClick={() => move(index, -1)} disabled={disabled || index === 0} className="flex h-6 w-8 items-center justify-center rounded-md text-black/40 disabled:opacity-25" aria-label={`Sposta su ${shortcut.label}`}>
                <ArrowUp size={13} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={disabled || index === value.length - 1} className="flex h-6 w-8 items-center justify-center rounded-md text-black/40 disabled:opacity-25" aria-label={`Sposta giù ${shortcut.label}`}>
                <ArrowDown size={13} aria-hidden="true" />
              </button>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor={`${id}-label-${shortcut.id}`} className="sr-only">Etichetta pubblica</label>
              <input
                id={`${id}-label-${shortcut.id}`}
                value={shortcut.label}
                disabled={disabled}
                maxLength={40}
                onChange={(e) => onChange(value.map((s) => (s.id === shortcut.id ? { ...s, label: e.target.value } : s)))}
                className="w-full rounded-[8px] bg-white/70 px-2 py-1.5 text-sm font-semibold text-[#1d1d1f] outline-none focus:bg-white"
              />
              <p className="truncate text-[11px] text-black/40">{entityName(entities[shortcut.entityId]) }</p>
            </div>
            <label className={cn('flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-black/50', (disabled || forcedHold) && 'cursor-default opacity-60')}>
              <input
                type="checkbox"
                checked={forcedHold || shortcut.confirm === true}
                disabled={disabled || forcedHold}
                onChange={(e) => onChange(value.map((s) => (s.id === shortcut.id ? { ...s, confirm: e.target.checked || undefined } : s)))}
                className="h-4 w-4 accent-[#0066cc]"
              />
              Tieni premuto
            </label>
            <button
              type="button"
              onClick={() => onChange(value.filter((s) => s.id !== shortcut.id))}
              disabled={disabled}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500"
              aria-label={`Rimuovi ${shortcut.label}`}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        )
      })}
      {value.length < MAX_SHORTCUTS && (
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-add`} className="sr-only">Dispositivo per la nuova azione</label>
          <select
            id={`${id}-add`}
            value={pendingEntity}
            disabled={disabled}
            onChange={(e) => setPendingEntity(e.target.value)}
            className="min-h-[44px] min-w-0 flex-1 rounded-[12px] bg-black/8 px-3 text-sm text-[#1d1d1f] outline-none focus:bg-black/12"
          >
            <option value="">— scegli un dispositivo o una scena —</option>
            {options.map((e) => (
              <option key={e.entity_id} value={e.entity_id}>{entityName(e)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={disabled || !pendingEntity}
            className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-[#0066cc] px-3 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
          >
            <Plus size={13} aria-hidden="true" /> Aggiungi
          </button>
        </div>
      )}
      {hint && <p className="text-[11px] text-black/35">{hint}</p>}
      {value.some((s) => shortcutRequiresHold(s)) && (
        <p className="text-[11px] text-black/35">Serrature, cancelli e sirene richiedono sempre la pressione prolungata (900ms): il tocco singolo non basta.</p>
      )}
    </div>
  )
}
