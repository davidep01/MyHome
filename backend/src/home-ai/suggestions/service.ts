import type { Approval, Feedback, PolicyDecision, Preference, Proposal, Scope } from '../domain/contracts.js'
import { CoreError } from '../domain/errors.js'
import { canonicalHash, newId } from '../domain/ids.js'
import { localParts, type Clock } from '../domain/time.js'
import { CoreStore, json } from '../storage/db.js'
import type { Candidate } from '../agents/types.js'

/**
 * Ciclo di vita delle proposte (specifica §17):
 *
 *   candidate → policy_checked → visible
 *   visible → dismissed | snoozed | preference_saved | simulation_authorized
 *   simulation_authorized → simulated | simulation_failed
 *   candidate / visible / snoozed → expired | superseded | withdrawn
 *
 * `preference_saved` NON è "eseguito"; `simulated` NON è "avvenuto in casa".
 * Un'approvazione salva una preferenza o autorizza UNA simulazione; è legata
 * a revisione e hash del piano: cambiare il piano la invalida (T38).
 */

export interface StoredProposal extends Proposal { demo: boolean; dedup_key: string }

const OPEN_STATES = new Set(['candidate', 'policy_checked', 'visible', 'snoozed'])

export function planHash(candidate: Pick<Candidate, 'steps' | 'kind' | 'topic' | 'occurrence_id' | 'pattern_id'>): string {
  return canonicalHash({ steps: candidate.steps, kind: candidate.kind, topic: candidate.topic, occurrence: candidate.occurrence_id, pattern: candidate.pattern_id })
}

export class ProposalService {
  constructor(private readonly store: CoreStore, private readonly clock: Clock) {}

  /** Applica la decisione di policy a un candidato; idempotente per dedup_key. */
  upsert(candidate: Candidate, decision: PolicyDecision): StoredProposal | null {
    this.store.run('INSERT INTO policy_decisions (decision_id, candidate_key, evaluated_at, body) VALUES (?, ?, ?, ?)',
      decision.decision_id, decision.candidate_key, decision.evaluated_at, JSON.stringify(decision))
    const nowIso = this.clock.now().toISOString()
    const existing = this.byDedup(candidate.dedup_key)
    const hash = planHash(candidate)
    if (decision.outcome === 'reject') {
      if (existing && OPEN_STATES.has(existing.state)) this.setState(existing, 'withdrawn', decision.reason_codes)
      return null
    }
    const targetState: Proposal['state'] = decision.outcome === 'allow_local' ? 'visible' : decision.outcome === 'simulate_only' ? 'policy_checked' : 'candidate'
    if (existing) {
      // Un esito già scelto dall'utente non si "riapre" con lo stesso piano.
      if (!OPEN_STATES.has(existing.state) && existing.plan_hash === hash) return existing
      const planChanged = existing.plan_hash !== hash
      const next: StoredProposal = {
        ...existing,
        revision: planChanged ? existing.revision + 1 : existing.revision,
        explanation: candidate.explanation,
        title: candidate.title,
        steps: candidate.steps,
        resources: candidate.resources,
        evidence_ids: candidate.evidence_ids.slice(0, 200),
        plan_hash: hash,
        context_snapshot_id: decision.context_snapshot_id,
        policy_version: decision.policy_version,
        policy_result: decision.outcome,
        reason_codes: decision.reason_codes,
        expires_at: candidate.expires_at,
        state: existing.state === 'snoozed' && existing.snoozed_until && Date.parse(existing.snoozed_until) > this.clock.now().getTime() ? 'snoozed' : targetState,
      }
      if (planChanged) this.store.run('UPDATE approvals SET revoked_at = ? WHERE proposal_id = ? AND revoked_at IS NULL', nowIso, existing.proposal_id)
      this.save(next)
      return next
    }
    const proposal: StoredProposal = {
      schema_version: 1,
      proposal_id: newId('prop'),
      revision: 1,
      agent_key: candidate.agent_key,
      scope: candidate.scope,
      kind: candidate.kind,
      topic: candidate.topic,
      title: candidate.title,
      explanation: candidate.explanation,
      context_snapshot_id: decision.context_snapshot_id,
      evidence_ids: candidate.evidence_ids.slice(0, 200),
      pattern_id: candidate.pattern_id,
      occurrence_id: candidate.occurrence_id,
      risk: candidate.risk,
      resources: candidate.resources,
      steps: candidate.steps,
      policy_version: decision.policy_version,
      policy_result: decision.outcome,
      reason_codes: decision.reason_codes,
      state: targetState,
      snoozed_until: null,
      created_at: nowIso,
      expires_at: candidate.expires_at,
      plan_hash: hash,
      physical_execution: 'disabled',
      demo: candidate.demo,
      dedup_key: candidate.dedup_key,
    }
    // Una nuova revisione della stessa abitudine sostituisce la proposta precedente:
    // mai due proposte aperte per la stessa routine.
    if (candidate.pattern_id) {
      for (const row of this.store.all("SELECT body FROM proposals WHERE json_extract(body, '$.pattern_id') = ? AND dedup_key <> ?", candidate.pattern_id, candidate.dedup_key)) {
        const older = json<StoredProposal>(row.body)
        if (OPEN_STATES.has(older.state)) this.setState(older, 'superseded', ['SUPERSEDED_BY_NEW_REVISION'])
      }
    }
    this.save(proposal)
    return proposal
  }

