import { existsSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const MAX_ACTIVE_WORKERS = 2
const PARSE_TIMEOUT_MS = 3000
let activeWorkers = 0

export async function runBoundedWorker<T>(name: 'calendar-worker' | 'jpeg-worker', payload: unknown): Promise<T> {
  if (activeWorkers >= MAX_ACTIVE_WORKERS) throw new Error('Elaborazione occupata: riprova')
  activeWorkers += 1
  try {
    return await new Promise<T>((resolve, reject) => {
      const development = import.meta.url.endsWith('.ts')
      const sibling = new URL(`./${name}.js`, import.meta.url)
      const entry = development ? new URL(`./${name}.ts`, import.meta.url)
        : existsSync(sibling) ? sibling : new URL(`./lib/${name}.js`, import.meta.url)
      const require = createRequire(import.meta.url)
      const worker = development
        ? new Worker(`require(${JSON.stringify(require.resolve('tsx/cjs'))}); require(${JSON.stringify(fileURLToPath(entry))});`, {
          eval: true, workerData: payload,
          resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
        })
        : new Worker(entry, { workerData: payload,
          resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } })
      let settled = false
      const finish = (error?: Error, events?: T) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        void worker.terminate().then(() => {
          if (error) reject(error)
          else resolve(events as T)
        }, reject)
      }
      const timer = setTimeout(() => finish(new Error('Tempo massimo di elaborazione superato')), PARSE_TIMEOUT_MS)
      worker.once('message', (result: { events?: T; error?: string }) => {
        finish(result.error ? new Error(result.error) : undefined, result.events)
      })
      worker.once('error', (error) => finish(error))
      worker.once('exit', () => finish(new Error('Elaborazione interrotta')))
    })
  } finally {
    activeWorkers -= 1
  }
}
