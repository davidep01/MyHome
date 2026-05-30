import { Minus, Plus, Power, Flame, Sparkles } from 'lucide-react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { RadialDial } from '../glass/RadialDial'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

const MODES: { id: string; label: string; Icon: React.ElementType }[] = [
  { id: 'off', label: 'OFF', Icon: Power },
  { id: 'heat', label: 'CALDO', Icon: Flame },
  { id: 'auto', label: 'AUTO', Icon: Sparkles },
]

export function ClimateDetail({ entity }: { entity: HassEntity }) {
  const { call } = useHAService()
  const { light, medium } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)

  const entityId = entity.entity_id
  const current = entity.attributes?.current_temperature as number | undefined
  const target = (entity.attributes?.temperature as number | undefined) ?? current ?? 20
  const min = (entity.attributes?.min_temp as number | undefined) ?? 7
  const max = (entity.attributes?.max_temp as number | undefined) ?? 35
  const step = (entity.attributes?.target_temp_step as number | undefined) ?? 0.5
  const mode = entity.state
  const fanModes = (entity.attributes?.fan_modes as string[] | undefined) ?? ['1', '2', '3', '4', '5']
  const fanMode = entity.attributes?.fan_mode as string | undefined
  const isHeating = (entity.attributes?.hvac_action as string | undefined) === 'heating' || mode === 'heat'
  const color = isHeating ? tokens.accent.orange : tokens.accent.blue

  const setTemp = (next: number) => {
    light()
    const clamped = Math.min(max, Math.max(min, Number(next.toFixed(1))))
    setOptimisticState(entityId, mode, { temperature: clamped })
    call('climate', 'set_temperature', { entity_id: entityId, temperature: clamped })
  }

  const setMode = (hvacMode: string) => {
    medium()
    setOptimisticState(entityId, hvacMode)
    call('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: hvacMode })
  }

  const setFan = (fan: string) => {
    light()
    setOptimisticState(entityId, mode, { fan_mode: fan })
    call('climate', 'set_fan_mode', { entity_id: entityId, fan_mode: fan })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Radial dial */}
      <div className="flex flex-col items-center gap-4 pt-2">
        <RadialDial
          value={target}
          min={min}
          max={max}
          color={color}
          size={208}
          label={`${target.toFixed(1)}°C`}
          sublabel={current !== undefined ? `Attuale: ${current}°C` : undefined}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTemp(target - step)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/8 text-black/70 transition hover:bg-black/14 active:scale-90"
            aria-label="Diminuisci"
          >
            <Minus size={18} />
          </button>
          <button
            onClick={() => setTemp(Math.round(target))}
            className="rounded-full bg-black/8 px-8 py-3 text-sm font-medium text-black/80 transition hover:bg-black/14"
          >
            Allinea
          </button>
          <button
            onClick={() => setTemp(target + step)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/8 text-black/70 transition hover:bg-black/14 active:scale-90"
            aria-label="Aumenta"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Mode */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Modalità</p>
        <div className="flex gap-2 rounded-[18px] bg-black/5 p-1.5">
          {MODES.map(({ id, label, Icon }) => {
            const active = mode === id
            return (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-[14px] py-3 text-[11px] font-medium transition',
                  active ? 'text-[#1d1d1f]' : 'text-black/45 hover:text-black/70',
                )}
                style={active ? { background: id === 'heat' ? tokens.accent.orange : 'rgba(0,0,0,0.10)' } : undefined}
              >
                <Icon size={18} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Fan mode */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Ventola</p>
        <div className="flex gap-2">
          {fanModes.map((f) => {
            const active = fanMode === f
            return (
              <button
                key={f}
                onClick={() => setFan(f)}
                className={cn(
                  'flex h-11 flex-1 items-center justify-center rounded-[14px] text-sm font-semibold transition',
                  active ? 'bg-black/16 text-[#1d1d1f]' : 'bg-black/6 text-black/45 hover:text-black/70',
                )}
              >
                {f}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
