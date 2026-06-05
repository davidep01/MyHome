import { Lightbulb } from 'lucide-react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { DragSlider } from '../glass/DragSlider'
import { useHAService } from '../../hooks/useHAService'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'

const PRESETS = [
  { label: 'Relax', pct: 25 },
  { label: 'Lettura', pct: 60 },
  { label: 'Pieno', pct: 100 },
  { label: 'Notte', pct: 8 },
]

export function LightDetail({ entity }: { entity: HassEntity }) {
  const { call } = useHAService()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const patchEntity = useEntityStore((s) => s.patchEntity)

  const entityId = entity.entity_id
  const isOn = entity.state === 'on'
  const brightness = entity.attributes?.brightness
    ? Math.round((entity.attributes.brightness / 255) * 100)
    : isOn ? 100 : 0

  const toggle = () => {
    setOptimisticState(entityId, isOn ? 'off' : 'on')
    call('light', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId })
  }
  const preview = (v: number) => patchEntity(entityId, { attributes: { brightness: Math.round((v / 100) * 255) } })
  const commit = (v: number) => {
    setOptimisticState(entityId, 'on', { brightness: Math.round((v / 100) * 255) })
    call('light', 'turn_on', { entity_id: entityId, brightness_pct: v })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Big toggle row */}
      <div className="flex items-center justify-between rounded-[11px] px-4 py-3" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-full transition-all', isOn ? 'bg-yellow-500/20' : 'bg-black/8')}>
            <Lightbulb size={22} className={isOn ? 'text-yellow-500' : 'text-black/30'} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{isOn ? 'Accesa' : 'Spenta'}</p>
            {isOn && <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>{brightness}%</p>}
          </div>
        </div>
        <div className={cn('lg-toggle', isOn && 'on')} onClick={toggle}>
          <span className="lg-toggle-knob" />
        </div>
      </div>

      {/* Brightness slider */}
      <div className="rounded-[11px] p-4" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-tertiary)' }}>
          Luminosità — {brightness}%
        </p>
        <DragSlider value={brightness} onChange={preview} onChangeEnd={commit} variant="amber" />
      </div>

      {/* Presets */}
      <div className="rounded-[11px] p-4" style={{ background: 'rgba(0,0,0,0.04)' }}>
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ink-tertiary)' }}>
          Preset
        </p>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => commit(p.pct)}
              className="rounded-[8px] py-2.5 text-xs font-semibold transition active:scale-95"
              style={brightness === p.pct
                ? { background: 'rgba(234,179,8,0.16)', color: '#7a5b08' }
                : { background: 'rgba(0,0,0,0.05)', color: 'var(--ink-secondary)' }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