  private save(proposal: StoredProposal): void {
    this.store.run(
      `INSERT INTO proposals (proposal_id, revision, state, topic, agent_key, dedup_key, created_at, expires_at, demo, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(proposal_id) DO UPDATE SET revision = excluded.revision, state = excluded.state, expires_at = excluded.expires_at, body = excluded.body`,
      proposal.proposal_id, proposal.revision, proposal.state, proposal.topic, proposal.agent_key, proposal.dedup_key,
      proposal.created_at, proposal.expires_at, proposal.demo ? 1 : 0, JSON.stringify(proposal),
    )
  }

  private setState(proposal: StoredProposal, state: Proposal['state'], reasons: string[] = []): StoredProposal {
    const next = { ...proposal, state, reason_codes: reasons.length ? reasons.slice(0, 20) : proposal.reason_codes }
    this.save(next)
    return next
  }

  get(proposalId: string): StoredProposal | null {
    const row = this.store.get('SELECT body FROM proposals WHERE proposal_id = ?', proposalId)
    return row ? json<StoredProposal>(row.body) : null
  }

  byDedup(dedupKey: string): StoredProposal | null {
    const row = this.store.get('SELECT body FROM proposals WHERE dedup_key = ?', dedupKey)
    return row ? json<StoredProposal>(row.body) : null
  }

  list(opts: { states?: string[]; includePersonal: boolean; demo?: boolean; limit: number }): StoredProposal[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (opts.states?.length) { where.push(`state IN (${opts.states.map(() => '?').join(',')})`); params.push(...opts.states) }
    if (opts.demo !== undefined) { where.push('demo = ?'); params.push(opts.demo ? 1 : 0) }
    const rows = this.store.all(`SELECT body FROM proposals ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`, ...params, Math.min(opts.limit, 200))
      .map((row) => json<StoredProposal>(row.body))
    return opts.includePersonal ? rows : rows.filter((p) => p.scope.kind !== 'person')
  }

  /** Proposte proattive rese visibili oggi (budget di attenzione). */
  /**
   * `exceptDedupKey`: la proposta che si sta rivalutando non consuma il budget
   * né il cooldown di sé stessa — altrimenti una proposta già visibile
   * tornerebbe "candidata" alla prima rivalutazione.
   */
  proactiveVisibleToday(tz: string, exceptDedupKey = ''): number {
    const today = localParts(this.clock.now(), tz).date
    return this.store.all("SELECT body FROM proposals WHERE agent_key <> 'waste' AND state NOT IN ('candidate', 'policy_checked') AND dedup_key <> ?", exceptDedupKey)
      .map((row) => json<StoredProposal>(row.body))
      .filter((p) => p.kind !== 'reminder' && localParts(new Date(p.created_at), tz).date === today).length
  }

  lastShownForTopic(topic: string, exceptDedupKey = ''): string | null {
    const row = this.store.get("SELECT created_at FROM proposals WHERE topic = ? AND state NOT IN ('candidate', 'policy_checked') AND dedup_key <> ? ORDER BY created_at DESC LIMIT 1", topic, exceptDedupKey)
    return row ? String(row.created_at) : null
  }

  /** Scade e ritira ciò che non è più valido; i promemoria in sospeso tornano visibili allo scadere dello snooze. */
  housekeeping(): void {
    const now = this.clock.now()
    for (const proposal of this.list({ states: [...OPEN_STATES], includePersonal: true, limit: 200 })) {
      if (Date.parse(proposal.expires_at) <= now.getTime()) this.setState(proposal, 'expired', ['EXPIRED'])
      else if (proposal.state === 'snoozed' && proposal.snoozed_until && Date.parse(proposal.snoozed_until) <= now.getTime()) this.setState({ ...proposal, snoozed_until: null }, 'visible')
    }
  }

  withdraw(proposalId: string, reason: string): void {
    const proposal = this.get(proposalId)
    if (proposal && OPEN_STATES.has(proposal.state)) this.setState(proposal, 'withdrawn', [reason])
  }

