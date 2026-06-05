import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { DbStore, HomeWidget } from './types.js'

const cwd = process.cwd()
const backendRoot = basename(cwd) === 'backend' ? cwd : join(cwd, 'backend')
const DB_PATH = process.env.MYHOME_DB_PATH ?? join(backendRoot, 'data/db.json')
const DATA_DIR = dirname(DB_PATH)
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_TABLE = process.env.MYHOME_SUPABASE_TABLE ?? 'myhome_config'
const SUPABASE_ROW_ID = process.env.MYHOME_SUPABASE_ROW_ID ?? 'default'
const FILE_WRITES_ALLOWED = process.env.MYHOME_ALLOW_FILE_WRITES === 'true' || !process.env.VERCEL

const DEFAULT_HOME_WIDGETS: HomeWidget[] = [
  { id: 'w-clock', type: 'clock', size: 'md' },
  { id: 'w-status', type: 'status', size: 'sm' },
  { id: 'w-weather', type: 'weather', size: 'md' },
  { id: 'w-stats', type: 'quickStats', size: 'wide' },
  { id: 'w-scenes', type: 'scenes', size: 'wide' },
]

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
    home: { widgets: DEFAULT_HOME_WIDGETS },
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
  private supabase: SupabaseClient | null
  readonly mode: 'file' | 'supabase' | 'read-only'
  readonly writable: boolean

  constructor() {
    this.supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null
    this.mode = this.supabase ? 'supabase' : FILE_WRITES_ALLOWED ? 'file' : 'read-only'
    this.writable = this.mode !== 'read-only'

    if (this.mode === 'file' && !existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

    if (!this.supabase && existsSync(DB_PATH)) {
      try {
        this.data = JSON.parse(readFileSync(DB_PATH, 'utf-8')) as DbStore
      } catch {
        this.data = structuredClone(DEFAULT_DB)
        this.persistFile()
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
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from(SUPABASE_TABLE)
        .select('data')
        .eq('id', SUPABASE_ROW_ID)
        .maybeSingle<{ data: DbStore }>()

      if (error) throw new Error(`Supabase read failed: ${error.message}`)
      if (data?.data) {
        this.data = data.data
      } else {
        await this.persistSupabase()
      }
    }
    await this.migrate()
    return this.data
  }

  async write(updater: (store: DbStore) => void): Promise<boolean> {
    if (!this.writable) return false
    await this.read()
    updater(this.data)
    if (this.supabase) {
      await this.persistSupabase()
    } else {
      this.persistFile()
    }
    return true
  }

  private persistFile(): void {
    writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  private async persistSupabase(): Promise<void> {
    if (!this.supabase) return
    const { error } = await this.supabase
      .from(SUPABASE_TABLE)
      .upsert({
        id: SUPABASE_ROW_ID,
        data: this.data,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (error) throw new Error(`Supabase write failed: ${error.message}`)
  }

  private async migrate(): Promise<void> {
    let changed = false

    if (!this.data.config.newsFeedUrl) {
      this.data.config.newsFeedUrl = DEFAULT_DB.config.newsFeedUrl
      changed = true
    }

    if (!this.data.config.home?.widgets) {
      this.data.config.home = { widgets: DEFAULT_HOME_WIDGETS }
      changed = true
    }

    if (!changed) return
    if (this.supabase) {
      await this.persistSupabase()
    } else {
      this.persistFile()
    }
  }
}

export const db = new JsonStore()
