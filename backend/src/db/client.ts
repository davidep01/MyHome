import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import type { DbStore } from './types.js'
import { defaultHomeWidgets, normalizeHomeConfig } from '../lib/home-layout.js'

const cwd = process.cwd()
const backendRoot = basename(cwd) === 'backend' ? cwd : join(cwd, 'backend')
const DB_PATH = process.env.MYHOME_DB_PATH ?? join(backendRoot, 'data/db.json')
const DATA_DIR = dirname(DB_PATH)
const FILE_WRITES_ALLOWED = process.env.MYHOME_READ_ONLY !== 'true'

function isStore(value: unknown): value is DbStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<DbStore>
  return Boolean(candidate.config && typeof candidate.config === 'object' && !Array.isArray(candidate.config))
    && Array.isArray(candidate.rooms)
    && Array.isArray(candidate.entities)
}

const DEFAULT_DB: DbStore = {
  config: {
    haUrl: 'http://homeassistant.local:8123',
    haToken: '',
    weatherCity: 'Milan,IT',
    newsCategory: 'technology',
    newsFeedUrl: 'https://www.ansa.it/sito/ansait_rss.xml',
    userName: 'Davide',
    dashboardName: 'MyHome',
    hiddenEntities: [],
    home: { widgets: defaultHomeWidgets() },
  },
  rooms: [
    { id: 'soggiorno', label: 'Soggiorno', icon: 'sofa', sortOrder: 0 },
    { id: 'cucina', label: 'Cucina', icon: 'utensils', sortOrder: 1 },
    { id: 'camera', label: 'Camera', icon: 'bed', sortOrder: 2 },
    { id: 'bagno', label: 'Bagno', icon: 'bath', sortOrder: 3 },
    { id: 'esterno', label: 'Esterno', icon: 'tree-pine', sortOrder: 4 },
  ],
  entities: [
    { id: 'e1',  roomId: 'soggiorno', entityId: 'light.soggiorno',         label: 'Luci',          type: 'light',   sortOrder: 0 },
    { id: 'e2',  roomId: 'soggiorno', entityId: 'light.soggiorno_lampada', label: 'Lampada',       type: 'light',   sortOrder: 1 },
    { id: 'e3',  roomId: 'soggiorno', entityId: 'cover.soggiorno_tende',   label: 'Tende',         type: 'cover',   sortOrder: 2 },
    { id: 'e4',  roomId: 'soggiorno', entityId: 'climate.soggiorno',       label: 'Clima',         type: 'climate', sortOrder: 3 },
    { id: 'e5',  roomId: 'soggiorno', entityId: 'scene.soggiorno_relax',   label: 'Relax',         type: 'scene',   sortOrder: 4 },
    { id: 'e6',  roomId: 'soggiorno', entityId: 'scene.soggiorno_film',    label: 'Film',          type: 'scene',   sortOrder: 5 },
    { id: 'e7',  roomId: 'soggiorno', entityId: 'media_player.soggiorno',  label: 'Musica',        type: 'media',   sortOrder: 6 },
    { id: 'e8',  roomId: 'cucina',    entityId: 'light.cucina',            label: 'Luci',          type: 'light',   sortOrder: 0 },
    { id: 'e9',  roomId: 'cucina',    entityId: 'light.cucina_piano',      label: 'Piano cottura', type: 'light',   sortOrder: 1 },
    { id: 'e10', roomId: 'cucina',    entityId: 'cover.cucina_tenda',      label: 'Tenda',         type: 'cover',   sortOrder: 2 },
    { id: 'e11', roomId: 'camera',    entityId: 'light.camera',            label: 'Luci',          type: 'light',   sortOrder: 0 },
    { id: 'e12', roomId: 'camera',    entityId: 'light.camera_comodino',   label: 'Comodino',      type: 'light',   sortOrder: 1 },
    { id: 'e13', roomId: 'camera',    entityId: 'cover.camera_tapparelle', label: 'Tapparelle',    type: 'cover',   sortOrder: 2 },
    { id: 'e14', roomId: 'camera',    entityId: 'climate.camera',          label: 'Clima',         type: 'climate', sortOrder: 3 },
    { id: 'e15', roomId: 'camera',    entityId: 'scene.camera_notte',      label: 'Notte',         type: 'scene',   sortOrder: 4 },
    { id: 'e16', roomId: 'bagno',     entityId: 'light.bagno',             label: 'Luci',          type: 'light',   sortOrder: 0 },
    { id: 'e17', roomId: 'bagno',     entityId: 'light.bagno_specchio',    label: 'Specchio',      type: 'light',   sortOrder: 1 },
    { id: 'e18', roomId: 'esterno',   entityId: 'light.esterno',           label: 'Giardino',      type: 'light',   sortOrder: 0 },
    { id: 'e19', roomId: 'esterno',   entityId: 'cover.cancello',          label: 'Cancello',      type: 'cover',   sortOrder: 1 },
    { id: 'e20', roomId: 'esterno',   entityId: 'switch.irrigazione',      label: 'Irrigazione',   type: 'switch',  sortOrder: 2 },
  ],
}

