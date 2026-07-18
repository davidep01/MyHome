import { Recycle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import {
  dateKeyForLocalDate,
  isWasteCollectionCalendar,
  wasteItemsFromText,
  wastePickupDateLabel,
  wastePickups,
  type WastePickup,
} from '../../lib/wasteCollection'
import { useEntityStore } from '../../store/entities'
import { WidgetCardIcon, WidgetCardIdentity, WidgetCardShell } from './WidgetCardBase'
import type { WidgetVisualSize } from './types'

interface Props {
  entity: HassEntity
  size?: WidgetVisualSize
  className?: string
  isEditing?: boolean
  isDragging?: boolean
  onClick?: () => void
}

function useTodayKey(): string {
  const [todayKey, setTodayKey] = useState(() => dateKeyForLocalDate(new Date()))
  useEffect(() => {
    const update = () => setTodayKey(dateKeyForLocalDate(new Date()))
    const interval = window.setInterval(update, 60_000)
    return () => window.clearInterval(interval)
  }, [])
  return todayKey
}

function mergeCurrentPickup(schedule: WastePickup[], calendar: HassEntity | undefined, todayKey: string): WastePickup[] {
  if (!calendar || calendar.state !== 'on') return schedule
  const items = wasteItemsFromText(calendar.attributes.message)
  if (items.length === 0) return schedule
  const today = schedule.find((pickup) => pickup.dateKey === todayKey)
  if (!today) return [{ dateKey: todayKey, daysUntil: 0, items }, ...schedule].slice(0, 6)

  const known = new Set(today.items.map((item) => item.key))
  return schedule.map((pickup) => pickup.dateKey === todayKey
    ? { ...pickup, items: [...items.filter((item) => !known.has(item.key)), ...pickup.items] }
    : pickup)
}

export function WasteCollectionCard({
  entity,
  size = 'M',
  className,
  isEditing,
  isDragging,
  onClick,
}: Props) {
  const todayKey = useTodayKey()
  const entities = useEntityStore((state) => state.entities)
  const currentCalendar = useMemo(
    () => Object.values(entities).find((candidate) => isWasteCollectionCalendar(candidate)),
    [entities],
  )
  const pickups = useMemo(
    () => mergeCurrentPickup(wastePickups(entity.attributes, todayKey, 6), currentCalendar, todayKey),
    [currentCalendar, entity.attributes, todayKey],
  )
  const next = pickups[0]
  const accent = next?.items[0]?.color ?? '#15803d'
  const imminent = next !== undefined && next.daysUntil <= 1
  const state = next ? wastePickupDateLabel(next) : 'Nessun ritiro programmato'

  if (size === 'S') {
    return (
      <WidgetCardShell
        id={entity.entity_id}
        type="waste"
        size={size}
        title="Raccolta rifiuti"
        icon={Recycle}
        accentColor={accent}
        isActive={imminent}
        isEditing={isEditing}
        isDragging={isDragging}
        className={className}
        onClick={onClick}
      >
        <WidgetCardIcon Icon={Recycle} size={size} accentColor={accent} active={imminent} />
        <WidgetCardIdentity
          title={next?.items.map((item) => item.label).join(', ') ?? 'Raccolta rifiuti'}
          state={state}
          stateColor={accent}
          size={size}
          active={imminent}
        />
      </WidgetCardShell>
    )
  }

  return (
    <WidgetCardShell
      id={entity.entity_id}
      type="waste"
      size={size}
      title="Raccolta rifiuti"
      icon={Recycle}
      accentColor={accent}
      isActive={imminent}
      isEditing={isEditing}
      isDragging={isDragging}
      className={className}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <WidgetCardIcon Icon={Recycle} size={size} accentColor={accent} active={imminent} />
        <span
          className="rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none"
          style={{ color: accent, background: `color-mix(in srgb, ${accent} 13%, transparent)` }}
        >
          {state}
        </span>
      </div>

      <div className="mt-auto min-w-0 pt-2">
        <p className="line-clamp-1 text-[15px] font-semibold leading-snug text-[#1d1d1f]">Raccolta rifiuti</p>
        {next ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {next.items.slice(0, size === 'L' ? 4 : 3).map((item) => (
              <span
                key={item.key}
                className="max-w-full truncate rounded-md px-2 py-1 text-[12px] font-semibold leading-none"
                style={{ color: item.color, background: item.background }}
              >
                {item.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[13px] text-black/45">Controlla la configurazione del sensore</p>
        )}

        {size === 'L' && pickups.length > 1 && (
          <div className="mt-2 space-y-1 border-t border-black/[0.06] pt-2">
            {pickups.slice(1, 3).map((pickup) => (
              <div key={pickup.dateKey} className="flex min-w-0 items-center gap-2 text-[12px] leading-tight">
                <span className="w-[68px] shrink-0 font-semibold text-black/45">{wastePickupDateLabel(pickup, true)}</span>
                <span className="truncate font-medium text-black/65">{pickup.items.map((item) => item.label).join(' · ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetCardShell>
  )
}
