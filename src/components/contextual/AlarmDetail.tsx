import { useMemo, useState } from 'react'
import { ShieldCheck, ShieldOff, ShieldAlert, Delete, DoorOpen } from 'lucide-react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { useEntityPlatforms } from '../../hooks/useEntityPlatforms'
import { ALARM_STATE_LABELS, alarmTone, availableArmModes, isArmed } from '../../lib/alarm'
import { cn } from '../../lib/utils'

const BYPASS_LABEL: Record<string, string> = { Never: 'Mai', Faulted: 'Se aperto', Always: 'Sempre' }

export function AlarmDetail({ entity }: { entity: HassEntity }) {
  const { call } = useHAService()
  const { light, medium } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const entities = useEntityStore((s) => s.entities)
  const platforms = useEntityPlatforms()

  const entityId = entity.entity_id
  const state = entity.state
  const armed = isArmed(state)
  const feat = Number(entity.attributes?.supported_features ?? 0)
  const codeRequired = Boolean(entity.attributes?.code_arm_required)
  const codeFormat = entity.attributes?.code_format as string | undefined // 'number' | 'text' | null
  const modes = availableArmModes(feat)
  const tone = alarmTone(state)
  const Icon = state === 'triggered' ? ShieldAlert : armed ? ShieldCheck : ShieldOff

  const [code, setCode] = useState('')
  const [bypassOpen, setBypassOpen] = useState(false)

  // Per-sensor bypass controls (Ring exposes `select.<sensor>_bypass_mode`).
  // Scope them to this alarm's integration once the registry has loaded.
  const alarmPlatform = platforms[entityId]
  const bypassSelects = useMemo(() => {
    const all = Object.values(entities).filter(
      (e) => e.entity_id.startsWith('select.') && e.entity_id.endsWith('_bypass_mode'),
    )
    const scoped = alarmPlatform
      ? all.filter((s) => !platforms[s.entity_id] || platforms[s.entity_id] === alarmPlatform)
      : all
    return scoped.sort((a, b) =>
      String(a.attributes?.friendly_name ?? a.entity_id).localeCompare(String(b.attributes?.friendly_name ?? b.entity_id)),
    )
  }, [entities, platforms, alarmPlatform])

  const binarySensors = useMemo(
    () => Object.values(entities).filter((e) => e.entity_id.startsWith('binary_sensor.')),
    [entities],
  )
  const sensorName = (s: HassEntity) =>
    String(s.attributes?.friendly_name ?? s.entity_id).replace(/\s*bypass mode$/i, '').trim()
  const isSensorOpen = (s: HassEntity) => {
    const name = sensorName(s).toLowerCase()
    return binarySensors.some(
      (b) => String(b.attributes?.friendly_name ?? '').toLowerCase() === name && b.state === 'on',
    )
  }

  const setBypass = (id: string, option: string) => {
    light()
    setOptimisticState(id, option)
    call('select', 'select_option', { entity_id: id, option })
  }

  /** Bypass currently-open contacts (Faulted = only while faulted; safe for closed ones). */
  const applyBypass = async () => {
    await Promise.all(
      bypassSelects.map((s) => {
        if (s.state !== 'Never') return Promise.resolve()
        const opts = (s.attributes?.options as string[] | undefined) ?? []
        if (!opts.includes('Faulted')) return Promise.resolve() // skip Always-only (e.g. motion)
        setOptimisticState(s.entity_id, 'Faulted')
        return call('select', 'select_option', { entity_id: s.entity_id, option: 'Faulted' })
      }),
    )
  }

  const send = async (service: string, next: string) => {
    medium()
    if (service !== 'alarm_disarm' && bypassOpen && bypassSelects.length > 0) await applyBypass()
    setOptimisticState(entityId, next)
    const data: Record<string, unknown> = { entity_id: entityId }
    if (code) data.code = code // attach whenever the user typed one (disarm needs it too)
    await call('alarm_control_panel', service, data)
    setCode('')
  }

  // `code_arm_required` only governs *arming*. Disarming a panel that uses a numeric
  // code virtually always needs the PIN, so show the keypad whenever it's armed too.
  const codeFormatNumber = codeFormat === 'number'
  const needsCodeToArm = codeRequired && codeFormatNumber
  const needsCodeToDisarm = armed && codeFormatNumber
  const needsCode = needsCodeToArm || needsCodeToDisarm

  return (
    <div className="flex flex-col gap-4">
      {/* Status hero */}
      <div className="flex flex-col items-center gap-3 rounded-[16px] py-6" style={{ background: tone.tint }}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: `${tone.color}22` }}>
          <Icon size={30} style={{ color: tone.color }} />
        </div>
        <p className="text-base font-semibold" style={{ color: tone.color }}>
          {ALARM_STATE_LABELS[state] ?? state}
        </p>
      </div>

      {/* Numeric keypad (only when a code is required) */}
      {needsCode && (
        <div className="rounded-[16px] bg-black/[0.04] p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/35">Codice</p>
          <div className="mb-3 flex h-11 items-center justify-center rounded-[10px] bg-white text-lg tracking-[0.3em] text-[#1d1d1f]">
            {code.replace(/./g, '•') || '—'}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
              k === '' ? <div key={i} /> : (
                <button
                  key={i}
                  onClick={() => setCode((c) => (k === 'del' ? c.slice(0, -1) : (c + k).slice(0, 8)))}
                  className="flex h-12 items-center justify-center rounded-[10px] bg-black/6 text-lg font-medium text-[#1d1d1f] transition active:scale-95 hover:bg-black/10"
                >
                  {k === 'del' ? <Delete size={18} /> : k}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {/* Per-sensor bypass (e.g. Ring): set an open sensor to "Se aperto" to arm anyway */}
      {bypassSelects.length > 0 && (
        <div className="rounded-[16px] bg-black/[0.04] p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/35">Bypass sensori</p>
          <div className="space-y-2.5">
            {bypassSelects.map((s) => {
              const opts = (s.attributes?.options as string[] | undefined) ?? []
              const open = isSensorOpen(s)
              return (
                <div key={s.entity_id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1d1d1f]">{sensorName(s)}</p>
                    {open && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-orange-600">
                        <DoorOpen size={12} /> Aperto ora
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 rounded-full bg-black/6 p-0.5">
                    {opts.map((o) => (
                      <button
                        key={o}
                        onClick={() => setBypass(s.entity_id, o)}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
                          s.state === o ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-black/45 hover:text-black/70',
                        )}
                      >
                        {BYPASS_LABEL[o] ?? o}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] leading-snug text-black/40">
            "Se aperto" inserisce ignorando il sensore solo se è aperto al momento. "Sempre" lo esclude del tutto.
          </p>
        </div>
      )}

      {/* Mode buttons */}
      <div className="rounded-[16px] bg-black/[0.04] p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/35">Modalità</p>

        {bypassSelects.length > 0 && (
          <button
            type="button"
            onClick={() => setBypassOpen((v) => !v)}
            className={cn(
              'mb-3 flex w-full items-center justify-between gap-3 rounded-[12px] px-3.5 py-2.5 text-left text-sm font-medium transition',
              bypassOpen ? 'bg-[#0066cc]/12 text-[#0066cc]' : 'bg-black/6 text-black/70 hover:bg-black/10',
            )}
          >
            <span>Inserisci ignorando i sensori aperti</span>
            <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', bypassOpen ? 'bg-[#0066cc]' : 'bg-black/20')}>
              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', bypassOpen ? 'left-[18px]' : 'left-0.5')} />
            </span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => send('alarm_disarm', 'disarmed')}
            disabled={needsCodeToDisarm && !code}
            className={cn(
              'col-span-2 rounded-[12px] py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40',
              !armed ? 'bg-green-500/20 text-green-700' : 'bg-black/6 text-black/70 hover:bg-black/10',
            )}
          >
            Disinserisci
          </button>
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => send(m.service, m.state)}
              disabled={needsCodeToArm && !code}
              className={cn(
                'rounded-[12px] py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40',
                state === m.state ? 'bg-orange-500/20 text-orange-700' : 'bg-black/6 text-black/70 hover:bg-black/10',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
