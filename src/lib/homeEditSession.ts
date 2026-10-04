import { validStack } from './cardStack'
import type { HomeWidget } from '../api/backend'
import { buildLayout, positionsFromLayout } from './homeLayout'
import type { Layout } from 'react-grid-layout/legacy'

export interface HomeEditDraft { widgets: HomeWidget[]; layout: Layout; baseVersion: number }
export interface HomeEditHistory { present: HomeEditDraft; past: HomeEditDraft[]; future: HomeEditDraft[] }
const LIMIT = 40
// Structural snapshots do not require structuredClone support from Android WebView.
function snapshot(draft: HomeEditDraft): HomeEditDraft {
  return { widgets: draft.widgets.map(widget => ({ ...widget, ...(widget.entityIds ? {entityIds:[...widget.entityIds]} : {}) })), layout: draft.layout.map(item => ({ ...item })), baseVersion: draft.baseVersion }
}
export function editHistory(draft: HomeEditDraft): HomeEditHistory {
  return { present: snapshot(draft), past: [], future: [] }
}
export function changeEdit(history: HomeEditHistory, draft: HomeEditDraft): HomeEditHistory {
  if (JSON.stringify(history.present) === JSON.stringify(draft)) return history
  return { present: snapshot(draft), past: [...history.past, history.present].slice(-LIMIT), future: [] }
}
export function stepEdit(history: HomeEditHistory, direction: 'undo' | 'redo'): HomeEditHistory {
  const source = direction === 'undo' ? history.past : history.future
  const next = source.at(-1)
  if (!next) return history
  return direction === 'undo'
    ? { present: next, past: history.past.slice(0, -1), future: [...history.future, history.present] }
    : { present: next, past: [...history.past, history.present].slice(-LIMIT), future: history.future.slice(0, -1) }
}
const TYPES = new Set(['clock','weather','quickStats','scenes','status','entity','group','sensor','camera','people','security','system','insight','news','calendar','stack'])
const SIZES = new Set(['xs','sm','md','lg','wide'])
/** Only structural bindings are persisted: never attributes, HA credentials or media URLs. */
export function encodeEdit(draft: HomeEditDraft, now = Date.now()): string {
  const widgets = draft.widgets.map(({ id, type, size, entityId, groupId, label, entityIds }) => ({ id, type, size, entityId, groupId, label, entityIds }))
  return JSON.stringify({ version: 1, savedAt: now, baseVersion: draft.baseVersion, widgets, positions: positionsFromLayout(draft.layout) })
}
export function decodeEdit(raw: string | null, now = Date.now()): HomeEditDraft | null {
  try {
    if (!raw || raw.length > 100_000) return null
    const d = JSON.parse(raw)
    if (d.version !== 1 || !Number.isSafeInteger(d.savedAt) || d.savedAt > now || now-d.savedAt > 86_400_000 || !Number.isSafeInteger(d.baseVersion) || d.baseVersion < 0 || !Array.isArray(d.widgets) || d.widgets.length > 60) return null
    const ids = new Set<string>()
    const widgets: HomeWidget[] = []
    for (const w of d.widgets) {
      if (!w || typeof w.id !== 'string' || !/^[\w.-]{1,120}$/.test(w.id) || ids.has(w.id) || ['__proto__','prototype','constructor'].includes(w.id) || !TYPES.has(w.type) || !SIZES.has(w.size)) return null
      if (w.entityId !== undefined && (typeof w.entityId !== 'string' || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(w.entityId))) return null
      if (w.groupId !== undefined && (typeof w.groupId !== 'string' || !/^[\w.-]{1,120}$/.test(w.groupId))) return null
      if (w.size === 'xs' && !['entity','sensor','camera'].includes(w.type)) return null
      if (w.type === 'stack' && (w.size === 'xs' || !validStack(w))) return null
      ids.add(w.id)
      widgets.push({ id:w.id, type:w.type, size:w.size, ...(w.entityId ? {entityId:w.entityId}:{}), ...(w.groupId ? {groupId:w.groupId}:{}), ...(w.type === 'stack' ? {label:w.label, entityIds:[...w.entityIds]} : {}) })
    }
    const positions: Record<string, {x:number;y:number;w:number;h:number}> = Object.create(null)
    for (const id of ids) {
      const p = d.positions?.[id]
      if (p && ['x','y','w','h'].every(k=>Number.isSafeInteger(p[k]) && p[k]>=0 && p[k]<=500)) positions[id]={x:p.x,y:p.y,w:p.w,h:p.h}
    }
    return { widgets, layout: buildLayout(widgets, positions), baseVersion:d.baseVersion }
  } catch { return null }
}
