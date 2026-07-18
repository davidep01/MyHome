export interface WasteEntityLike {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
}

export interface WasteKind {
  key: string
  label: string
  color: string
  background: string
}

export interface WastePickup {
  dateKey: string
  daysUntil: number
  items: WasteKind[]
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1_000

const WASTE_KINDS: Array<{ match: RegExp; kind: WasteKind }> = [
  { match: /general waste(?: collection)?|indifferenziat/i, kind: { key: 'general', label: 'Indifferenziato', color: '#475569', background: 'rgba(100,116,139,0.15)' } },
  { match: /grass clippings|sfalci|potature/i, kind: { key: 'garden', label: 'Sfalci e potature', color: '#15803d', background: 'rgba(34,197,94,0.14)' } },
  { match: /organic waste|organico/i, kind: { key: 'organic', label: 'Organico', color: '#65a30d', background: 'rgba(132,204,22,0.15)' } },
  { match: /napkins|pannolin/i, kind: { key: 'napkins', label: 'Pannolini', color: '#7c3aed', background: 'rgba(124,58,237,0.13)' } },
  { match: /plastic.*metal|plastica.*metall/i, kind: { key: 'plastic', label: 'Plastica e metalli', color: '#b45309', background: 'rgba(245,158,11,0.15)' } },
  { match: /glass|vetro/i, kind: { key: 'glass', label: 'Vetro', color: '#0891b2', background: 'rgba(8,145,178,0.14)' } },
  { match: /paper.*cardboard|carta.*cartone/i, kind: { key: 'paper', label: 'Carta e cartone', color: '#0066cc', background: 'rgba(0,102,204,0.13)' } },
]

function titleCase(value: string): string {
  return value ? value[0].toLocaleUpperCase('it') + value.slice(1) : ''
}

function dateOrdinal(dateKey: string): number | null {
  if (!DATE_KEY.test(dateKey)) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  const value = Date.UTC(year, month - 1, day)
  return Number.isFinite(value) ? value : null
}

export function dateKeyForLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysBetweenDateKeys(todayKey: string, dateKey: string): number | null {
  const today = dateOrdinal(todayKey)
  const date = dateOrdinal(dateKey)
  return today === null || date === null ? null : Math.round((date - today) / DAY_MS)
}

export function wasteItemsFromText(value: unknown): WasteKind[] {
  if (typeof value !== 'string') return []
  const seen = new Set<string>()
  return value.split(',').flatMap((part): WasteKind[] => {
    const raw = part.trim()
    if (!raw) return []
    const known = WASTE_KINDS.find(({ match }) => match.test(raw))?.kind
    const kind = known ?? {
      key: raw.toLocaleLowerCase('it').replace(/[^a-z0-9]+/gi, '-'),
      label: titleCase(raw),
      color: '#475569',
      background: 'rgba(100,116,139,0.13)',
    }
    if (seen.has(kind.key)) return []
    seen.add(kind.key)
    return [kind]
  })
}

export function wastePickups(
  attributes: Record<string, unknown> | undefined,
  todayKey: string,
  limit = 6,
): WastePickup[] {
  if (!attributes) return []
  return Object.entries(attributes)
    .flatMap(([dateKey, value]): WastePickup[] => {
      const daysUntil = daysBetweenDateKeys(todayKey, dateKey)
      const items = wasteItemsFromText(value)
      return daysUntil === null || daysUntil < 0 || items.length === 0 ? [] : [{ dateKey, daysUntil, items }]
    })
    .sort((left, right) => left.daysUntil - right.daysUntil)
    .slice(0, Math.max(1, limit))
}

export function isWasteCollectionSensor(entity: WasteEntityLike | undefined): boolean {
  if (!entity || !entity.entity_id.startsWith('sensor.')) return false
  const friendlyName = String(entity.attributes?.friendly_name ?? '')
  const named = /waste_collection_schedule|raccolta.*rifiut|rifiut/i.test(`${entity.entity_id} ${friendlyName}`)
  return named && Object.keys(entity.attributes ?? {}).some((key) => DATE_KEY.test(key))
}

export function isWasteCollectionCalendar(entity: WasteEntityLike | undefined): boolean {
  if (!entity || !entity.entity_id.startsWith('calendar.')) return false
  const friendlyName = String(entity.attributes?.friendly_name ?? '')
  return /waste_collection_schedule|raccolta.*rifiut|rifiut/i.test(`${entity.entity_id} ${friendlyName}`)
}

export function wastePickupDateLabel(pickup: WastePickup, compact = false): string {
  if (pickup.daysUntil === 0) return 'Oggi'
  if (pickup.daysUntil === 1) return 'Domani'
  if (pickup.daysUntil === 2 && !compact) return 'Tra 2 giorni'
  const [year, month, day] = pickup.dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}
