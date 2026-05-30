import { Lightbulb } from 'lucide-react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { DragSlider } from '../glass/DragSlider'
import { useHAService } from '../../hooks/useHAService'
import { useEntityStore } from '../../store/entities'
import { domainAccent } from '../../design/tokens'
import { cn } from '../../lib/utils'

export function LightDetail({ entity }: { entity: HassEntity }) {
  const { call } = useHAService()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const patchEntity = useEntityStore((s) => s.patchEntity)
  const accent = domainAccent('light')

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4 pt-2">
        <button
          onClick={toggle}
          className={cn(
            'flex h-24 w-24 items-center justify-center rounded-full transition-all',
            isOn ? 'bg-yellow-500/20' : 'bg-white/8',
          )}
        >
          <Lightbulb size={40} className={isOn ? 'text-yellow-300' : 'text-white/30'} />
        </button>
        <p className="text-sm text-white/50">{isOn ? `Accesa • ${brightness}%` : 'Spenta'}</p>
      </div>

      <DragSlider value={brightness} onChange={preview} onChangeEnd={commit} color={accent.color} label="Intensità" />

      <div className="grid grid-cols-4 gap-2">
        {[25, 50, 75, 100].map((pct) => (
          <button
            key={pct}
            onClick={() => commit(pct)}
            className={cn(
              'rounded-[14px] py-2.5 text-sm font-medium transition',
              brightness === pct ? 'bg-yellow-500 text-white' : 'bg-white/8 text-white/70 hover:bg-white/12',
            )}
          >
            {pct}%
          </button>
        ))}
      </div>
    </div>
  )
}
