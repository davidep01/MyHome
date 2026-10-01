import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const faults = vi.hoisted(() => ({ read: false, chmod: false, write: false, rename: false }))
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
      if (faults.read) throw new Error('EACCES read')
      return fs.readFileSync(...args)
    },
    chmodSync: (...args: Parameters<typeof fs.chmodSync>) => {
      if (faults.chmod) throw new Error('EACCES chmod')
      return fs.chmodSync(...args)
    },
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      if (faults.write) throw new Error('ENOSPC write')
      return fs.writeFileSync(...args)
    },
    renameSync: (...args: Parameters<typeof fs.renameSync>) => {
      if (faults.rename) throw new Error('EIO rename')
      return fs.renameSync(...args)
    },
  }
})

let dir: string
let path: string
const originalStore = () => ({
  config: { haUrl: 'http://house.local:8123', haToken: 'installation-secret', weatherCity: '', newsCategory: '', userName: 'Custom', dashboardName: 'MyHome', hiddenEntities: [] },
  rooms: [], entities: [],
})

beforeEach(() => {
  vi.resetModules()
  Object.assign(faults, { read: false, chmod: false, write: false, rename: false })
  dir = mkdtempSync(join(tmpdir(), 'myhome-storage-fault-'))
  path = join(dir, 'db.json')
  vi.stubEnv('MYHOME_DB_PATH', path)
  vi.stubEnv('MYHOME_READ_ONLY', 'false')
  writeFileSync(path, JSON.stringify(originalStore()))
})
afterEach(() => {
  Object.assign(faults, { read: false, chmod: false, write: false, rename: false })
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe('atomic JSON storage under filesystem failures', () => {
  it.each(['read', 'chmod'] as const)('preserves a valid DB on %s permission failure', async (fault) => {
    faults[fault] = true
    await expect(import('./client.js')).rejects.toThrow('EACCES')
    faults[fault] = false
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(originalStore())
    expect(readdirSync(dir)).toEqual(['db.json'])
  })

  it.each(['chmod', 'rename', 'write'] as const)('keeps disk and memory coherent when %s fails before commit', async (fault) => {
    const { db } = await import('./client.js')
    const previous = await db.read()
    faults[fault] = true
    await expect(db.write((draft) => { draft.config.userName = 'Must not commit' })).rejects.toThrow()
    faults[fault] = false
    expect(await db.read()).toEqual(previous)
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(previous)
    await db.write((draft) => { draft.config.userName = 'Recovered' })
    expect((await db.read()).config.userName).toBe('Recovered')
    expect(JSON.parse(readFileSync(path, 'utf-8')).config.userName).toBe('Recovered')
  })

  it('retries migration after a failed durable write, preserving the original until success', async () => {
    const { db } = await import('./client.js')
    faults.write = true
    await expect(db.read()).rejects.toThrow('ENOSPC')
    faults.write = false
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(originalStore())
    const migrated = await db.read()
    expect(migrated.config.dashboardName).toBe('S.I.M.I.')
    expect(migrated.config.haToken).toBe('installation-secret')
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(migrated)
  })

  it('preserves malformed source bytes when recovering an actually corrupt DB', async () => {
    writeFileSync(path, '{malformed')
    const { db } = await import('./client.js')
    expect((await db.read()).config.dashboardName).toBe('S.I.M.I.')
    const backup = readdirSync(dir).find((name) => name.includes('.corrupt-'))!
    expect(readFileSync(join(dir, backup), 'utf-8')).toBe('{malformed')
  })
})
