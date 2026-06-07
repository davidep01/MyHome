import {
  Activity, Battery, Bell, Blinds, CalendarDays, Camera, CloudSun,
  Droplets, Fan, Gauge, Home, Lightbulb, ListChecks, Lock, Music2, PlugZap,
  Power, Radio, Shield, Sparkles, Thermometer, Timer, ToggleRight, Tv, UserRound,
  Waves, Wifi, Wind, Zap,
} from 'lucide-react'
import { WidgetCardBadge, WidgetCardHeader, WidgetCardRing, WidgetCardShell, WidgetCardValue } from './WidgetCardBase'
import { widgetTones } from './utils/getRingColorScale'
import type { WidgetVisualSize } from './types'

const families = [
  ['Light', Lightbulb, widgetTones.light, 82],
  ['Switch', Power, widgetTones.ok, 100],
  ['SmartPlug', PlugZap, widgetTones.energy, 44],
  ['Climate', Thermometer, widgetTones.heat, 23],
  ['Thermostat', Gauge, widgetTones.cool, 21],
  ['Fan', Fan, widgetTones.cool, 65],
  ['Cover', Blinds, widgetTones.energy, 48],
  ['Curtain', Blinds, widgetTones.energy, 64],
  ['Gate', Home, widgetTones.warning, 100],
  ['Garage', Home, widgetTones.warning, 100],
  ['Lock', Lock, widgetTones.ok, 100],
  ['Alarm', Shield, widgetTones.critical, 100],
  ['Motion', Activity, widgetTones.cool, 100],
  ['Presence', UserRound, widgetTones.ok, 100],
  ['DoorWindow', Home, widgetTones.warning, 100],
  ['Temperature', Thermometer, widgetTones.cool, 22],
  ['Humidity', Droplets, widgetTones.water, 58],
  ['AirQuality', Wind, widgetTones.ok, 42],
  ['SmokeGasCO', Shield, widgetTones.critical, 100],
  ['WaterLeak', Waves, widgetTones.water, 100],
  ['Battery', Battery, widgetTones.ok, 74],
  ['Weather', CloudSun, widgetTones.light, 24],
  ['Calendar', CalendarDays, widgetTones.media, 1],
  ['News', ListChecks, widgetTones.neutral, 3],
  ['Camera', Camera, widgetTones.cool, 100],
  ['Doorbell', Bell, widgetTones.cool, 100],
  ['Energy', Zap, widgetTones.energy, 52],
  ['Solar', Zap, widgetTones.light, 76],
  ['Water', Droplets, widgetTones.water, 34],
  ['Irrigation', Waves, widgetTones.water, 66],
  ['Pool', Waves, widgetTones.water, 27],
  ['Vacuum', Gauge, widgetTones.ok, 88],
  ['MediaPlayer', Music2, widgetTones.media, 72],
  ['Speaker', Radio, widgetTones.media, 44],
  ['TV', Tv, widgetTones.media, 100],
  ['Scene', Sparkles, widgetTones.media, 100],
  ['Automation', ListChecks, widgetTones.ok, 100],
  ['Script', Sparkles, widgetTones.media, 100],
  ['Timer', Timer, widgetTones.warning, 35],
  ['Reminder', CalendarDays, widgetTones.warning, 1],
  ['NetworkStatus', Wifi, widgetTones.cool, 100],
  ['SystemStatus', Activity, widgetTones.ok, 100],
  ['RoomSummary', Home, widgetTones.ok, 4],
  ['GenericEntity', ToggleRight, widgetTones.neutral, 50],
] as const

const sizes: WidgetVisualSize[] = ['S', 'M', 'L']

export function WidgetCardPreview() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-[#1d1d1f]">Preview card S/M/L</p>
        <p className="mt-0.5 text-xs text-black/40">Solo desktop: copertura visiva delle famiglie widget e degli stati base.</p>
      </div>

      <div className="grid gap-4">
        {families.map(([label, Icon, tone, value]) => (
          <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-[14px] border border-black/8 bg-black/[0.025] p-3">
            <div className="flex items-center text-xs font-bold text-black/45">{label}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {sizes.map((size) => (
                <WidgetCardShell
                  key={`${label}-${size}`}
                  title={label}
                  type={label}
                  size={size}
                  icon={Icon}
                  accentColor={tone.color}
                  gradient={tone.gradient}
                  isActive={value > 0}
                  animationPreset={label === 'Fan' ? 'fanSpin' : label === 'Energy' || label === 'Solar' ? 'energyFlow' : value > 90 ? 'pulse' : 'softGlow'}
                >
                  <WidgetCardHeader title={label} subtitle={size === 'S' ? undefined : 'Stato preview'} Icon={Icon} accentColor={tone.color} size={size} trailing={<WidgetCardBadge tone={value > 90 ? 'ok' : 'neutral'}>{size}</WidgetCardBadge>} />
                  <div className="mt-3 flex flex-1 items-center gap-3">
                    {size !== 'S' && <WidgetCardRing value={Math.min(value, 100)} size={size} color={tone.color} />}
                    <WidgetCardValue value={value} unit={label.includes('Temperature') || label.includes('Climate') ? 'C' : value > 10 ? '%' : undefined} secondary={size === 'L' ? 'active / loading / error / unavailable / edit' : 'active'} size={size} accentColor={tone.color} />
                  </div>
                </WidgetCardShell>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <WidgetCardShell title="Loading" size="M" isLoading />
        <WidgetCardShell title="Error" size="M" isError />
        <WidgetCardShell title="Unavailable" size="M" isUnavailable />
        <WidgetCardShell title="Edit mode" size="M" icon={Sparkles} isEditing accentColor={widgetTones.cool.color}>
          <WidgetCardHeader title="Edit mode" subtitle="Drag only" Icon={Sparkles} accentColor={widgetTones.cool.color} size="M" />
        </WidgetCardShell>
      </div>
    </div>
  )
}
