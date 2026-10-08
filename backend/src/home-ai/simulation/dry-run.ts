import type { HomeContext, SimulationReport } from '../domain/contracts.js'
import { newId, seededRandom } from '../domain/ids.js'
import type { Clock } from '../domain/time.js'
import type { StoredProposal } from '../suggestions/service.js'

/**
 * Simulatore: "cosa succederebbe", senza farlo accadere (specifica §18, §25).
 *
 * `DryRunExecutor` è l'UNICA implementazione di `ExecutionPort` in questa
 * release. Non possiede token HA né client di comando: riceve un piano e uno
 * snapshot immutabile, lavora su una COPIA dello stato e restituisce un
 * report. Non modifica la proiezione live, non diventa evidenza di
 * comportamento umano e non incrementa i successi del miner.
 */

export interface ExecutionPort {
  readonly physical_effects: false
  simulate(input: {
    proposal_id: string
    proposal_revision: number
    context_snapshot_id: string
    plan_hash: string
    seed: number
  }): Promise<{
    report_id: string
    status: 'simulated' | 'failed' | 'blocked'
    physical_effects: false
    external_notifications: false
    reason_codes: string[]
  }>
}

export interface DryRunDeps {
  clock: Clock
  proposal: (proposalId: string) => StoredProposal | null
  snapshot: (snapshotId: string) => HomeContext | null
  /** Entità su cui un'automazione esistente ha agito di recente (ridondanza). */
  automationTargets: () => Set<string>
  save: (report: SimulationReport) => void
}

const SATISFIED: Record<string, string[]> = { on: ['on'], off: ['off'], open: ['open'], close: ['closed'], play: ['playing'], pause: ['paused'] }

export class DryRunExecutor implements ExecutionPort {
  readonly physical_effects = false as const
  constructor(private readonly deps: DryRunDeps) {}

  async simulate(input: { proposal_id: string; proposal_revision: number; context_snapshot_id: string; plan_hash: string; seed: number; inject_failure?: boolean }) {
    const report = this.run(input)
    this.deps.save(report)
    return { report_id: report.report_id, status: report.status, physical_effects: false as const, external_notifications: false as const, reason_codes: report.reason_codes }
  }

  run(input: { proposal_id: string; proposal_revision: number; context_snapshot_id: string; plan_hash: string; seed: number; inject_failure?: boolean }): SimulationReport {
    const proposal = this.deps.proposal(input.proposal_id)
    const snapshot = this.deps.snapshot(input.context_snapshot_id)
    const base = {
      report_id: newId('sim'),
      proposal_id: input.proposal_id,
      proposal_revision: input.proposal_revision,
      context_snapshot_id: input.context_snapshot_id,
      plan_hash: input.plan_hash,
      seed: input.seed,
      physical_effects: false as const,
      external_notifications: false as const,
      created_at: this.deps.clock.now().toISOString(),
    }
    if (!proposal || proposal.revision !== input.proposal_revision || proposal.plan_hash !== input.plan_hash) {
      return { ...base, status: 'blocked', steps: [], risk: proposal?.risk ?? 'information', uncertainty: ['Piano cambiato o non trovato.'], reason_codes: ['PLAN_MISMATCH'] }
    }
    if (!snapshot) {
      return { ...base, status: 'blocked', steps: [], risk: proposal.risk, uncertainty: ['Contesto non più disponibile.'], reason_codes: ['STALE_CONTEXT'] }
    }
    // Copia dello stato: il namespace simulato non tocca mai quello reale.
    const simulated = new Map(snapshot.states.map((s) => [s.entity_id, { ...s.value, attributes: { ...s.value.attributes } }]))
    const random = seededRandom(input.seed)
    const failAt = input.inject_failure && proposal.steps.length ? Math.floor(random() * proposal.steps.length) : -1
    const automation = this.deps.automationTargets()
    const steps: SimulationReport['steps'] = []
    const uncertainty: string[] = ['Il simulatore non conosce i tempi reali di risposta dei dispositivi.']
    let failed = false
    proposal.steps.forEach((step, index) => {
      if (failed) { steps.push({ step_id: step.step_id, outcome: 'not_reached', diff: {}, note: 'Non eseguito nella simulazione: il passo precedente è fallito.' }); return }
      if (index === failAt) {
        failed = true
        steps.push({ step_id: step.step_id, outcome: 'simulated_failure', diff: {}, note: 'Guasto simulato (seed riproducibile). Un rollback fisico non è garantito: alcuni dispositivi non hanno un’azione inversa sicura.' })
        return
      }
      if (step.capability_key === 'reminder.show') {
        steps.push({ step_id: step.step_id, outcome: 'would_apply', diff: { promemoria: 'visibile nell’inbox locale' }, note: 'Solo inbox locale: nessuna notifica esterna.' })
        return
      }
      const action = String(step.desired.action ?? '')
      const diff: Record<string, string | number | boolean | null> = {}
      let outcome: SimulationReport['steps'][number]['outcome'] = 'would_apply'
      let note = ''
      for (const target of step.target_entity_ids) {
        const state = simulated.get(target)
        if (!state || state.availability !== 'available') { outcome = 'precondition_missing'; note = `Stato di ${target} non disponibile nello snapshot.`; continue }
        if (automation.has(target)) { outcome = 'redundant_automation'; note = `Un’automazione esistente agisce già su ${target}.` }
        const satisfiedBy = SATISFIED[action]
        if (satisfiedBy && state.state !== null && satisfiedBy.includes(state.state) && outcome === 'would_apply') {
          outcome = 'already_satisfied'; note = `${target} risulta già nello stato richiesto.`; continue
        }
        const nextState = action === 'on' ? 'on' : action === 'off' ? 'off' : action === 'open' ? 'open' : action === 'close' ? 'closed' : state.state
        diff[target] = `${state.state ?? 'sconosciuto'} → ${nextState ?? 'invariato'}`
        simulated.set(target, { ...state, state: nextState })
      }
      steps.push({ step_id: step.step_id, outcome, diff, note: note || 'Passo applicabile nello stato simulato.' })
    })
    if (snapshot.open_gaps.length) uncertainty.push('Lo snapshot ha intervalli di copertura incompleta.')
    return {
      ...base,
      status: failed ? 'failed' : 'simulated',
      steps,
      risk: proposal.risk,
      uncertainty,
      reason_codes: failed ? ['SIMULATED_FAILURE'] : ['DRY_RUN_ONLY'],
    }
  }
}
