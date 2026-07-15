/**
 * Cache LRU a byte per i media proxati (§16): copertine, artwork RSS e foto
 * dello screensaver remoto. Limiti espliciti su voci, byte totali e TTL —
 * N kiosk non devono trasformarsi in N fetch verso l'esterno, ma la memoria
 * del container resta prevedibile.
 */

export interface LruEntry {
  bytes: Uint8Array
  contentType: string
}

interface InternalEntry extends LruEntry {
  expiresAt: number
}

export interface ByteLruOptions {
  maxEntries: number
  maxTotalBytes: number
  ttlMs: number
  now?: () => number
}

export class ByteLru {
  private readonly map = new Map<string, InternalEntry>()
  private totalBytes = 0
  private readonly options: Required<ByteLruOptions>

  constructor(options: ByteLruOptions) {
    this.options = { now: Date.now, ...options }
  }

  get(key: string): LruEntry | null {
    const entry = this.map.get(key)
    if (!entry) return null
    if (entry.expiresAt <= this.options.now()) {
      this.delete(key)
      return null
    }
    // LRU: il riuso sposta la voce in coda (la più recente).
    this.map.delete(key)
    this.map.set(key, entry)
    return { bytes: entry.bytes, contentType: entry.contentType }
  }

  set(key: string, value: LruEntry): void {
    if (value.bytes.byteLength > this.options.maxTotalBytes) return
    this.delete(key)
    this.map.set(key, { ...value, expiresAt: this.options.now() + this.options.ttlMs })
    this.totalBytes += value.bytes.byteLength
    this.evict()
  }

  delete(key: string): void {
    const entry = this.map.get(key)
    if (!entry) return
    this.map.delete(key)
    this.totalBytes -= entry.bytes.byteLength
  }

  clear(): void {
    this.map.clear()
    this.totalBytes = 0
  }

  get size(): number {
    return this.map.size
  }

  get bytes(): number {
    return this.totalBytes
  }

  private evict(): void {
    while (this.map.size > this.options.maxEntries || this.totalBytes > this.options.maxTotalBytes) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) return
      this.delete(oldest)
    }
  }
}
