import {
  Battery, Blinds, Droplets, Fan, Home, Lightbulb, Lock, Music2,
  Power, Shield, Sparkles, Thermometer, Tv, UserRound, Zap,
} from 'lucide-react'
import type { ElementType } from 'react'
import { WidgetCardIcon, WidgetCardIdentity, WidgetCardShell, WidgetCardToggle } from './WidgetCardBase'
import { widgetTones } from './utils/getRingColorScale'
import type { WidgetVisualSize } from './types'

/**
 * Vetrina statica (solo desktop) dell'anatomia card a due zone: icona+controllo
 * in alto, nome+stato in basso. Copre le famiglie principali e gli stati base.
 */
const SAMPLES: {
  label: string
  Icon: ElementType
  tone: { color: string }
  active: boolean
  state: string
  stateAccent?: boolean
  value?: string
  unit?: string
  toggle?: boolean
}[] = [
  { label: 'Luce soggiorno', Icon: Lightbulb, tone: widgetTones.light, active: true, state: 'Accesa · 80%', toggle: true },
  { label: 'Luce studio', Icon: Lightbulb, tone: widgetTones.light, active: false, state: 'Spenta', toggle: true },
  { label: 'Presa lavatrice', Icon: Zap, tone: widgetTones.energy, active: true, state: 'Acceso · 480 W', toggle: true },
  { label: 'Termostato', Icon: Thermometer, tone: widgetTones.heat, active: true, state: 'Riscalda · stanza 19,8°', stateAccent: true, value: '21,5', unit: '°' },
  { label: 'Ventilatore', Icon: Fan, tone: widgetTones.cool, active: true, state: 'Acceso · 65%', toggle: true },
  { label: 'Tapparella cucina', Icon: Blinds, tone: widgetTones.cool, active: false, state: 'Chiusa' },
  { label: 'Porta ingresso', Icon: Lock, tone: widgetTones.ok, active: false, state: 'Bloccata' },
  { label: 'Allarme', Icon: Shield, tone: widgetTones.ok, active: false, state: 'Disinserito' },
  { label: 'Sensore salotto', Icon: Thermometer, tone: widgetTones.ok, active: false, state: '', value: '21,5', unit: '°' },
  { label: 'Umidità bagno', Icon: Droplets, tone: widgetTones.water, active: false, state: '', value: '58', unit: '%' },
  { label: 'Batteria UPS', Icon: Battery, tone: widgetTones.ok, active: false, state: '', value: '74', unit: '%' },
  { label: 'Davide', Icon: UserRound, tone: widgetTones.ok, active: true, state: 'In casa' },
  { label: 'TV salotto', Icon: Tv, tone: widgetTones.media, active: true, state: 'In riproduzione' },
  { label: 'Sonos cucina', Icon: Music2, tone: widgetTones.media, active: false, state: 'In pausa' },
  { label: 'Scena Serata film', Icon: Sparkles, tone: widgetTones.media, active: false, state: 'Scena' },
  { label: 'Aspirapolvere', Icon: Home, tone: widgetTones.ok, active: false, state: 'Alla base · 88%' },
  { label: 'Interruttore giardino', Icon: Power, tone: widgetTones.ok, active: false, state: 'Spento', toggle: true },
]

const sizes: WidgetVisualSize[] = ['XS', 'S', 'M', 'L', 'XL']

export function WidgetCardPreview() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-[#1d1d1f]">Preview card S/M/L</p>
        <p className="mt-0.5 text-xs text-black/40">Solo desktop: anatomia a due zone, vetro neutro, colore solo nell'icona e nello stato.</p>
      </div>

      <div className="grid gap-4">
        {SAMPLES.map((s) => (
          <div key={s.label} className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 rounded-[14px] border border-black/8 bg-black/[0.025] p-3">
            <div className="flex items-center text-xs font-bold text-black/45">{s.label}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {sizes.map((size) => (
                <WidgetCardShell
                  key={`${s.label}-${size}`}
                  title={s.label}
                  type={s.label}
                  size={size}
                  icon={s.Icon}
                  accentColor={s.tone.color}
                  isActive={s.active}
                >
                  <div className="flex items-start justify-between gap-2">
                    <WidgetCardIcon Icon={s.Icon} size={size} accentColor={s.tone.color} active={s.active} />
                    {s.toggle && <WidgetCardToggle checked={s.active} onToggle={() => {}} color={s.tone.color} />}
                  </div>
                  <WidgetCardIdentity
                    title={s.label}
                    state={s.state || undefined}
                    stateColor={s.stateAccent ? s.tone.color : undefined}
                    value={s.value}
                    unit={s.unit}
                    size={size}
                    active={s.active}
                  />
                </WidgetCardShell>
              ))}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 rounded-[14px] border border-black/8 bg-black/[0.025] p-3">
          <div className="flex items-center text-xs font-bold text-black/45">Stati</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <WidgetCardShell title="Caricamento" size="M" isLoading />
            <WidgetCardShell title="Sensore offline" size="M" isUnavailable />
            <WidgetCardShell title="Errore azione" size="M" isError />
          </div>
        </div>
      </div>
    </div>
  )
}
