import { useRef, useState } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import {
  ChevronDown, ChevronUp, Home, Lock, LockOpen, MapPin, Pause, Play, Power, Square,
} from 'lucide-react'
import { callService } from '../../api/ha-websocket'
import { CameraStream } from '../widgets/CameraStream'
import { stateLabel } from '../widgets/utils/stateLabel'
import { useEntityStore } from '../../store/entities'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { cn } from '../../lib/utils'

/**
 * Controlli universali del pannello contestuale (Q3): ogni dominio HA ha la
 * sua plancia operativa — niente più "Controlli avanzati non disponibili".
 * I domini con un detail dedicato (light/climate/media/alarm) non passano di qui.
 */
export function GenericDetail({ entity }: { entity: HassEntity }) {
  const domain = entity.entity_id.split('.')[0]
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const { light: hLight, medium, heavy } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const unavailable = entity.state === 'unavailable'

  const act = (action: Promise<unknown>, rollback?: () => void) =>
    action.catch(() => { rollback?.(); actionFailed() })

  const call = (service: string, data?: Record<string, unknown>, serviceDomain = domain) =>
    callService(serviceDomain, service, { entity_id: entity.entity_id, ...data })

  const attrs = entity.attributes ?? {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

  const on = entity.state === 'on'
  const toggle = () => {
    hLight()
    const next = on ? 'off' : 'on'
    setOptimisticState(entity.entity_id, next)
    act(call(on ? 'turn_off' : 'turn_on'), () => setOptimisticState(entity.entity_id, entity.state))
  }

  return (
    <div className={cn('space-y-4', feedbackClass)}>
      {/* ── Controlli per dominio ── */}
      {(domain === 'switch' || domain === 'input_boolean' || domain === 'siren' || domain === 'automation' || domain === 'remote') && (
        <ToggleRow label={on ? 'Acceso' : 'Spento'} checked={on} disabled={unavailable} onToggle={toggle} />
      )}

      {domain === 'fan' && (
        <>
          <ToggleRow label={on ? 'In funzione' : 'Spento'} checked={on} disabled={unavailable} onToggle={toggle} />
          {num(attrs.percentage) !== undefined && (
            <SliderRow
              label="Velocità"
              value={num(attrs.percentage) ?? 0}
              disabled={unavailable || !on}
              onCommit={(v) => {
                setOptimisticState(entity.entity_id, v > 0 ? 'on' : 'off', { percentage: v })
                act(call('set_percentage', { percentage: v }))
              }}
            />
          )}
          <OptionChips
            label="Modalità"
            options={(attrs.preset_modes as string[] | undefined) ?? []}
            current={attrs.preset_mode as string | undefined}
            disabled={unavailable}
            onPick={(mode) => { medium(); act(call('set_preset_mode', { preset_mode: mode })) }}
          />
        </>
      )}

      {domain === 'humidifier' && (
        <>
          <ToggleRow label={on ? 'Acceso' : 'Spento'} checked={on} disabled={unavailable} onToggle={toggle} />
          {num(attrs.humidity) !== undefined && (
            <SliderRow
              label={`Umidità target${num(attrs.current_humidity) !== undefined ? ` · attuale ${Math.round(num(attrs.current_humidity)!)}%` : ''}`}
              value={num(attrs.humidity) ?? 50}
              min={num(attrs.min_humidity) ?? 20}
              max={num(attrs.max_humidity) ?? 90}
              disabled={unavailable || !on}
              onCommit={(v) => {
                setOptimisticState(entity.entity_id, 'on', { humidity: v })
                act(call('set_humidity', { humidity: v }))
              }}
            />
          )}
          <OptionChips
            label="Modalità"
            options={(attrs.available_modes as string[] | undefined) ?? []}
            current={attrs.mode as string | undefined}
            disabled={unavailable}
            onPick={(mode) => { medium(); act(call('set_mode', { mode })) }}
          />
        </>
      )}

      {(domain === 'cover' || domain === 'valve') && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <ActionButton Icon={ChevronUp} label="Apri" disabled={unavailable} onClick={() => { medium(); act(call(domain === 'valve' ? 'open_valve' : 'open_cover')) }} />
            <ActionButton Icon={Square} label="Stop" disabled={unavailable} onClick={() => { medium(); act(call(domain === 'valve' ? 'stop_valve' : 'stop_cover')) }} />
            <ActionButton Icon={ChevronDown} label="Chiudi" disabled={unavailable} onClick={() => { medium(); act(call(domain === 'valve' ? 'close_valve' : 'close_cover')) }} />
          </div>
          {num(attrs.current_position) !== undefined && (
            <SliderRow
              label="Posizione"
              value={num(attrs.current_position) ?? 0}
              disabled={unavailable}
              onCommit={(v) => act(call(domain === 'valve' ? 'set_valve_position' : 'set_cover_position', { position: v }))}
            />
          )}
        </>
      )}

      {domain === 'lock' && <LockControl entity={entity} act={act} call={call} haptic={heavy} setOptimistic={setOptimisticState} />}

      {(domain === 'vacuum' || domain === 'lawn_mower') && (
        <div className="grid grid-cols-3 gap-2">
          {domain === 'vacuum' ? (
            <>
              <ActionButton Icon={Play} label={entity.state === 'cleaning' ? 'In pulizia' : 'Avvia'} disabled={unavailable || entity.state === 'cleaning'} onClick={() => { medium(); act(call('start')) }} />
              <ActionButton Icon={Pause} label="Pausa" disabled={unavailable || entity.state !== 'cleaning'} onClick={() => { medium(); act(call('pause')) }} />
              <ActionButton Icon={Home} label="Base" disabled={unavailable} onClick={() => { medium(); act(call('return_to_base')) }} />
            </>
          ) : (
            <>
              <ActionButton Icon={Play} label={entity.state === 'mowing' ? 'In taglio' : 'Avvia'} disabled={unavailable || entity.state === 'mowing'} onClick={() => { medium(); act(call('start_mowing')) }} />
              <ActionButton Icon={Pause} label="Pausa" disabled={unavailable || entity.state !== 'mowing'} onClick={() => { medium(); act(call('pause')) }} />
              <ActionButton Icon={Home} label="Base" disabled={unavailable} onClick={() => { medium(); act(call('dock')) }} />
            </>
          )}
          {domain === 'vacuum' && (
            <button
              onClick={() => { hLight(); act(call('locate')) }}
              disabled={unavailable}
              className="col-span-3 flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-black/[0.05] text-sm font-medium text-black/60 transition active:scale-[0.98] disabled:opacity-40"
            >
              <MapPin size={15} /> Localizza
            </button>
          )}
        </div>
      )}

      {(domain === 'scene' || domain === 'script') && (
        <ActionButton
          Icon={Play}
          label={domain === 'scene' ? 'Attiva scena' : 'Esegui script'}
          primary
          disabled={unavailable}
          onClick={() => { medium(); act(call('turn_on')) }}
        />
      )}

      {(domain === 'button' || domain === 'input_button') && (
        <ActionButton Icon={Power} label="Premi" primary disabled={unavailable} onClick={() => { medium(); act(call('press')) }} />
      )}

      {(domain === 'select' || domain === 'input_select') && (
        <OptionChips
          label="Opzioni"
          options={(attrs.options as string[] | undefined) ?? []}
          current={entity.state}
          disabled={unavailable}
          onPick={(option) => {
            hLight()
            setOptimisticState(entity.entity_id, option)
            act(call('select_option', { option }), () => setOptimisticState(entity.entity_id, entity.state))
          }}
        />
      )}

      {(domain === 'number' || domain === 'input_number') && (
        <SliderRow
          label={`Valore${attrs.unit_of_measurement ? ` (${attrs.unit_of_measurement})` : ''}`}
          value={Number(entity.state) || 0}
          min={num(attrs.min) ?? 0}
          max={num(attrs.max) ?? 100}
          step={num(attrs.step) ?? 1}
          disabled={unavailable}
          onCommit={(v) => {
            setOptimisticState(entity.entity_id, String(v))
            act(call('set_value', { value: v }), () => setOptimisticState(entity.entity_id, entity.state))
          }}
        />
      )}

      {domain === 'water_heater' && (
        <>
          {num(attrs.temperature) !== undefined && (
            <SliderRow
              label="Temperatura target (°C)"
              value={num(attrs.temperature) ?? 40}
              min={num(attrs.min_temp) ?? 30}
              max={num(attrs.max_temp) ?? 70}
              disabled={unavailable}
              onCommit={(v) => act(call('set_temperature', { temperature: v }))}
            />
          )}
          <OptionChips
            label="Modalità"
            options={(attrs.operation_list as string[] | undefined) ?? []}
            current={entity.state}
            disabled={unavailable}
            onPick={(mode) => { medium(); act(call('set_operation_mode', { operation_mode: mode })) }}
          />
        </>
      )}

      {domain === 'camera' && (
        <div className="h-[220px] overflow-hidden rounded-[16px]">
          <CameraStream entityId={entity.entity_id} fit="cover" />
        </div>
      )}

      {/* ── Sezione informativa, per tutti ── */}
      <AttributesCard entity={entity} />
    </div>
  )
}

