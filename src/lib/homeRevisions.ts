import type { HomeRevisionSummary } from '../api/backend'

/** Traduce il riepilogo di una revisione in una riga leggibile, es. "+2 widget · 1 spostato". */
export function summaryLabel(summary: HomeRevisionSummary): string {
  const parts: string[] = []
  if (summary.widgetsAdded > 0) parts.push(`+${summary.widgetsAdded} widget`)
  if (summary.widgetsRemoved > 0) parts.push(`-${summary.widgetsRemoved} widget`)
  if (summary.widgetsMoved > 0) parts.push(`${summary.widgetsMoved} spostat${summary.widgetsMoved === 1 ? 'o' : 'i'}`)
  if (summary.widgetsResized > 0) parts.push(`${summary.widgetsResized} ridimensionat${summary.widgetsResized === 1 ? 'o' : 'i'}`)
  if (summary.reordered) parts.push('riordinati')
  return parts.length > 0 ? parts.join(' · ') : 'Nessuna modifica'
}
