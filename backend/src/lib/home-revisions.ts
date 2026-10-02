import type { DbStore, HomeConfig, HomeRevision, HomeRevisionSummary } from '../db/types.js'

/** Quante versioni tenere: la più recente più MAX_HOME_REVISIONS - 1 precedenti. */
export const MAX_HOME_REVISIONS = 10

function semanticWidget(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(semanticWidget).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${semanticWidget(child)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

function summarize(previous: HomeConfig | undefined, next: HomeConfig): HomeRevisionSummary {
  const prevById = new Map((previous?.widgets ?? []).map((widget) => [widget.id, widget]))
  const nextIds = new Set(next.widgets.map((widget) => widget.id))

  let widgetsUpdated = 0
  let widgetsAdded = 0
  let widgetsMoved = 0
  let widgetsResized = 0

  for (const widget of next.widgets) {
    if (!prevById.has(widget.id)) {
      widgetsAdded += 1
      continue
    }
    if (semanticWidget(prevById.get(widget.id)) !== semanticWidget(widget)) widgetsUpdated += 1
    const prevPos = previous?.positions?.[widget.id]
    const nextPos = next.positions?.[widget.id]
    if (!prevPos || !nextPos) continue
    if (prevPos.w !== nextPos.w || prevPos.h !== nextPos.h) widgetsResized += 1
    else if (prevPos.x !== nextPos.x || prevPos.y !== nextPos.y) widgetsMoved += 1
  }

  let widgetsRemoved = 0
  for (const id of prevById.keys()) if (!nextIds.has(id)) widgetsRemoved += 1

  const reordered = widgetsAdded === 0
    && widgetsRemoved === 0
    && JSON.stringify(previous?.order ?? []) !== JSON.stringify(next.order ?? [])

  return { widgetsAdded, widgetsRemoved, widgetsMoved, widgetsResized, widgetsUpdated, reordered }
}

function isNoop(summary: HomeRevisionSummary): boolean {
  return !summary.widgetsAdded && !summary.widgetsRemoved
    && !summary.widgetsMoved && !summary.widgetsResized && !summary.widgetsUpdated && !summary.reordered
}

export interface RecordHomeRevisionMeta {
  source: 'edit' | 'rollback'
  createdBy: NonNullable<HomeConfig['updatedBy']>
  restoredFromVersion?: number
}

/**
 * Registra una revisione della home dentro `store.homeRevisions`, mutando lo
 * store in place (va chiamata dentro `db.write()`). Un salvataggio "edit" che
 * non cambia nulla di osservabile (stesso set di widget, stesse posizioni,
 * stesso ordine) non produce una nuova voce — evita di riempire la cronologia
 * con salvataggi identici a raffica.
 */
export function recordHomeRevision(
  store: DbStore,
  previous: HomeConfig | undefined,
  next: HomeConfig,
  meta: RecordHomeRevisionMeta,
): void {
  const summary = summarize(previous, next)
  if (meta.source === 'edit' && isNoop(summary)) return

  const revision: HomeRevision = {
    version: next.layoutVersion ?? 1,
    createdAt: next.updatedAt ?? new Date().toISOString(),
    createdBy: meta.createdBy,
    source: meta.source,
    ...(meta.restoredFromVersion !== undefined ? { restoredFromVersion: meta.restoredFromVersion } : {}),
    summary,
    home: next,
  }

  const existing = [...(store.homeRevisions ?? [])]
  // Preserve the state before the first real edit so that edit is reversible.
  if (previous && (previous.layoutVersion ?? 1) < revision.version && !existing.some((entry) => entry.version === (previous.layoutVersion ?? 1))) {
    existing.push({ version: previous.layoutVersion ?? 1, createdAt: previous.updatedAt ?? revision.createdAt,
      createdBy: previous.updatedBy ?? 'system', source: 'edit', summary: summarize(previous, previous), home: structuredClone(previous) })
  }
  const revisions = [...existing, { ...revision, home: structuredClone(next) }]
  store.homeRevisions = revisions.length > MAX_HOME_REVISIONS
    ? revisions.slice(revisions.length - MAX_HOME_REVISIONS)
    : revisions
}

export type HomeRevisionMeta = Omit<HomeRevision, 'home'>

/** Elenco per la regia: più recente per primo, senza lo snapshot completo (serve solo al restore). */
export function listHomeRevisionsMeta(store: DbStore): HomeRevisionMeta[] {
  return [...(store.homeRevisions ?? [])]
    .reverse()
    .map((revision) => ({
      version: revision.version,
      createdAt: revision.createdAt,
      createdBy: revision.createdBy,
      source: revision.source,
      ...(revision.restoredFromVersion !== undefined ? { restoredFromVersion: revision.restoredFromVersion } : {}),
      summary: revision.summary,
    }))
}

export function findHomeRevision(store: DbStore, version: number): HomeRevision | undefined {
  return (store.homeRevisions ?? []).find((revision) => revision.version === version)
}
