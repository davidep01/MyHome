import { useEffect, useId, useRef, useState } from 'react'
import { Power, ShieldAlert } from 'lucide-react'
import { cn } from '../../lib/utils'

/** Hold-to-activate control for sirens and other disruptive actions. */
export function HoldDangerAction({
  active,
  onActivate,
  onDeactivate,
  disabled,
  label,
  compact = false,
}: {
  active: boolean
  onActivate: () => void
  onDeactivate: () => void
  disabled?: boolean
  label: string
  compact?: boolean
}) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const instructionId = useId()

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const begin = () => {
    if (disabled) return
    if (active) {
      onDeactivate()
      return
    }
    if (timer.current) return
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setHolding(false)
      onActivate()
    }, 900)
  }

  return (
    <button
      type="button"
      onPointerDown={(event) => { event.stopPropagation(); begin() }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) begin()
      }}
      onKeyUp={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        cancel()
      }}
      onBlur={cancel}
      disabled={disabled}
      aria-pressed={active}
      aria-describedby={instructionId}
      aria-label={active ? `Disattiva ${label}` : `Tieni premuto per attivare ${label}`}
      className={cn(
        'relative inline-flex touch-none select-none items-center justify-center overflow-hidden font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-40',
        compact ? 'h-9 w-9 rounded-full' : 'min-h-11 gap-2 rounded-full px-4 text-sm',
        active ? 'bg-red-600 text-white' : 'bg-red-500/10 text-red-700',
        holding && 'scale-[0.97]',
      )}
    >
      {holding && <span className="absolute inset-y-0 left-0 bg-red-500/20" style={{ animation: 'lock-hold-fill 900ms linear forwards' }} />}
      <span className="relative">{active ? <Power size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}</span>
      {!compact && <span className="relative">{active ? 'Disattiva' : 'Tieni premuto · Attiva'}</span>}
      <span id={instructionId} className="sr-only">
        {active ? 'La disattivazione è immediata.' : 'Tieni premuto Spazio, Invio o il controllo per 900 millisecondi.'}
      </span>
    </button>
  )
}
