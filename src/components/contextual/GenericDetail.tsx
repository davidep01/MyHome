import { useEffect, useId, useRef, useState } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import {
  ChevronDown, ChevronUp, Home, Lock, LockOpen, MapPin, Maximize2, Pause, Play, Power, Square,
} from 'lucide-react'
import { callService } from '../../api/ha-websocket'
import { CameraStream } from '../widgets/CameraStream'
import { stateLabel } from '../widgets/utils/stateLabel'
import { entityName } from '../widgets/utils/mapEntityToWidgetCard'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { cn } from '../../lib/utils'
import { isSensitiveEntityAttribute } from '../../lib/entityAttributes'
import { HoldDangerAction } from '../controls/HoldDangerAction'

/**
 * Controlli universali del pannello contestuale (Q3): ogni dominio HA ha la
 * sua plancia operativa — niente più "Controlli avanzati non disponibili".
 * I domini con un detail dedicato (light/climate/media/alarm) non passano di qui.
 */
export function GenericDetail({ entity }: { entity: HassEntity }) {
  const domain = entity.entity_id.split('.')[0]
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const setFullscreenCamera = useUIStore((s) => s.setFullscreenCamera)
  const { light: hLight, medium, heavy } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const unavailable = entity.state === 'unavailable'
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  const act = (action: () => Promise<unknown>, optimistic?: () => void, rollback?: () => void) => {
    if (busyRef.current || unavailable) return
    busyRef.current = true
    setPending(true)
    setError(null)
    optimistic?.()
    void Promise.resolve()
      .then(action)
      .catch(() => {
        rollback?.()
        actionFailed()
        setError('Comando non eseguito. Riprova.')
      })
      .finally(() => {
        busyRef.current = false
        setPending(false)
      })
  }

  const call = (service: string, data?: Record<string, unknown>, serviceDomain = domain) =>
    callService(serviceDomain, service, { entity_id: entity.entity_id, ...data })

  const attrs = entity.attributes ?? {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const disabled = unavailable || pending

  const on = entity.state === 'on'
  const toggle = () => {
    const next = on ? 'off' : 'on'
    act(
      () => call(on ? 'turn_off' : 'turn_on'),
      () => { hLight(); setOptimisticState(entity.entity_id, next) },
      () => setOptimisticState(entity.entity_id, entity.state),
    )
  }

  return (
    <div className={cn('space-y-4', feedbackClass)} aria-busy={pending}>
      {/* ── Controlli per dominio ── */}
      {(domain === 'switch' || domain === 'input_boolean' || domain === 'automation' || domain === 'remote') && (
        <ToggleRow label={on ? 'Acceso' : 'Spento'} checked={on} disabled={disabled} onToggle={toggle} />
      )}

      {domain === 'siren' && (
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-black/[0.04] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#1d1d1f]">Sirena {on ? 'attiva' : 'spenta'}</p>
            <p className="mt-0.5 text-xs text-black/45">L’attivazione richiede una pressione prolungata.</p>
          </div>
          <HoldDangerAction active={on} disabled={disabled} onActivate={toggle} onDeactivate={toggle} label={entityName(entity)} />
        </div>
      )}

      {domain === 'fan' && (
        <>
          <ToggleRow label={on ? 'In funzione' : 'Spento'} checked={on} disabled={disabled} onToggle={toggle} />
          {num(attrs.percentage) !== undefined && (
            <SliderRow
              label="Velocità"
              value={num(attrs.percentage) ?? 0}
              disabled={disabled || !on}
              onCommit={(v) => {
                act(
                  () => call('set_percentage', { percentage: v }),
                  () => setOptimisticState(entity.entity_id, v > 0 ? 'on' : 'off', { percentage: v }),
                  () => setOptimisticState(entity.entity_id, entity.state, { percentage: attrs.percentage }),
                )
              }}
            />
          )}
          <OptionChips
            label="Modalità"
            options={(attrs.preset_modes as string[] | undefined) ?? []}
            current={attrs.preset_mode as string | undefined}
            disabled={disabled}
            onPick={(mode) => act(
              () => call('set_preset_mode', { preset_mode: mode }),
              () => { medium(); setOptimisticState(entity.entity_id, entity.state, { preset_mode: mode }) },
              () => setOptimisticState(entity.entity_id, entity.state, { preset_mode: attrs.preset_mode }),
            )}
          />
        </>
      )}

      {domain === 'humidifier' && (
        <>
          <ToggleRow label={on ? 'Acceso' : 'Spento'} checked={on} disabled={disabled} onToggle={toggle} />
          {num(attrs.humidity) !== undefined && (
            <SliderRow
              label={`Umidità target${num(attrs.current_humidity) !== undefined ? ` · attuale ${Math.round(num(attrs.current_humidity)!)}%` : ''}`}
              value={num(attrs.humidity) ?? 50}
              min={num(attrs.min_humidity) ?? 20}
              max={num(attrs.max_humidity) ?? 90}
              disabled={disabled || !on}
              onCommit={(v) => {
                act(
                  () => call('set_humidity', { humidity: v }),
                  () => setOptimisticState(entity.entity_id, 'on', { humidity: v }),
                  () => setOptimisticState(entity.entity_id, entity.state, { humidity: attrs.humidity }),
                )
              }}
            />
          )}
          <OptionChips
            label="Modalità"
            options={(attrs.available_modes as string[] | undefined) ?? []}
            current={attrs.mode as string | undefined}
            disabled={disabled}
            onPick={(mode) => act(
              () => call('set_mode', { mode }),
              () => { medium(); setOptimisticState(entity.entity_id, entity.state, { mode }) },
              () => setOptimisticState(entity.entity_id, entity.state, { mode: attrs.mode }),
            )}
          />
        </>
      )}

      {(domain === 'cover' || domain === 'valve') && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <ActionButton Icon={ChevronUp} label="Apri" disabled={disabled} onClick={() => act(
              () => call(domain === 'valve' ? 'open_valve' : 'open_cover'),
              () => { medium(); setOptimisticState(entity.entity_id, 'opening') },
              () => setOptimisticState(entity.entity_id, entity.state),
            )} />
            <ActionButton Icon={Square} label="Stop" disabled={disabled} onClick={() => act(
              () => call(domain === 'valve' ? 'stop_valve' : 'stop_cover'),
              medium,
            )} />
            <ActionButton Icon={ChevronDown} label="Chiudi" disabled={disabled} onClick={() => act(
              () => call(domain === 'valve' ? 'close_valve' : 'close_cover'),
              () => { medium(); setOptimisticState(entity.entity_id, 'closing') },
              () => setOptimisticState(entity.entity_id, entity.state),
            )} />
          </div>
          {num(attrs.current_position) !== undefined && (
            <SliderRow
              label="Posizione"
              value={num(attrs.current_position) ?? 0}
              disabled={disabled}
              onCommit={(v) => act(
                () => call(domain === 'valve' ? 'set_valve_position' : 'set_cover_position', { position: v }),
                () => setOptimisticState(entity.entity_id, entity.state, { current_position: v }),
                () => setOptimisticState(entity.entity_id, entity.state, { current_position: attrs.current_position }),
              )}
            />
          )}
        </>
      )}

      {domain === 'lock' && <LockControl entity={entity} act={act} call={call} haptic={heavy} setOptimistic={setOptimisticState} disabled={disabled} />}

      {(domain === 'vacuum' || domain === 'lawn_mower') && (
        <div className="grid grid-cols-3 gap-2">
          {domain === 'vacuum' ? (
            <>
              <ActionButton Icon={Play} label={entity.state === 'cleaning' ? 'In pulizia' : 'Avvia'} disabled={disabled || entity.state === 'cleaning'} onClick={() => act(
                () => call('start'),
                () => { medium(); setOptimisticState(entity.entity_id, 'cleaning') },
                () => setOptimisticState(entity.entity_id, entity.state),
              )} />
              <ActionButton Icon={Pause} label="Pausa" disabled={disabled || entity.state !== 'cleaning'} onClick={() => act(
                () => call('pause'),
                () => { medium(); setOptimisticState(entity.entity_id, 'paused') },
                () => setOptimisticState(entity.entity_id, entity.state),
              )} />
              <ActionButton Icon={Home} label="Base" disabled={disabled} onClick={() => act(
                () => call('return_to_base'),
                () => { medium(); setOptimisticState(entity.entity_id, 'returning') },
                () => setOptimisticState(entity.entity_id, entity.state),
              )} />
            </>
          ) : (
            <>
              <ActionButton Icon={Play} label={entity.state === 'mowing' ? 'In taglio' : 'Avvia'} disabled={disabled || entity.state === 'mowing'} onClick={() => act(
                () => call('start_mowing'),
                () => { medium(); setOptimisticState(entity.entity_id, 'mowing') },
                () => setOptimisticState(entity.entity_id, entity.state),
              )} />
              <ActionButton Icon={Pause} label="Pausa" disabled={disabled || entity.state !== 'mowing'} onClick={() => act(
                () => call('pause'),
                () => { medium(); setOptimisticState(entity.entity_id, 'paused') },
                () => setOptimisticState(entity.entity_id, entity.state),
              )} />
              <ActionButton Icon={Home} label="Base" disabled={disabled} onClick={() => act(
                () => call('dock'),
                () => { medium(); setOptimisticState(entity.entity_id, 'returning') },
                () => setOptimisticState(entity.entity_id, entity.state),
              )} />
            </>
          )}
          {domain === 'vacuum' && (
            <button
              type="button"
              onClick={() => act(() => call('locate'), hLight)}
              disabled={disabled}
              className="col-span-3 flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-black/[0.05] text-sm font-semibold text-black/60 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MapPin size={15} aria-hidden="true" /> Localizza
            </button>
          )}
        </div>
      )}

      {(domain === 'scene' || domain === 'script') && (
        <ActionButton
          Icon={Play}
          label={domain === 'scene' ? 'Attiva scena' : 'Esegui script'}
          primary
          disabled={disabled}
          onClick={() => act(() => call('turn_on'), medium)}
        />
      )}

      {(domain === 'button' || domain === 'input_button') && (
        <ActionButton Icon={Power} label="Premi" primary disabled={disabled} onClick={() => act(() => call('press'), medium)} />
      )}

      {(domain === 'select' || domain === 'input_select') && (
        <OptionChips
          label="Opzioni"
          options={(attrs.options as string[] | undefined) ?? []}
          current={entity.state}
          disabled={disabled}
          onPick={(option) => {
            act(
              () => call('select_option', { option }),
              () => { hLight(); setOptimisticState(entity.entity_id, option) },
              () => setOptimisticState(entity.entity_id, entity.state),
            )
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
          disabled={disabled}
          onCommit={(v) => {
            act(
              () => call('set_value', { value: v }),
              () => setOptimisticState(entity.entity_id, String(v)),
              () => setOptimisticState(entity.entity_id, entity.state),
            )
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
              disabled={disabled}
              onCommit={(v) => act(
                () => call('set_temperature', { temperature: v }),
                () => setOptimisticState(entity.entity_id, entity.state, { temperature: v }),
                () => setOptimisticState(entity.entity_id, entity.state, { temperature: attrs.temperature }),
              )}
            />
          )}
          <OptionChips
            label="Modalità"
            options={(attrs.operation_list as string[] | undefined) ?? []}
            current={entity.state}
            disabled={disabled}
            onPick={(mode) => act(
              () => call('set_operation_mode', { operation_mode: mode }),
              () => { medium(); setOptimisticState(entity.entity_id, mode) },
              () => setOptimisticState(entity.entity_id, entity.state),
            )}
          />
        </>
      )}

      {domain === 'camera' && (
        <div className="relative h-[220px] overflow-hidden rounded-[16px]">
          <CameraStream entityId={entity.entity_id} fit="cover" badge />
          <button
            type="button"
            onClick={() => {
              setSelectedEntity(null)
              setFullscreenCamera(entity.entity_id)
            }}
            className="absolute right-3 top-3 z-20 flex min-h-11 items-center gap-2 rounded-full bg-black/55 px-4 text-sm font-semibold text-white backdrop-blur transition active:scale-95"
            aria-label={`Apri ${entityName(entity)} a schermo intero`}
          >
            <Maximize2 size={17} aria-hidden="true" /> Schermo intero
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-[14px] bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {/* ── Sezione informativa, per tutti ── */}
      <AttributesCard entity={entity} />
    </div>
  )
}

// ── Primitive locali ─────────────────────────────────────────────────────────

function ToggleRow({ label, checked, disabled, onToggle }: { label: string; checked: boolean; disabled?: boolean; onToggle: () => void }) {
  const controlId = useId()
  const statusId = useId()
  return (
    <div className="flex items-center justify-between rounded-[14px] bg-black/[0.04] px-4 py-3">
      <label htmlFor={controlId} id={statusId} className="text-sm font-semibold text-[#1d1d1f]">{label}</label>
      <button
        id={controlId}
        type="button"
        className={cn(
          'lg-toggle border-0 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc]',
          checked && 'on',
        )}
        onClick={onToggle}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-label="Accensione"
        aria-describedby={statusId}
      >
        <span className="lg-toggle-knob" aria-hidden="true" />
      </button>
    </div>
  )
}

function SliderRow({
  label, value, min = 0, max = 100, step = 1, disabled, onCommit,
}: {
  label: string; value: number; min?: number; max?: number; step?: number; disabled?: boolean; onCommit: (v: number) => void
}) {
  const inputId = useId()
  const valueId = useId()
  const [draft, setDraft] = useState<number | null>(null)
  const draftRef = useRef<number | null>(null)
  const shown = draft ?? value

  const updateDraft = (next: number) => {
    draftRef.current = next
    setDraft(next)
  }

  const commitDraft = () => {
    if (draftRef.current === null) return
    const next = draftRef.current
    draftRef.current = null
    setDraft(null)
    onCommit(next)
  }

  return (
    <div className="space-y-1.5 rounded-[14px] bg-black/[0.04] px-4 py-3">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-xs font-semibold text-black/50">{label}</label>
        <output id={valueId} htmlFor={inputId} className="text-sm font-semibold tabular-nums text-[#1d1d1f]">
          {Math.round(shown)}
        </output>
      </div>
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        aria-describedby={valueId}
        onChange={(e) => updateDraft(Number(e.currentTarget.value))}
        onPointerUp={commitDraft}
        onPointerCancel={commitDraft}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
            commitDraft()
          }
        }}
        onBlur={commitDraft}
        className="w-full accent-[#0066cc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc] disabled:opacity-40"
      />
    </div>
  )
}

function OptionChips({
  label, options, current, disabled, onPick,
}: {
  label: string; options: string[]; current?: string; disabled?: boolean; onPick: (option: string) => void
}) {
  const labelId = useId()
  if (options.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p id={labelId} className="px-1 text-xs font-semibold text-black/50">{label}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            onClick={() => onPick(option)}
            disabled={disabled}
            aria-pressed={option === current}
            className={cn(
              'min-h-[44px] rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40',
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] text-sm font-semibold transition active:scale-[0.97] disabled:opacity-40',
        primary ? 'w-full bg-[#0066cc] text-white' : 'bg-black/[0.05] text-black/65',
      )}
    >
      <Icon size={16} aria-hidden="true" /> {label}
    </button>
  )
}

