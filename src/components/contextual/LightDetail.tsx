import { useRef, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { DragSlider } from '../glass/DragSlider'
import { useHAService } from '../../hooks/useHAService'
import { useEntityStore } from '../../store/entities'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { cn } from '../../lib/utils'

const PRESETS = [
  { label: 'Relax', pct: 25 },
  { label: 'Lettura', pct: 60 },
  { label: 'Pieno', pct: 100 },
  { label: 'Notte', pct: 8 },
]

export function LightDetail({ entity }: { entity: HassEntity }) {
  const { call } = useHAService()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const patchEntity = useEntityStore((s) => s.patchEntity)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const brightnessOriginRef = useRef<{ state: string; brightness?: number } | null>(null)

  const entityId = entity.entity_id
  const isOn = entity.state === 'on'
  const unavailable = entity.state === 'unavailable'
  const brightness = entity.attributes?.brightness
    ? Math.round((entity.attributes.brightness / 255) * 100)
    : isOn ? 100 : 0

  const run = (task: () => Promise<unknown>, optimistic: () => void, rollback: () => void, finish?: () => void) => {
    if (busyRef.current || unavailable) return
    busyRef.current = true
    setPending(true)
    setError(null)
    optimistic()
    void Promise.resolve()
      .then(task)
      .catch(() => {
        rollback()
        actionFailed()
        setError('Comando luce non eseguito. Riprova.')
      })
      .finally(() => {
        busyRef.current = false
        setPending(false)
        finish?.()
      })
  }

  const toggle = () => {
    run(
      () => call('light', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId }),
      () => setOptimisticState(entityId, isOn ? 'off' : 'on'),
      () => setOptimisticState(entityId, entity.state),
    )
  }
  const preview = (value: number) => {
    if (busyRef.current || unavailable) return
    brightnessOriginRef.current ??= {
      state: entity.state,
      brightness: typeof entity.attributes?.brightness === 'number' ? entity.attributes.brightness : undefined,
    }
    patchEntity(entityId, { attributes: { brightness: Math.round((value / 100) * 255) } })
  }
  const commit = (v: number) => {
    const original = brightnessOriginRef.current ?? {
      state: entity.state,
      brightness: typeof entity.attributes?.brightness === 'number' ? entity.attributes.brightness : undefined,
    }
    run(
      () => call('light', 'turn_on', { entity_id: entityId, brightness_pct: Math.round(v) }),
      () => setOptimisticState(entityId, 'on', { brightness: Math.round((v / 100) * 255) }),
      () => setOptimisticState(entityId, original.state, { brightness: original.brightness }),
      () => { brightnessOriginRef.current = null },
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', feedbackClass)} aria-busy={pending}>
      {/* Big toggle row */}
      <div className="flex items-center justify-between rounded-[11px] px-4 py-3" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-full transition-all', isOn ? 'bg-yellow-500/20' : 'bg-black/8')}>
            <Lightbulb size={22} className={isOn ? 'text-yellow-500' : 'text-black/30'} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{isOn ? 'Accesa' : 'Spenta'}</p>
            {isOn && <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>{brightness}%</p>}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Luce"
          aria-checked={isOn}
          disabled={unavailable || pending}
          className={cn(
            'lg-toggle border-0 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc] disabled:cursor-not-allowed disabled:opacity-40',
            isOn && 'on',
          )}
          onClick={toggle}
        >
          <span className="lg-toggle-knob" aria-hidden="true" />
        </button>
      </div>

      {/* Brightness slider */}
      <div className="rounded-[11px] p-4" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-tertiary)' }}>
          Luminosità — {brightness}%
        </p>
        <DragSlider
          value={brightness}
          onChange={preview}
          onChangeEnd={commit}
          variant="amber"
          ariaLabel="Luminosità"
          disabled={unavailable || pending}
        />
      </div>

      {/* Presets */}
      <div className="rounded-[11px] p-4" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-tertiary)' }}>
          Preset
        </p>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              onClick={() => commit(p.pct)}
              disabled={unavailable || pending}
              aria-pressed={brightness === p.pct}
              className="rounded-[8px] py-2.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              style={brightness === p.pct
                ? { background: 'rgba(234,179,8,0.16)', color: '#7a5b08' }
                : { background: 'rgba(0,0,0,0.05)', color: 'var(--ink-secondary)' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-[11px] bg-red-500/10 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
