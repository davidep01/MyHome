import type { HomeContext } from '../domain/contracts.js'
import { canonicalHash, newId } from '../domain/ids.js'
import { daypartOf, inTimeWindow, localParts, type Clock } from '../domain/time.js'
import type { CoreConfig } from '../config.js'
import { CoreStore, json } from '../storage/db.js'
import type { EntityCatalog } from './catalog.js'
import type { StateProjection } from './projection.js'
import { forecastValidity, type ForecastSnapshot } from '../weather/forecast.js'

/**
 * Context builder (specifica §9): snapshot immutabili e versionati del
 * contesto, ridotti alle sole entità selezionate. Ogni decisione conserva il
 * riferimento allo snapshot su cui è stata presa. Il builder legge, non
 * modifica dispositivi.
 */

export interface RuntimeFlags { guests: boolean; away_mode: boolean }

export class ContextBuilder {
  constructor(
    private readonly store: CoreStore,
    private readonly projection: StateProjection,
    private readonly catalog: EntityCatalog,
    private readonly clock: Clock,
  ) {}

  flags(): RuntimeFlags {
    const raw = this.store.getMeta('runtime_flags')
    return raw ? { guests: false, away_mode: false, ...JSON.parse(raw) as Partial<RuntimeFlags> } : { guests: false, away_mode: false }
  }

  setFlags(flags: Partial<RuntimeFlags>): RuntimeFlags {
    const next = { ...this.flags(), ...flags }
    this.store.setMeta('runtime_flags', JSON.stringify(next))
    return next
  }

  policyVersion(): number { return Number(this.store.getMeta('policy_version') ?? 1) }
  privacyScopeVersion(): number { return Number(this.store.getMeta('privacy_scope_version') ?? 1) }

  latestForecast(): ForecastSnapshot | null {
    const row = this.store.get("SELECT body FROM observed_events WHERE kind = 'forecast.updated' ORDER BY json_extract(body, '$.payload.fetched_at') DESC LIMIT 1")
    if (!row) return null
    const event = json<{ payload: { forecast_source_id: string; issued_at: string | null; fetched_at: string; expires_at: string; points: ForecastSnapshot['points'] } }>(row.body)
    return {
      source_id: event.payload.forecast_source_id,
      issued_at: event.payload.issued_at,
      fetched_at: event.payload.fetched_at,
      expires_at: event.payload.expires_at,
      points: event.payload.points,
    }
  }

  build(config: CoreConfig): HomeContext {
    const now = this.clock.now()
    const tz = config.runtime.timezone
    const local = localParts(now, tz)
    const flags = this.flags()
    const selected = this.catalog.selectedIds()
    const openGaps = this.projection.openGaps()
    const haDown = openGaps.some((gap) => gap.source_id === 'ha')

    const states = this.projection.all()
      .filter((state) => selected.has(state.entity_id))
      .slice(0, 1_000)
      .map((state) => ({ entity_id: state.entity_id, value: state.value, stale: state.conflict || (!state.demo && haDown) }))

    const presence = this.catalog.byRole('presence').map((entry) => states.find((state) => state.entity_id === entry.entity_id))
    const presenceValues = presence.filter((state) => state && !state.stale && state.value.availability === 'available')
      .map((state) => state!.value.state)
    const occupancy: HomeContext['occupancy'] = presenceValues.some((value) => value === 'home' || value === 'on')
      ? 'home'
      : presenceValues.length > 0 && presenceValues.length === presence.length ? 'away' : 'unknown'

    const forecast = this.latestForecast()
    const validity = forecastValidity(forecast, now, config.sources.weather.forecast_ttl_minutes)

    const missing: string[] = []
    if (this.catalog.byRole('presence').length === 0) missing.push('presenza')
    if (this.catalog.byRole('window').length === 0) missing.push('finestre')
    if (config.sources.weather.adapter === 'none') missing.push('previsioni')

    const body = {
      schema_version: 1 as const,
      timezone: tz,
      local_date: local.date,
      local_time: local.time,
      weekday: local.weekday,
      daypart: daypartOf(local.hour),
      mode: config.runtime.mode,
      demo: config.runtime.demo,
      occupancy,
      guests: flags.guests,
      quiet_hours: inTimeWindow(local.time, config.attention.quiet_hours.from, config.attention.quiet_hours.until),
      states,
      forecast: forecast ? { ...forecast, valid: validity === 'valid', points: forecast.points.slice(0, 240) } : null,
      open_gaps: openGaps.slice(0, 50),
      missing_capabilities: missing,
      policy_version: this.policyVersion(),
      privacy_scope_version: this.privacyScopeVersion(),
    }
    const forecastForHash = body.forecast ? { ...body.forecast, valid: undefined } : null
    const hash = canonicalHash({ ...body, forecast: forecastForHash, local_time: undefined })
    const latest = this.store.get('SELECT snapshot_id, body FROM context_snapshots WHERE hash = ? ORDER BY taken_at DESC LIMIT 1', hash)
    if (latest) {
      const previous = json<HomeContext>(latest.body)
      if (previous.local_date === body.local_date) return { ...previous, taken_at: now.toISOString(), local_time: local.time, quiet_hours: body.quiet_hours, forecast: body.forecast }
    }
    const version = Number(this.store.getMeta('context_version') ?? 0) + 1
    const context: HomeContext = { ...body, snapshot_id: newId('ctx'), version, taken_at: now.toISOString() }
    this.store.run('INSERT INTO context_snapshots (snapshot_id, taken_at, hash, body) VALUES (?, ?, ?, ?)', context.snapshot_id, context.taken_at, hash, JSON.stringify(context))
    this.store.setMeta('context_version', String(version))
    return context
  }

  snapshot(snapshotId: string): HomeContext | null {
    const row = this.store.get('SELECT body FROM context_snapshots WHERE snapshot_id = ?', snapshotId)
    return row ? json<HomeContext>(row.body) : null
  }
}
