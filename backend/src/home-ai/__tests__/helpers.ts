import { HomeAiCore, CoreClock } from '../core.js'
import { ManualClock } from '../domain/time.js'
import { openCoreStore } from '../storage/db.js'
import { defaultCoreConfig, type CoreConfig } from '../config.js'

export const DEMO_END = '2026-10-12'
/** Lunedì 12/10/2026 alle 21:00 a Roma (CEST, UTC+2). */
export const DEMO_UNTIL = new Date('2026-10-12T19:00:00Z')

export async function newCore(start = '2026-10-12T19:00:00Z', mutate?: (config: CoreConfig) => void) {
  const store = await openCoreStore(':memory:')
  const base = new ManualClock(start)
  const clock = new CoreClock(base)
  const core = new HomeAiCore({ store, clock })
  if (mutate) {
    const config = defaultCoreConfig()
    mutate(config)
    core.updateConfig(config, core.configRevision(), 'test')
  }
  return { core, store, clock: base }
}

export async function seededDemo(mutate?: (config: CoreConfig) => void) {
  const env = await newCore(DEMO_UNTIL.toISOString(), mutate)
  const result = await env.core.seedDemo({ endDate: DEMO_END, until: DEMO_UNTIL })
  return { ...env, result }
}
