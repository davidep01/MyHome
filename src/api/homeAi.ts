import { request } from './backend'
import type {
  HealthStatus, HomeContext, ObservedEvent, Preference, PrivacyConsent, PrivacyDeletionJob, Proposal,
  ReminderOccurrence, SimulationReport, WasteCalendar, HabitPattern, ArrivalEpisode,
} from '../../backend/src/home-ai/domain/contracts'
import type { CoreConfig } from '../../backend/src/home-ai/config'

/**
 * Client di HOME AI CORE. Le mutazioni portano sempre una `Idempotency-Key`:
 * ripetere la stessa azione (doppio tap, rete instabile) non crea due esiti.
 */

export type { HealthStatus, HomeContext, ObservedEvent, Preference, Proposal, ReminderOccurrence, SimulationReport, WasteCalendar, HabitPattern, ArrivalEpisode, CoreConfig }

export interface StoredProposal extends Proposal { demo: boolean; dedup_key: string }
export interface EpisodeAction { operation_id: string; action_key: string; targets: string[]; token: string; at: string; offset_s: number; session_updates: number }
export interface StoredEpisode extends ArrivalEpisode { actions: EpisodeAction[]; demo: boolean; finalized_at: string | null }
export interface StoredPattern extends HabitPattern { demo: boolean; tokens: string[]; labels: string[] }
export interface StoredOccurrence extends ReminderOccurrence { natural_key: string; demo: boolean }
export interface CalendarIssue { code: string; message: string }

export interface CoreStatus {
  health: HealthStatus
  coverage: { channel: string; status: string }[]
  metrics?: Record<string, unknown>
  reasoner: { available: boolean; structured_output: boolean; local_only: boolean }
  flags: { guests: boolean; away_mode: boolean }
  demo_seeded_until: string | null
}

export interface WastePreview {
  occurrences: (Omit<ReminderOccurrence, 'state' | 'snoozed_until' | 'updated_at'> & { natural_key: string })[]
  issues: CalendarIssue[]
  diff: { added: string[]; removed: string[]; changed: string[] }
  dst_adjusted: { date: string; resolution: string }[]
}

