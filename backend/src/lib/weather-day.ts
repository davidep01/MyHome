import tzLookup from 'tz-lookup'
/** IANA rules are evaluated at each forecast instant, including DST changes. */
export function weatherDay(timestamp: number, latitude: number, longitude: number): { date: string; dayLabel: string; timeZone: string } {
  const timeZone = tzLookup(latitude, longitude)
  const instant = new Date(timestamp * 1000)
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const part = (name: string) => parts.find((item) => item.type === name)!.value
  const label = new Intl.DateTimeFormat('it-IT', { timeZone, weekday: 'short' }).format(instant)
  return { date: `${part('year')}-${part('month')}-${part('day')}`, dayLabel: label[0].toUpperCase() + label.slice(1), timeZone }
}
