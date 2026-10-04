import { describe, expect, it } from 'vitest'
import type { DbStore, HomeConfig, HomeWidget } from '../db/types.js'
import { findHomeRevision, listHomeRevisionsMeta, MAX_HOME_REVISIONS, recordHomeRevision } from './home-revisions.js'

function widget(id: string): HomeWidget {
  return { id, type: 'clock', size: 'md' }
}

function home(overrides: Partial<HomeConfig> = {}): HomeConfig {
  return {
    widgets: [widget('a'), widget('b')],
    positions: { a: { x: 0, y: 0, w: 2, h: 3 }, b: { x: 2, y: 0, w: 2, h: 3 } },
    order: ['a', 'b'],
    layoutVersion: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'desktop',
    ...overrides,
  }
}

function emptyStore(): DbStore {
  return { config: { haUrl: '', haToken: '', weatherCity: '', newsCategory: '', newsFeedUrl: '', userName: '', dashboardName: '', hiddenEntities: [] }, rooms: [], entities: [] }
}

describe('recordHomeRevision', () => {
  it('records an edit with a widget-added summary', () => {
    const store = emptyStore()
    const next = home({ widgets: [widget('a'), widget('b'), widget('c')], layoutVersion: 2 })
    recordHomeRevision(store, home(), next, { source: 'edit', createdBy: 'desktop' })
    expect(store.homeRevisions).toHaveLength(2)
    expect(store.homeRevisions!.at(-1)).toMatchObject({
      version: 2,
      source: 'edit',
      createdBy: 'desktop',
      summary: { widgetsAdded: 1, widgetsRemoved: 0, widgetsMoved: 0, widgetsResized: 0, reordered: false },
    })
  })

  it('detects moved and resized widgets separately', () => {
    const store = emptyStore()
    const previous = home()
    const next = home({
      positions: { a: { x: 1, y: 0, w: 2, h: 3 }, b: { x: 2, y: 0, w: 2, h: 6 } },
      layoutVersion: 2,
    })
    recordHomeRevision(store, previous, next, { source: 'edit', createdBy: 'tablet' })
    expect(store.homeRevisions!.at(-1)!.summary).toMatchObject({ widgetsMoved: 1, widgetsResized: 1 })
  })

  it('detects a pure reorder', () => {
    const store = emptyStore()
    const previous = home()
    const next = home({ order: ['b', 'a'], layoutVersion: 2 })
    recordHomeRevision(store, previous, next, { source: 'edit', createdBy: 'tablet' })
    expect(store.homeRevisions!.at(-1)!.summary.reordered).toBe(true)
  })

  it('skips a no-op edit (identical save)', () => {
    const store = emptyStore()
    const snapshot = home()
    recordHomeRevision(store, snapshot, snapshot, { source: 'edit', createdBy: 'desktop' })
    expect(store.homeRevisions ?? []).toHaveLength(0)
  })

  it('never skips a rollback, even if it happens to be a no-op diff', () => {
    const store = emptyStore()
    const snapshot = home()
    recordHomeRevision(store, snapshot, snapshot, { source: 'rollback', createdBy: 'desktop', restoredFromVersion: 1 })
    expect(store.homeRevisions).toHaveLength(1)
    expect(store.homeRevisions![0].restoredFromVersion).toBe(1)
  })

  it('caps history at MAX_HOME_REVISIONS, dropping the oldest first', () => {
    const store = emptyStore()
    let previous: HomeConfig | undefined
    for (let i = 1; i <= MAX_HOME_REVISIONS + 3; i += 1) {
      const next = home({ widgets: [...Array(i).keys()].map((n) => widget(`w${n}`)), layoutVersion: i })
      recordHomeRevision(store, previous, next, { source: 'edit', createdBy: 'desktop' })
      previous = next
    }
    expect(store.homeRevisions).toHaveLength(MAX_HOME_REVISIONS)
    expect(store.homeRevisions![0].version).toBe(4)
    expect(store.homeRevisions![MAX_HOME_REVISIONS - 1].version).toBe(MAX_HOME_REVISIONS + 3)
  })
})

describe('listHomeRevisionsMeta', () => {
  it('returns most-recent-first without the home snapshot', () => {
    const store = emptyStore()
    recordHomeRevision(store, undefined, home({ layoutVersion: 1 }), { source: 'edit', createdBy: 'desktop' })
    recordHomeRevision(store, home({ layoutVersion: 1 }), home({ widgets: [widget('a')], layoutVersion: 2 }), { source: 'edit', createdBy: 'tablet' })
    const list = listHomeRevisionsMeta(store)
    expect(list.map((entry) => entry.version)).toEqual([2, 1])
    expect(list[0]).not.toHaveProperty('home')
  })
})

describe('findHomeRevision', () => {
  it('finds a revision by version', () => {
    const store = emptyStore()
    recordHomeRevision(store, undefined, home({ layoutVersion: 1 }), { source: 'edit', createdBy: 'desktop' })
    expect(findHomeRevision(store, 1)?.version).toBe(1)
    expect(findHomeRevision(store, 99)).toBeUndefined()
  })
})

it('preserves semantic widget edits and the snapshot preceding the first edit', () => {
  const store = emptyStore()
  const previous = home()
  const next = home({ widgets: [{ ...widget('a'), type: 'entity', entityId: 'light.kitchen' }, widget('b')], layoutVersion: 2 })
  recordHomeRevision(store, previous, next, { source: 'edit', createdBy: 'desktop' })
  expect(findHomeRevision(store, 1)?.home).toEqual(previous)
  expect(findHomeRevision(store, 2)?.summary.widgetsUpdated).toBe(1)
  next.widgets[0].entityId = 'light.other'
  expect(findHomeRevision(store, 2)?.home.widgets[0].entityId).toBe('light.kitchen')
})

it('ignores object property order for otherwise identical widgets', () => {
  const store = emptyStore()
  const previous = home()
  const next = home({ widgets: previous.widgets.map(({ id, size, type }) => ({ type, size, id })), layoutVersion: 2 })
  recordHomeRevision(store, previous, next, { source: 'edit', createdBy: 'desktop' })
  expect(store.homeRevisions ?? []).toHaveLength(0)
})

it('records collection renames and membership changes, keeping independent snapshots', () => {
  const store=emptyStore()
  const previous=home({widgets:[{id:'collection',type:'stack',size:'md',label:'Stanza',entityIds:['light.one','fan.two']}]})
  const next=home({layoutVersion:2,widgets:[{...previous.widgets[0],label:'Soggiorno',entityIds:['light.one','fan.two','sensor.temp']}]})
  recordHomeRevision(store,previous,next,{source:'edit',createdBy:'tablet'})
  expect(store.homeRevisions!.at(-1)!.summary.widgetsUpdated).toBe(1)
  next.widgets[0].entityIds!.push('light.other')
  expect(findHomeRevision(store,2)?.home.widgets[0].entityIds).toHaveLength(3)
  expect(findHomeRevision(store,1)?.home.widgets[0].label).toBe('Stanza')
})
