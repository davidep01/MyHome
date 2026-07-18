import { useEffect, useRef, useState } from 'react'
import { Check, DoorOpen, Lightbulb, Play, Power, Siren, Volume2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ActionShortcut } from '../../api/backend'
import { callService } from '../../api/ha-websocket'
import { resolveShortcutAction, shortcutDomain, shortcutRequiresHold } from '../../lib/actionShortcuts'
import { DynamicIcon } from '../DynamicIcon'
import { useHaptic } from '../../hooks/useHaptic'
import { cn } from '../../lib/utils'

const DOMAIN_ICON: Record<string, LucideIcon> = {
  light: Lightbulb,
  switch: Power,
  cover: DoorOpen,
  valve: DoorOpen,
  lock: DoorOpen,
  scene: Play,
  script: Play,
  siren: Siren,
  media_player: Volume2,
}

/**
 * Azione rapida configurabile su superficie scura (modale campanello §10.3,
 * overlay emergenza §11). Tap per le azioni innocue; pressione prolungata
 * 900ms — mai tap — per ciò che apre casa o fa rumore. Blocco dei doppi
 * comandi via stato pending, esito ✓/errore visibile sul bottone stesso.
 */
export function ShortcutActionButton({ shortcut, onDone, disabled = false }: { shortcut: ActionShortcut; onDone?: () => void; disabled?: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'holding' | 'pending' | 'done' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { heavy, light } = useHaptic()

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const action = resolveShortcutAction(shortcut)
  if (!action) return null
  const needsHold = shortcutRequiresHold(shortcut)
  const fallbackIcon = DOMAIN_ICON[shortcutDomain(shortcut)] ?? Power

  const execute = () => {
    if (disabled) return
    setPhase('pending')
    if (needsHold) heavy()
    else light()
    callService(action.domain, action.service, { entity_id: shortcut.entityId })
      .then(() => {
        setPhase('done')
        onDone?.()
        timer.current = setTimeout(() => { timer.current = null; setPhase('idle') }, 2_500)
      })
      .catch(() => {
        setPhase('failed')
        timer.current = setTimeout(() => { timer.current = null; setPhase('idle') }, 3_000)
      })
  }

  const busy = phase === 'pending' || phase === 'done'

  const start = () => {
    if (disabled || busy || timer.current) return
    if (!needsHold) {
      execute()
      return
    }
    setPhase('holding')
    timer.current = setTimeout(() => {
      timer.current = null
      execute()
    }, 900)
  }
  const cancel = () => {
    if (phase !== 'holding') return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setPhase('idle')
  }

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onBlur={cancel}
      onKeyDown={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        if (!event.repeat) start()
      }}
      onKeyUp={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        cancel()
      }}
      disabled={disabled || busy}
      aria-label={disabled ? `Test: ${shortcut.label}, azione disabilitata` : needsHold ? `Tieni premuto per: ${shortcut.label}` : shortcut.label}
      className={cn(
        'relative flex min-h-[52px] min-w-0 flex-1 touch-none select-none items-center justify-center gap-2 overflow-hidden rounded-full px-4 text-base font-semibold backdrop-blur transition',
        phase === 'done' ? 'bg-[#30d158]/25 text-[#7ee2a8]'
          : phase === 'failed' ? 'bg-red-500/25 text-red-200'
            : 'bg-white/15 text-white',
        phase === 'holding' && 'scale-[0.98]',
        phase === 'pending' && 'opacity-70',
        disabled && 'opacity-55',
      )}
    >
      {phase === 'holding' && (
        <span className="absolute inset-y-0 left-0 bg-white/25" style={{ animation: 'lock-hold-fill 900ms linear forwards' }} />
      )}
      {phase === 'done'
        ? <Check size={18} className="relative shrink-0" aria-hidden="true" />
        : <DynamicIcon name={shortcut.icon} fallback={fallbackIcon} size={18} className="relative shrink-0" aria-hidden="true" />}
      <span className="relative truncate">
        {disabled ? `Test · ${shortcut.label}`
          : phase === 'failed' ? `Riprova — ${shortcut.label}`
          : phase === 'pending' ? `${shortcut.label}…`
            : phase === 'done' ? shortcut.label
              : needsHold ? `Tieni premuto: ${shortcut.label}` : shortcut.label}
      </span>
    </button>
  )
}