/** Serratura: mai un toggle — sblocco con pressione prolungata 900ms (canone). */
function LockControl({
  entity, act, call, haptic, setOptimistic, disabled,
}: {
  entity: HassEntity
  act: (a: () => Promise<unknown>, optimistic?: () => void, rollback?: () => void) => void
  call: (service: string) => Promise<void>
  haptic: () => void
  setOptimistic: (id: string, state: string) => void
  disabled?: boolean
}) {
  const locked = entity.state === 'locked'
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const instructionId = useId()

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const startHold = () => {
    if (disabled) return
    if (!locked) { // bloccare è immediato
      act(
        () => call('lock'),
        () => { haptic(); setOptimistic(entity.entity_id, 'locked') },
        () => setOptimistic(entity.entity_id, entity.state),
      )
      return
    }
    if (timer.current) return
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setHolding(false)
      act(
        () => call('unlock'),
        () => { haptic(); setOptimistic(entity.entity_id, 'unlocked') },
        () => setOptimistic(entity.entity_id, entity.state),
      )
    }, 900)
  }
  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  return (
    <button
      type="button"
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onKeyDown={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        if (!event.repeat) startHold()
      }}
      onKeyUp={(event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        cancelHold()
      }}
      onBlur={cancelHold}
      disabled={disabled || entity.state === 'unavailable'}
      aria-describedby={instructionId}
      aria-busy={holding}
      className={cn(
        'relative flex w-full min-h-[56px] items-center justify-center gap-2 overflow-hidden rounded-[14px] text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0066cc] disabled:cursor-not-allowed disabled:opacity-40',
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
      {locked ? <LockOpen size={18} className="relative" aria-hidden="true" /> : <Lock size={18} className="relative" aria-hidden="true" />}
      <span className="relative">
        {locked ? 'Tieni premuto per sbloccare' : 'Tocca per bloccare'}
      </span>
      <span id={instructionId} className="sr-only">
        {locked ? 'Con la tastiera, tieni premuto Spazio o Invio per 900 millisecondi.' : 'Premi Spazio o Invio per bloccare.'}
      </span>
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
    .filter(([k, v]) => !NOISY_ATTRS.has(k) && !isSensitiveEntityAttribute(k)
      && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
    .slice(0, 10)

  return (
    <div className="rounded-[16px] bg-black/[0.04] p-4">
      <p className="text-2xl font-semibold text-[#1d1d1f]">
        {entity.entity_id.startsWith('camera.') && entity.state !== 'unavailable'
          ? 'Disponibile'
          : stateLabel(entity.state)}
        {entity.attributes?.unit_of_measurement ? <span className="ml-1 text-base font-semibold text-black/40">{String(entity.attributes.unit_of_measurement)}</span> : null}
      </p>
      {rows.length > 0 && (
        <div className="mt-3 space-y-1">
          {rows.map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-black/40">{key.replace(/_/g, ' ')}</span>
              <span className="truncate font-semibold text-black/65">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