// ── Primitive locali ─────────────────────────────────────────────────────────

function ToggleRow({ label, checked, disabled, onToggle }: { label: string; checked: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-[14px] bg-black/[0.04] px-4 py-3">
      <span className="text-sm font-medium text-[#1d1d1f]">{label}</span>
      <div
        className={cn('lg-toggle', checked && 'on', disabled && 'pointer-events-none opacity-40')}
        onClick={onToggle}
        role="switch"
        aria-checked={checked}
      >
        <span className="lg-toggle-knob" />
      </div>
    </div>
  )
}

function SliderRow({
  label, value, min = 0, max = 100, step = 1, disabled, onCommit,
}: {
  label: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean; onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  return (
    <div className="space-y-1.5 rounded-[14px] bg-black/[0.04] px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-black/50">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-[#1d1d1f]">{Math.round(shown)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => { if (draft !== null) { onCommit(draft); setDraft(null) } }}
        onKeyUp={() => { if (draft !== null) { onCommit(draft); setDraft(null) } }}
        className="w-full accent-[#0066cc] disabled:opacity-40"
      />
    </div>
  )
}

function OptionChips({
  label, options, current, disabled, onPick,
}: {
  label: string; options: string[]; current?: string; disabled?: boolean; onPick: (option: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className="px-1 text-xs font-medium text-black/50">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onPick(option)}
            disabled={disabled}
            className={cn(
              'min-h-[40px] rounded-full px-4 text-sm font-medium transition active:scale-95 disabled:opacity-40',
              option === current ? 'bg-[#0066cc] text-white' : 'bg-black/[0.06] text-black/60',
            )}
          >
            {stateLabel(option)}
          </button>
        ))}
      </div>
    </div>
  )
}