class JsonStore {
  private data: DbStore
  private writeQueue: Promise<void> = Promise.resolve()
  private migrated = false
  readonly mode: 'file' | 'read-only'
  readonly writable: boolean

  constructor() {
    this.mode = FILE_WRITES_ALLOWED ? 'file' : 'read-only'
    this.writable = this.mode !== 'read-only'

    if (this.mode === 'file' && !existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })

    if (existsSync(DB_PATH)) {
      try {
        const parsed = JSON.parse(readFileSync(DB_PATH, 'utf-8')) as unknown
        if (!isStore(parsed)) throw new Error('Struttura DB non valida')
        this.data = parsed
        if (this.mode === 'file') chmodSync(DB_PATH, 0o600)
      } catch (error) {
        this.data = structuredClone(DEFAULT_DB)
        if (this.mode === 'file') {
          const recoveryPath = `${DB_PATH}.corrupt-${Date.now()}`
          renameSync(DB_PATH, recoveryPath)
          this.persistFile()
          console.error(`⚠️ DB non valido; copia preservata in ${recoveryPath}`, error)
        } else {
          console.error('⚠️ DB non valido in modalità sola lettura; uso i valori predefiniti in memoria', error)
        }
      }
    } else {
      this.data = structuredClone(DEFAULT_DB)
      if (this.mode === 'file') {
        this.persistFile()
        console.log(`✅ DB created with default data at ${DB_PATH}`)
      }
    }
  }

  async read(): Promise<DbStore> {
    await this.writeQueue
    await this.migrate()
    return structuredClone(this.data)
  }

  async write(updater: (store: DbStore) => void): Promise<boolean> {
    if (!this.writable) return false
    let written = false
    const operation = this.writeQueue.then(async () => {
      await this.migrate()
      const previous = this.data
      const draft = structuredClone(previous)
      updater(draft)
      this.data = draft
      try {
        this.persistFile()
        written = true
      } catch (error) {
        this.data = previous
        throw error
      }
    })
    this.writeQueue = operation.catch(() => {})
    await operation
    return written
  }

  private persistFile(): void {
    const tempPath = `${DB_PATH}.${process.pid}.tmp`
    writeFileSync(tempPath, JSON.stringify(this.data, null, 2), { encoding: 'utf-8', mode: 0o600 })
    renameSync(tempPath, DB_PATH)
    chmodSync(DB_PATH, 0o600)
  }

  private async migrate(): Promise<void> {
    if (this.migrated) return
    this.migrated = true
    let changed = false

    if (!this.data.config.newsFeedUrl) {
      this.data.config.newsFeedUrl = DEFAULT_DB.config.newsFeedUrl
      changed = true
    }

    const normalizedHome = normalizeHomeConfig(this.data.config.home)
    if (JSON.stringify(this.data.config.home ?? null) !== JSON.stringify(normalizedHome)) {
      this.data.config.home = normalizedHome
      changed = true
    }

    if (!changed || !this.writable) return
    this.persistFile()
  }
}

export const db = new JsonStore()
