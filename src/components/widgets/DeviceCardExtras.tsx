import { SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { fanControls, humidityModes } from '../../lib/airControls'
import { supportsCardFeature, cardOptions } from '../../lib/cardCapabilities'
import { controlRange, snapControlValue } from '../../lib/controlRange'
import { WidgetCardSlider } from './WidgetCardBase'
import { useHistory } from '../../hooks/useHistory'
import { numericState } from './utils/formatWidgetValue'
import { stateLabel } from './utils/stateLabel'

export type CardCommand = (service: string, data?: Record<string, unknown>, attributes?: Record<string, unknown>, state?: string) => void

/** Expanded card controls share the factory's pending/optimistic/rollback path. */
export function DeviceCardExtras({ entity, disabled, command }: { entity: HassEntity; disabled: boolean; command: CardCommand }) {
  const domain = entity.entity_id.split('.')[0]
  const a = entity.attributes
  const supports = (flag: number, fallback = false) => supportsCardFeature(a, flag, fallback)
  const select = (label: string, options: string[], value: unknown, service: string, key: string, state = false) => options.length > 0 && <label key={key}>{label}<select disabled={disabled} aria-label={label} value={typeof value === 'string' && options.includes(value) ? value : ''} onChange={e => command(service, {[key]:e.target.value}, state ? undefined : {[key]:e.target.value}, state ? e.target.value : undefined)}>
    <option value="" disabled>Seleziona</option>{options.map(v => <option value={v} key={v}>{stateLabel(v)}</option>)}
  </select></label>
  const range = (label: string, value: unknown, min: number, max: number, step: number, service: string, serviceKey: string, attributeKey = serviceKey, scale = 1) => {
    const n = numericState(value)
    if (n === undefined) return null
    const bounds = controlRange(min, max, step)
    return <div className="space-y-1"><p className="text-[13px] text-[var(--ink-secondary)]">{label} · {Math.round(n * scale * 100) / 100}</p><WidgetCardSlider {...bounds} label={label} value={n * scale} disabled={disabled} onCommit={v => command(service, {[serviceKey]:v / scale}, {[attributeKey]:v / scale}, domain === 'light' && service === 'turn_on' ? 'on' : domain === 'cover' ? (v > n ? 'opening' : 'closing') : undefined)} /></div>
  }
  let controls
  if (domain === 'fan') {
    const f = fanControls(a)
    controls = <>{f.presets && select('Modalità', f.modes, a.preset_mode, 'set_preset_mode', 'preset_mode')}
      {f.oscillation && <button disabled={disabled} type="button" aria-pressed={a.oscillating === true} onClick={() => command('oscillate', {oscillating:a.oscillating !== true}, {oscillating:a.oscillating !== true})}>Oscillazione {a.oscillating ? 'attiva' : 'spenta'}</button>}
      {f.direction && select('Direzione', ['forward','reverse'], a.direction, 'set_direction', 'direction')}</>
  } else if (domain === 'humidifier') controls = select('Modalità', humidityModes(a), a.mode, 'set_mode', 'mode')
  else if (domain === 'cover') controls = supports(4, typeof a.current_position === 'number') && range('Apertura %', a.current_position, 0, 100, 1, 'set_cover_position', 'position', 'current_position')
  else if (domain === 'light') {
    const kelvin = numericState(a.color_temp_kelvin)
    const min = numericState(a.min_color_temp_kelvin), max = numericState(a.max_color_temp_kelvin)
    const legacy = numericState(a.color_temp), minMired = numericState(a.min_mireds), maxMired = numericState(a.max_mireds)
    controls = cardOptions(a.supported_color_modes).includes('color_temp') && (kelvin !== undefined && min !== undefined && max !== undefined
      ? range('Temperatura colore K',kelvin,min,max,50,'turn_on','color_temp_kelvin')
      : legacy !== undefined && minMired !== undefined && maxMired !== undefined ? range('Temperatura colore mired',legacy,minMired,maxMired,1,'turn_on','color_temp') : null)
  } else if (domain === 'media_player') controls = <>
    <div className="flex flex-wrap justify-end gap-2">
      {supports(16) && <button disabled={disabled} type="button" aria-label="Traccia precedente" onClick={() => command('media_previous_track')}><SkipBack size={18} aria-hidden="true" /></button>}
      {supports(32) && <button disabled={disabled} type="button" aria-label="Traccia successiva" onClick={() => command('media_next_track')}><SkipForward size={18} aria-hidden="true" /></button>}
      {supports(8, typeof a.is_volume_muted === 'boolean') && <button disabled={disabled} type="button" aria-label={a.is_volume_muted ? 'Riattiva audio' : 'Silenzia audio'} aria-pressed={a.is_volume_muted === true} onClick={() => command('volume_mute',{is_volume_muted:a.is_volume_muted !== true},{is_volume_muted:a.is_volume_muted !== true})}>{a.is_volume_muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}</button>}
    </div>
    {supports(4, typeof a.volume_level === 'number') && range('Volume %', a.volume_level,0,100,1,'volume_set','volume_level','volume_level',100)}
    {supports(2048,cardOptions(a.source_list).length > 0) && select('Sorgente',cardOptions(a.source_list),a.source,'select_source','source')}
  </>
  else if (domain === 'vacuum') controls = <div className="flex flex-wrap gap-2">
    {supports(4) && entity.state === 'cleaning' && <button disabled={disabled} type="button" onClick={() => command('pause',undefined,undefined,'paused')}>Pausa</button>}
    {supports(8) && <button disabled={disabled} type="button" onClick={() => command('stop',undefined,undefined,'idle')}>Ferma</button>}
    {supports(512) && <button disabled={disabled} type="button" onClick={() => command('locate')}>Trova robot</button>}
  </div>
  else if (domain === 'timer') controls = <button type="button" disabled={disabled || entity.state === 'idle'} onClick={() => command('cancel',undefined,undefined,'idle')}>Annulla timer</button>
  else if (domain === 'water_heater') controls = select('Modalità',cardOptions(a.operation_list),a.operation_mode,'set_operation_mode','operation_mode')
  else if (domain === 'select' || domain === 'input_select') controls = select('Opzione',cardOptions(a.options),entity.state,'select_option','option',true)
  else if (domain === 'number' || domain === 'input_number') {
    const bounds = controlRange(numericState(a.min) ?? 0,numericState(a.max) ?? 100,numericState(a.step) ?? 1)
    const value = numericState(entity.state)
    controls = value !== undefined && <WidgetCardSlider {...bounds} value={value} label="Valore" disabled={disabled} onCommit={v => command('set_value',{value:snapControlValue(v,bounds.min,bounds.max,bounds.step)},undefined,String(v))} />
  }
  const battery = numericState(a.battery_level)
  return <div className="simi-card-extras space-y-2" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
    {controls}
    {battery !== undefined && <p className="text-[13px] text-[var(--ink-secondary)]">Batteria {battery}%</p>}
    {domain === 'sensor' && <SensorHistory entity={entity} />}
    {!controls && domain !== 'sensor' && <p className="text-[13px] text-[var(--ink-secondary)]">Ultimo aggiornamento {new Date(entity.last_updated).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} · dettagli con un tocco sulla card</p>}
  </div>
}

function SensorHistory({entity}: {entity:HassEntity}) {
  const numeric = numericState(entity.state) !== undefined
  const history = useHistory(numeric ? entity.entity_id : undefined,24)
  const points = (history.data ?? []).map(p => ({t:Date.parse(p.last_changed), v:numericState(p.state)})).filter(p => Number.isFinite(p.t))
  const values = points.flatMap(p => p.v === undefined ? [] : [p.v])
  if (!numeric) return <p className="text-[13px] text-[var(--ink-secondary)]">Stato aggiornato da Home Assistant</p>
  if (history.isPending) return <p role="status" className="text-sm text-[var(--ink-secondary)]">Caricamento storico…</p>
  if (history.isError) return <button type="button" onClick={() => void history.refetch()}>Riprova storico</button>
  if (values.length < 2) return <p className="text-sm text-[var(--ink-secondary)]">Storico non disponibile</p>
  const lo = values.reduce((a,b)=>Math.min(a,b),Infinity), hi = values.reduce((a,b)=>Math.max(a,b),-Infinity), start = points.reduce((a,p)=>Math.min(a,p.t),Infinity), end = points.reduce((a,p)=>Math.max(a,p.t),-Infinity)
  let path = '', gap = true
  points.forEach(p => { if (p.v === undefined) {gap=true;return} const x = 100*(p.t-start)/Math.max(1,end-start), y = 36-30*(p.v-lo)/Math.max(1,hi-lo); path+=`${gap?'M':'L'}${x.toFixed(2)},${y.toFixed(2)} `; gap=false })
  return <div><svg viewBox="0 0 100 40" className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label={`Storico 24 ore: minimo ${lo}, massimo ${hi} ${entity.attributes.unit_of_measurement ?? ''}`}><path d={path} fill="none" stroke="var(--action-blue)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg><p className="text-[13px] text-[var(--ink-secondary)]">24 ore · min {lo} · max {hi} {entity.attributes.unit_of_measurement}</p></div>
}