  // ── Feedback ────────────────────────────────────────────────────────────────

  feedback(proposalId: string, kind: Feedback['kind'], actorId: string, scope: Scope, note: string | null, snoozeMinutes = 60): { proposal: StoredProposal; preference: Preference | null } {
    const proposal = this.get(proposalId)
    if (!proposal) throw new CoreError('NOT_FOUND', 'Proposta non trovata.')
    const now = this.clock.now()
    const record: Feedback = {
      feedback_id: newId('fb'), target_kind: 'proposal', target_id: proposalId, kind, actor_id: actorId, scope,
      note: note ? note.slice(0, 280) : null, created_at: now.toISOString(),
    }
    this.store.run('INSERT INTO feedback (feedback_id, target_kind, target_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      record.feedback_id, record.target_kind, record.target_id, record.kind, JSON.stringify(record), record.created_at)
    // Il feedback su una proposta di routine vale anche per il pattern che la origina.
    if (proposal.pattern_id && ['not_useful', 'wrong_context', 'never_suggest', 'forget'].includes(kind)) {
      this.store.run('INSERT INTO feedback (feedback_id, target_kind, target_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        newId('fb'), 'pattern', proposal.pattern_id, kind, JSON.stringify({ ...record, target_kind: 'pattern', target_id: proposal.pattern_id }), record.created_at)
    }
    let preference: Preference | null = null
    let next: StoredProposal
    switch (kind) {
      case 'snooze': {
        const until = Math.min(now.getTime() + Math.max(5, Math.min(snoozeMinutes, 24 * 60)) * 60_000, Date.parse(proposal.expires_at) - 60_000)
        next = this.setState({ ...proposal, snoozed_until: new Date(until).toISOString() }, 'snoozed', ['USER_SNOOZED'])
        break
      }
      case 'never_suggest':
        preference = this.savePreference({
          kind: 'never_suggest', topic: proposal.topic, scope: proposal.scope, pattern_id: proposal.pattern_id, plan_hash: null,
          description: `Non suggerire più: ${proposal.title}`, created_by: actorId,
        })
        next = this.setState(proposal, 'dismissed', ['NEVER_SUGGEST'])
        break
      case 'done':
        next = this.setState(proposal, 'dismissed', ['USER_DONE'])
        break
      default:
        next = this.setState(proposal, 'dismissed', [kind === 'not_useful' ? 'NOT_USEFUL' : kind === 'wrong_context' ? 'WRONG_CONTEXT' : kind === 'forget' ? 'FORGET_REQUESTED' : 'USER_DISMISSED'])
    }
    return { proposal: next, preference }
  }

  // ── Approvazioni circoscritte ──────────────────────────────────────────────

  approve(proposalId: string, input: { purpose: Approval['purpose']; expected_revision: number; plan_hash: string }, actorId: string, scope: Scope): { approval: Approval; proposal: StoredProposal; preference: Preference | null } {
    const proposal = this.get(proposalId)
    if (!proposal) throw new CoreError('NOT_FOUND', 'Proposta non trovata.')
    if (proposal.revision !== input.expected_revision || proposal.plan_hash !== input.plan_hash) {
      throw new CoreError('REVISION_CONFLICT', 'La proposta è cambiata: rileggi il piano prima di approvarlo.')
    }
    if (!['visible', 'snoozed', 'policy_checked', 'preference_saved', 'simulated', 'simulation_failed', 'simulation_authorized'].includes(proposal.state)) {
      throw new CoreError('REVISION_CONFLICT', 'La proposta non è più approvabile.')
    }
    if (input.purpose === 'save_preference' && proposal.kind === 'reminder') {
      throw new CoreError('VALIDATION_ERROR', 'Un promemoria non si salva come preferenza: usa “Fatto”, “Più tardi” o “Ignora”.')
    }
    const existing = this.store.get('SELECT body FROM approvals WHERE proposal_id = ? AND proposal_revision = ? AND purpose = ? AND revoked_at IS NULL',
      proposalId, proposal.revision, input.purpose)
    const now = this.clock.now()
    if (existing) {
      const approval = json<Approval>(existing.body)
      if (Date.parse(approval.expires_at) > now.getTime()) return { approval, proposal, preference: null } // idempotente
      this.store.run('DELETE FROM approvals WHERE approval_id = ?', approval.approval_id)
    }
    const approval: Approval = {
      approval_id: newId('apv'),
      proposal_id: proposalId,
      proposal_revision: proposal.revision,
      plan_hash: proposal.plan_hash,
      actor_id: actorId,
      scope,
      purpose: input.purpose,
      granted_at: now.toISOString(),
      expires_at: new Date(now.getTime() + (input.purpose === 'simulate_once' ? 3_600_000 : 365 * 86_400_000)).toISOString(),
      revoked_at: null,
    }
    // Un'approvazione già consumata/revocata resta nell'audit, non blocca una nuova approvazione esplicita.
    this.store.run('DELETE FROM approvals WHERE proposal_id = ? AND proposal_revision = ? AND purpose = ? AND revoked_at IS NOT NULL', proposalId, proposal.revision, input.purpose)
    this.store.run('INSERT INTO approvals (approval_id, proposal_id, proposal_revision, plan_hash, purpose, body, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      approval.approval_id, approval.proposal_id, approval.proposal_revision, approval.plan_hash, approval.purpose, JSON.stringify(approval))
    let preference: Preference | null = null
    let next: StoredProposal
    if (input.purpose === 'save_preference') {
      preference = this.savePreference({
        kind: 'routine', topic: proposal.topic, scope: proposal.scope, pattern_id: proposal.pattern_id, plan_hash: proposal.plan_hash,
        description: proposal.title, created_by: actorId,
      })
      next = this.setState(proposal, 'preference_saved', ['PREFERENCE_SAVED'])
    } else {
      next = this.setState(proposal, 'simulation_authorized', ['SIMULATION_AUTHORIZED'])
    }
    return { approval, proposal: next, preference }
  }

  /** Approvazione valida per simulare la revisione corrente del piano. */
  validSimulationApproval(proposal: StoredProposal): Approval | null {
    const row = this.store.get("SELECT body FROM approvals WHERE proposal_id = ? AND purpose = 'simulate_once' AND revoked_at IS NULL ORDER BY rowid DESC LIMIT 1", proposal.proposal_id)
    if (!row) return null
    const approval = json<Approval>(row.body)
    if (approval.proposal_revision !== proposal.revision || approval.plan_hash !== proposal.plan_hash) return null
    if (Date.parse(approval.expires_at) <= this.clock.now().getTime()) return null
    return approval
  }

  consumeSimulationApproval(approvalId: string): void {
    this.store.run('UPDATE approvals SET revoked_at = ? WHERE approval_id = ?', this.clock.now().toISOString(), approvalId)
  }

  markSimulated(proposalId: string, ok: boolean): StoredProposal | null {
    const proposal = this.get(proposalId)
    if (!proposal) return null
    return this.setState(proposal, ok ? 'simulated' : 'simulation_failed', [ok ? 'SIMULATED' : 'SIMULATION_FAILED'])
  }

  // ── Preferenze esplicite ───────────────────────────────────────────────────

  savePreference(input: { kind: Preference['kind']; topic: string; scope: Scope; pattern_id: string | null; plan_hash: string | null; description: string; created_by: string }): Preference {
    const existing = this.store.all('SELECT body FROM preferences WHERE topic = ? AND kind = ? AND revoked_at IS NULL', input.topic, input.kind)
      .map((row) => json<Preference>(row.body))[0]
    if (existing) return existing
    const preference: Preference = {
      schema_version: 1,
      preference_id: newId('pref'),
      revision: 1,
      scope: input.scope,
      kind: input.kind,
      topic: input.topic,
      description: input.description.slice(0, 280),
      pattern_id: input.pattern_id,
      plan_hash: input.plan_hash,
      created_by: input.created_by,
      created_at: this.clock.now().toISOString(),
      revoked_at: null,
    }
    this.store.run('INSERT INTO preferences (preference_id, revision, kind, topic, body, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)',
      preference.preference_id, preference.revision, preference.kind, preference.topic, JSON.stringify(preference))
    return preference
  }

  preferences(includeRevoked = false): Preference[] {
    return this.store.all(`SELECT body FROM preferences ${includeRevoked ? '' : 'WHERE revoked_at IS NULL'} ORDER BY rowid DESC LIMIT 200`)
      .map((row) => json<Preference>(row.body))
  }

  revokePreference(preferenceId: string, expectedRevision: number): Preference {
    const row = this.store.get('SELECT body FROM preferences WHERE preference_id = ?', preferenceId)
    if (!row) throw new CoreError('NOT_FOUND', 'Preferenza non trovata.')
    const preference = json<Preference>(row.body)
    if (preference.revision !== expectedRevision) throw new CoreError('REVISION_CONFLICT', 'Preferenza modificata nel frattempo.')
    const next: Preference = { ...preference, revision: preference.revision + 1, revoked_at: this.clock.now().toISOString() }
    this.store.run('UPDATE preferences SET revision = ?, body = ?, revoked_at = ? WHERE preference_id = ?', next.revision, JSON.stringify(next), next.revoked_at, preferenceId)
    return next
  }
}