function ActionButton({
  Icon, label, onClick, disabled, primary,
}: {
  Icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] text-sm font-semibold transition active:scale-[0.97] disabled:opacity-40',
        primary ? 'w-full bg-[#0066cc] text-white' : 'bg-black/[0.05] text-black/65',
      )}
    >
      <Icon size={16} /> {label}
    </button>
  )
}

/** Serratura: mai un toggle — sblocco con pressione prolungata 900ms (canone). */
function LockControl({
  entity, act, call, haptic, setOptimistic,
}: {
  entity: HassEntity
  act: (a: Promise<unknown>, rb?: () => void) => void
  call: (service: string) => Promise<void>
  haptic: () => void
  setOptimistic: (id: string, state: string) => void
}) {
  const locked = entity.state === 'locked'
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startHold = () => {
    if (!locked) { // bloccare è immediato
      haptic()
      setOptimistic(entity.entity_id, 'locked')
      act(call('lock'), () => setOptimistic(entity.entity_id, entity.state))
      return
    }
    setHolding(true)
    timer.current = setTimeout(() => {
      setHolding(false)
      haptic()
      setOptimistic(entity.entity_id, 'unlocked')
      act(call('unlock'), () => setOptimistic(entity.entity_id, entity.state))
    }, 900)
  }
  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      disabled={entity.state === 'unavailable'}
      className={cn(
        'relative flex w-full min-h-[56px] items-center justify-center gap-2 overflow-hidden rounded-[14px] text-base font-semibold transition disabled:opacity-40',
        locked ? 'bg-black/[0.06] text-[#1d1d1f]' : 'bg-[#0066cc] text-white',
        holding && 'scale-[0.98]',
      )}
    >
      {/* progress della pressione prolungata */}
      {holding && (
        <span
          className="absolute inset-y-0 left-0 bg-[#0066cc]/25"
          style={{ animation: 'lock-hold-fill 900ms linear forwards' }}
        />
      )}
      {locked ? <LockOpen size={18} className="relative" /> : <Lock size={18} className="relative" />}
      <span className="relative">{locked ? 'Tieni premuto per sbloccare' : 'Tocca per bloccare'}</span>
    </button>
  )
}

const NOISY_ATTRS = new Set([
  'friendly_name', 'icon', 'supported_features', 'attribution', 'entity_picture',
  'device_class', 'state_class', 'options', 'preset_modes', 'available_modes',
  'operation_list', 'hvac_modes', 'fan_modes', 'supported_color_modes', 'effect_list',
])

function AttributesCard({ entity }: { entity: HassEntity }) {
  const rows = Object.entries(entity.attributes ?? {})
    .filter(([k, v]) => !NOISY_ATTRS.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
    .slice(0, 10)

  return (
    <div className="rounded-[16px] bg-black/[0.04] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-semibold text-[#1d1d1f]">
          {stateLabel(entity.state)}
          {entity.attributes?.unit_of_measurement ? <span className="ml-1 text-base font-medium text-black/40">{String(entity.attributes.unit_of_measurement)}</span> : null}
        </p>
        <p className="shrink-0 font-mono text-[10px] text-black/30">{entity.entity_id}</p>
      </div>
      {rows.length > 0 && (
        <div className="mt-3 space-y-1">
          {rows.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-black/40">{key.replace(/_/g, ' ')}</span>
              <span className="truncate font-medium text-black/65">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
