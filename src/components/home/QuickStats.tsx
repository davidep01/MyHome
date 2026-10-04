import { useState } from 'react'
import { performGroupAction } from '../../lib/entityActions'
import { useEntityStore } from '../../store/entities'
import { Lightbulb, Thermometer, Blinds, Power } from 'lucide-react'
import { useHomeSummary } from '../../hooks/useHomeSummary'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { TEMP_UNIT } from '../../lib/units'
import { CountUp } from '../anim/CountUp'
import { LiveDot } from '../anim/LiveDot'
import type { WidgetSize } from '../../api/backend'

/**
 * Glanceable live summary of the house with one-tap actions — the kind of thing
 * you read across the room from a wall tablet. Only shows chips that are relevant.
 */
export function QuickStats({ size }: { size: WidgetSize }) {
  const { lightsOn, lightIds, climateActive, coversOpen, avgIndoorTemp } = useHomeSummary()
  const { call } = useHAService()
  const { medium } = useHaptic()

  const [pending,setPending] = useState(false)
  const [error,setError] = useState(false)
  const allLightsOff = () => {
    if (pending) return
    const store=useEntityStore.getState()
    const ids=lightIds.filter(id=>store.entities[id]?.state==='on')
    if (!ids.length) return
    const originals=new Map(ids.map(id=>[id,store.entities[id]]))
    setPending(true);setError(false)
    void performGroupAction(ids,()=>{medium();ids.forEach(id=>store.setOptimisticState(id,'off'))},()=>call('light','turn_off',{entity_id:ids}),id=>{const e=originals.get(id);if(e)store.setOptimisticState(id,e.state,e.attributes)})
      .catch(()=>setError(true)).finally(()=>setPending(false))
  }

  const hasAny = lightsOn > 0 || climateActive > 0 || coversOpen > 0 || avgIndoorTemp !== null
  if (!hasAny && !pending && !error) {
    return (
      <div className="flex items-center gap-3 text-[var(--ink-secondary)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-700"><Power size={18} /></span>
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Casa tranquilla</p>
          <p className="text-xs">Nessuna attività da segnalare</p>
        </div>
      </div>
    )
  }
  const compact = size === 'xs' || size === 'sm'
  const expanded = size === 'lg' || size === 'wide'

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {pending && <p role="status" className="text-sm text-[var(--ink-secondary)]">Spegnimento luci…</p>}
      {error && <p role="alert" className="text-sm text-[var(--danger-red)]">Comando non eseguito · riprova</p>}
      {/* Lights — tap to turn everything off */}
      {lightsOn > 0 && (
        <button
          disabled={pending}
          aria-label="Spegni tutte le luci accese"
          onClick={allLightsOff}
          className="press-card flex min-h-[44px] items-center gap-2 rounded-full bg-[rgba(234,179,8,0.16)] py-2.5 pl-3.5 pr-3 text-[15px] font-semibold text-[var(--ink)] active:scale-95"
        >
          <Lightbulb size={17} className="amb-float fill-[#eab308]/30" />
          <CountUp value={lightsOn} className="tabular-nums" />
          {!compact && <span className="text-[var(--ink-secondary)]">{lightsOn === 1 ? 'luce accesa' : 'luci accese'}</span>}
          {expanded && <span className="ml-1 flex items-center gap-1 rounded-full bg-[var(--fill-subtle)] px-2 py-0.5 text-xs text-[var(--ink)]">
            <Power size={11} /> Spegni
          </span>}
        </button>
      )}

      {avgIndoorTemp !== null && (!compact || lightsOn === 0) && (
        <div className="flex items-center gap-2 rounded-full bg-[var(--fill-subtle)] py-2.5 px-3.5 text-[15px] font-semibold text-[var(--ink)]">
          <Thermometer size={17} className="text-[var(--action-blue)]" />
          <CountUp value={avgIndoorTemp} decimals={1} suffix={TEMP_UNIT} className="tabular-nums" />
          {!compact && <span className="text-[var(--ink-secondary)]">in casa</span>}
        </div>
      )}

      {climateActive > 0 && (expanded || (lightsOn === 0 && avgIndoorTemp === null)) && (
        <div className="flex items-center gap-2 rounded-full bg-[rgba(220,38,38,0.10)] py-2.5 px-3.5 text-[15px] font-semibold text-[var(--danger-red)]">
          <LiveDot color="#dc2626" size={8} />
          <CountUp value={climateActive} className="tabular-nums" />
          <span className="text-[var(--ink-secondary)]">clima attivo</span>
        </div>
      )}

      {coversOpen > 0 && expanded && (
        <div className="flex items-center gap-2 rounded-full bg-[var(--fill-subtle)] py-2.5 px-3.5 text-[15px] font-semibold text-[var(--ink)]">
          <Blinds size={17} className="text-[var(--action-blue)]" />
          <CountUp value={coversOpen} className="tabular-nums" />
          <span className="text-[var(--ink-secondary)]">{coversOpen === 1 ? 'aperta' : 'aperte'}</span>
        </div>
      )}
    </div>
  )
}
