import { BottleWine, CupSoda, Leaf, Newspaper, Recycle, Trash2, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import {
  dateKeyForLocalDate,
  isWasteCollectionCalendar,
  wasteItemsFromText,
  wastePickups,
  type WasteKind,
  type WastePickup,
  type WasteIconKey,
} from '../../lib/wasteCollection'
import { useEntityStore } from '../../store/entities'
import { WidgetCardIcon, WidgetCardShell } from './WidgetCardBase'
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

const WASTE_ICONS: Record<WasteIconKey, LucideIcon> = {
  general: Trash2,
  plastic: CupSoda,
  glass: BottleWine,
  paper: Newspaper,
  organic: Leaf,
  garden: Leaf,
  other: Recycle,
}

function WasteKindBadge({ item, compact = false }: { item: WasteKind; compact?: boolean }) {
  const Icon = WASTE_ICONS[item.icon]
  return (
    <span
      className="flex min-w-0 items-center gap-1 rounded-md font-semibold leading-none shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.16)]"
      style={{
        color: item.color,
        background: item.background,
        padding: compact ? '3px 5px' : '5px 7px',
      }}
      title={item.label}
    >
      <Icon size={compact ? 12 : 14} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
      <span className="truncate text-[11px]">{item.label}</span>
    </span>
  )
}

function WasteDayRow({ pickup, label, compact = false }: {
  pickup: WastePickup | undefined
  label: 'Oggi' | 'Domani'
  compact?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-[48px] shrink-0 text-[11px] font-semibold text-black/50">{label}</span>
      {pickup ? (
        <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          {pickup.items.slice(0, compact ? 1 : 3).map((item) => (
            <WasteKindBadge key={item.key} item={item} compact={compact} />
          ))}
        </div>
      ) : (
        <span className="truncate text-[11px] font-medium text-black/35">Nessun ritiro</span>
      )}
    </div>
  )
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
  const today = pickups.find((pickup) => pickup.daysUntil === 0)
  const tomorrow = pickups.find((pickup) => pickup.daysUntil === 1)
  const next = today ?? tomorrow
  // Carta e plastica mantengono il colore richiesto nel badge; per il glifo
  // usiamo la loro variante più scura, leggibile sul vetro chiaro della card.
  const tint = next?.items[0]?.key === 'paper'
    ? '#8e8e93'
    : next?.items[0]?.key === 'plastic'
      ? '#9a6d00'
      : (next?.items[0]?.background ?? '#248a3d')
  const imminent = next !== undefined

  if (size === 'S') {
    return (
      <WidgetCardShell
        id={entity.entity_id}
        type="waste"
        size={size}
        title="Raccolta rifiuti"
        icon={Recycle}
        accentColor={tint}
        isActive={imminent}
        isEditing={isEditing}
        isDragging={isDragging}
        className={className}
        onClick={onClick}
      >
        <div className="flex items-center gap-2">
          <WidgetCardIcon Icon={Recycle} size={size} accentColor={tint} active={imminent} />
          <p className="truncate text-[13px] font-semibold text-[#1d1d1f]">Rifiuti</p>
        </div>
        <div className="mt-auto space-y-1">
          <WasteDayRow pickup={today} label="Oggi" compact />
          <WasteDayRow pickup={tomorrow} label="Domani" compact />
        </div>
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
      accentColor={tint}
      isActive={imminent}
      isEditing={isEditing}
      isDragging={isDragging}
      className={className}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <WidgetCardIcon Icon={Recycle} size={size} accentColor={tint} active={imminent} />
        <p className="line-clamp-1 pt-1 text-[15px] font-semibold leading-snug text-[#1d1d1f]">Raccolta rifiuti</p>
      </div>

      <div className="mt-auto min-w-0 space-y-1.5 pt-2">
        <WasteDayRow pickup={today} label="Oggi" />
        <WasteDayRow pickup={tomorrow} label="Domani" />
        {size === 'L' && pickups.filter((pickup) => pickup.daysUntil > 1).slice(0, 2).map((pickup) => (
          <div key={pickup.dateKey} className="flex items-center gap-2 border-t border-black/[0.05] pt-1.5">
            <span className="w-[48px] shrink-0 text-[11px] font-semibold text-black/40">Tra {pickup.daysUntil}g</span>
            <div className="flex min-w-0 gap-1 overflow-hidden">
              {pickup.items.slice(0, 3).map((item) => <WasteKindBadge key={item.key} item={item} compact />)}
            </div>
          </div>
        ))}
      </div>
    </WidgetCardShell>
  )
}
