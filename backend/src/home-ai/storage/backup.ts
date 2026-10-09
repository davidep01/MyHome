import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { loadSqlite, type CoreStore } from './db.js'

/**
 * Backup coerenti e cifrati (specifica §10, §20).
 *
 * - Copia coerente con `VACUUM INTO` (mai copia a caldo del solo file con WAL).
 * - Verifica `PRAGMA integrity_check` sulla copia prima di considerarla valida.
 * - Cifratura AES-256-GCM; la chiave sta in un file SEPARATO (0600), mai
 *   dentro il pacchetto del backup.
 * - Rotazione: 7 copie. Il ripristino salva prima il database corrente.
 */

const MAGIC = Buffer.from('HAIC1')
export const BACKUP_ROTATION = 7

export interface BackupInfo { id: string; file: string; created_at: string; bytes: number }

function loadKey(keyPath: string): Buffer {
  if (existsSync(keyPath)) {
    const key = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64')
    if (key.length === 32) return key
    throw new Error('chiave di backup non valida')
  }
  const key = randomBytes(32)
  writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 })
  try { chmodSync(keyPath, 0o600) } catch { /* filesystem senza permessi POSIX */ }
  return key
}

export function encrypt(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body])
}

export function decrypt(blob: Buffer, key: Buffer): Buffer {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('formato di backup sconosciuto')
  const iv = blob.subarray(MAGIC.length, MAGIC.length + 12)
  const tag = blob.subarray(MAGIC.length + 12, MAGIC.length + 28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(blob.subarray(MAGIC.length + 28)), decipher.final()])
}

async function integrityOk(path: string): Promise<boolean> {
  const sqlite = await loadSqlite()
  const db = new sqlite.DatabaseSync(path, { readOnly: true })
  try {
    const row = db.prepare('PRAGMA integrity_check').get()
    return row?.integrity_check === 'ok'
  } finally {
    db.close()
  }
}

export async function createBackup(store: CoreStore, dir: string, keyPath: string, now: Date): Promise<BackupInfo> {
  mkdirSync(dir, { recursive: true })
  const id = `bk-${now.toISOString().replace(/[:.]/g, '-')}`
  const tmp = join(dir, `${id}.tmp.sqlite`)
  rmSync(tmp, { force: true })
  store.db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`)
  try {
    if (!(await integrityOk(tmp))) throw new Error('copia non integra')
    const file = join(dir, `${id}.haic`)
    writeFileSync(file, encrypt(readFileSync(tmp), loadKey(keyPath)), { mode: 0o600 })
    store.run('INSERT INTO backups (id, file, created_at, verified_at) VALUES (?, ?, ?, ?)', id, basename(file), now.toISOString(), now.toISOString())
    rotate(dir)
    return { id, file: basename(file), created_at: now.toISOString(), bytes: statSync(file).size }
  } finally {
    rmSync(tmp, { force: true })
  }
}

function rotate(dir: string): void {
  const files = readdirSync(dir).filter((f) => f.endsWith('.haic')).sort()
  for (const file of files.slice(0, Math.max(0, files.length - BACKUP_ROTATION))) rmSync(join(dir, file), { force: true })
}

export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => /^bk-[0-9TZ-]+\.haic$/.test(f)).sort().reverse().map((file) => ({
    id: file.replace(/\.haic$/, ''),
    file,
    created_at: statSync(join(dir, file)).mtime.toISOString(),
    bytes: statSync(join(dir, file)).size,
  }))
}

/**
 * Prepara il ripristino: decifra in un file temporaneo e ne verifica
 * l'integrità. Il chiamante chiude l'archivio corrente, sostituisce il file e
 * riapplica le cancellazioni (tombstone) prima di riprendere l'elaborazione.
 */
export async function prepareRestore(store: CoreStore, dir: string, keyPath: string, backupId: string, dbPath: string, now: Date): Promise<{ restoredFile: string; previousCopy: string }> {
  if (!/^bk-[0-9TZ-]+$/.test(backupId)) throw new Error('backup non valido')
  const file = join(dir, `${backupId}.haic`)
  if (!existsSync(file)) throw new Error('backup non trovato')
  const plain = decrypt(readFileSync(file), loadKey(keyPath))
  const restored = `${dbPath}.restore-${now.getTime()}.sqlite`
  writeFileSync(restored, plain, { mode: 0o600 })
  if (!(await integrityOk(restored))) { rmSync(restored, { force: true }); throw new Error('backup non integro') }
  // Il database corrente non si sovrascrive mai senza una copia coerente.
  const previousCopy = `${dbPath}.pre-restore-${now.getTime()}.sqlite`
  store.db.exec(`VACUUM INTO '${previousCopy.replace(/'/g, "''")}'`)
  return { restoredFile: restored, previousCopy }
}