export function idempotencyKey(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `idk-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

const BASE = '/home-ai/v1'
const mutate = <T>(path: string, method: 'POST' | 'PUT' | 'PATCH', body: unknown, extraHeaders: Record<string, string> = {}) =>
  request<T>(`${BASE}${path}`, {
    method,
    body: JSON.stringify(body ?? {}),
    headers: { 'Idempotency-Key': idempotencyKey(), ...extraHeaders },
  })

export const homeAiApi = {
  status: () => request<CoreStatus>(`${BASE}/status`),
  context: () => request<HomeContext>(`${BASE}/context`),
  events: (opts: { kinds?: string[]; before?: string; limit?: number } = {}) => {
    const params = new URLSearchParams()
    if (opts.kinds?.length) params.set('kinds', opts.kinds.join(','))
    if (opts.before) params.set('before', opts.before)
    params.set('limit', String(opts.limit ?? 100))
    return request<{ events: ObservedEvent[]; gaps: { source_id: string; from: string; reason_code: string }[]; demo: boolean }>(`${BASE}/events?${params}`)
  },
  episodes: () => request<{ episodes: StoredEpisode[] }>(`${BASE}/episodes`),
  patterns: () => request<{ patterns: StoredPattern[]; thresholds: CoreConfig['learning'] }>(`${BASE}/patterns`),
  explainPattern: (id: string) => request<{ pattern: StoredPattern; episodes: (StoredEpisode & { role: string })[] }>(`${BASE}/patterns/${encodeURIComponent(id)}/explain`),
  patternFeedback: (id: string, kind: 'not_useful' | 'wrong_context' | 'never_suggest' | 'forget') => mutate(`/patterns/${encodeURIComponent(id)}/feedback`, 'POST', { kind }),
  suggestions: (all = false) => request<{ suggestions: StoredProposal[]; notice: string }>(`${BASE}/suggestions${all ? '?all=1' : ''}`),
  feedback: (id: string, kind: 'not_useful' | 'wrong_context' | 'never_suggest' | 'forget' | 'snooze' | 'dismiss' | 'done', snoozeMinutes?: number) =>
    mutate<{ proposal: StoredProposal }>(`/suggestions/${encodeURIComponent(id)}/feedback`, 'POST', { kind, ...(snoozeMinutes ? { snooze_minutes: snoozeMinutes } : {}) }),
  approve: (proposal: StoredProposal, purpose: 'save_preference' | 'simulate_once') =>
    mutate<{ notice: string }>(`/suggestions/${encodeURIComponent(proposal.proposal_id)}/approve`, 'POST', { purpose, expected_revision: proposal.revision, plan_hash: proposal.plan_hash }),
  simulate: (id: string, injectFailure = false) => mutate<SimulationReport>(`/suggestions/${encodeURIComponent(id)}/simulate`, 'POST', { inject_failure: injectFailure }),
  simulations: () => request<{ reports: SimulationReport[] }>(`${BASE}/simulations`),
  waste: () => request<{ active: WasteCalendar | null; revisions: { calendar_id: string; revision: number; state: string; created_at: string; demo: boolean }[]; upcoming: StoredOccurrence[]; issues: CalendarIssue[] }>(`${BASE}/waste-calendar`),
  importWaste: (body: unknown) => mutate<{ calendar: WasteCalendar; preview: WastePreview; unrecognized_labels?: string[] }>('/waste-calendar/import', 'POST', body),
  approveWaste: (calendarId: string, revision: number) => mutate<{ calendar: WasteCalendar }>(`/waste-calendar/${encodeURIComponent(calendarId)}/approve`, 'POST', {}, { 'If-Match': String(revision) }),
  reminderFeedback: (occurrenceId: string, kind: 'done' | 'snooze' | 'dismiss', snoozeMinutes?: number) =>
    mutate<{ notice: string | null }>(`/reminders/${encodeURIComponent(occurrenceId)}/feedback`, 'POST', { kind, ...(snoozeMinutes ? { snooze_minutes: snoozeMinutes } : {}) }),
  preferences: () => request<{ preferences: Preference[] }>(`${BASE}/preferences`),
  revokePreference: (preference: Preference) => mutate(`/preferences/${encodeURIComponent(preference.preference_id)}`, 'PATCH', { revoke: true, expected_revision: preference.revision }),
  privacy: () => request<{ config_revision: number; privacy: CoreConfig['privacy']; consents: PrivacyConsent[]; tombstones: number; scope_version: number }>(`${BASE}/privacy`),
  setPrivacy: (expectedRevision: number, patch: Partial<Pick<CoreConfig['privacy'], 'real_observation_enabled' | 'real_learning_enabled' | 'personal_profiles_enabled'>>) =>
    mutate(`/privacy`, 'PATCH', { expected_revision: expectedRevision, ...patch }),
  exportData: () => request<Record<string, unknown>>(`${BASE}/privacy/export`, { method: 'POST', body: '{}' }),
  deleteData: (selector: { entity_ids: string[]; subject_id: string | null; pattern_id: string | null; before: string | null; all: boolean }) =>
    mutate<PrivacyDeletionJob>('/privacy/delete', 'POST', { ...selector, confirm: true }),
  audit: () => request<{ entries: { id: number; at: string; actor: string; action: string; outcome: string; reason_codes: string[]; detail: string }[] }>(`${BASE}/audit?limit=100`),
  config: () => request<{ config: CoreConfig; revision: number }>(`${BASE}/config`),
  saveConfig: (config: CoreConfig, expectedRevision: number) => mutate<{ config: CoreConfig; revision: number }>('/config', 'PUT', { config, expected_revision: expectedRevision }),
  setFlags: (flags: { guests?: boolean }) => request(`${BASE}/flags`, { method: 'PUT', body: JSON.stringify(flags) }),
  candidates: () => request<{ candidates: { entity_id: string; label: string; state: string }[]; dashboard: string[]; catalog: { entity_id: string; label: string; role: string }[] }>(`${BASE}/entities/candidates`),
  seedDemo: () => request<{ events: number; stored: number }>(`${BASE}/demo/seed`, { method: 'POST', body: '{}' }),
  clearDemo: () => request(`${BASE}/demo/clear`, { method: 'POST', body: '{}' }),
  backups: () => request<{ backups: { id: string; created_at: string; bytes: number }[]; last_restore_verified_at: string | null }>(`${BASE}/backups`),
  createBackup: () => request<{ id: string }>(`${BASE}/backups`, { method: 'POST', body: '{}' }),
  restoreBackup: (id: string) => mutate<{ restored_from: string; tombstones_reapplied: number }>(`/backups/${encodeURIComponent(id)}/restore`, 'POST', {}),
}
