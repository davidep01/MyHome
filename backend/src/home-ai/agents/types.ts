import type { HomeContext, ProspectiveStep, Proposal, Scope } from '../domain/contracts.js'

/**
 * Contratto degli agenti deterministici (specifica §15):
 * `evaluate(context, trigger) → Candidate[]`.
 *
 * Un agente NON riceve client HA, browser, shell, notifiche o credenziali, e
 * non pubblica nell'inbox: produce candidati, che solo il policy engine può
 * rendere visibili.
 */

export interface Candidate {
  agent_key: Proposal['agent_key']
  kind: Proposal['kind']
  topic: string
  title: string
  explanation: string
  evidence_ids: string[]
  pattern_id: string | null
  occurrence_id: string | null
  risk: Proposal['risk']
  resources: string[]
  steps: ProspectiveStep[]
  scope: Scope
  urgency: 'low' | 'normal' | 'high'
  expires_at: string
  /** 0..1 — pesi espliciti nel policy engine, nessuna "intelligenza %". */
  utility: number
  support: number
  uncertainty: number
  attention_cost: number
  dedup_key: string
  /** Fatti che devono essere validi e non obsoleti al momento della decisione. */
  requires: string[]
  /** true se deriva da un'abitudine inferita: richiede il consenso all'apprendimento. */
  learned: boolean
  demo: boolean
}

export type AgentTrigger =
  | { kind: 'episode_finalized'; episode_id: string }
  | { kind: 'reminders_due'; occurrence_ids: string[] }
  | { kind: 'state_changed'; entity_ids: string[] }
  | { kind: 'forecast_updated' }
  | { kind: 'review' }

export interface Agent<Deps> {
  readonly key: Proposal['agent_key']
  evaluate(context: HomeContext, trigger: AgentTrigger, deps: Deps): Candidate[]
}
