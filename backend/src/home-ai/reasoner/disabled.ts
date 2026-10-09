import type { Proposal } from '../domain/contracts.js'
import { CoreError } from '../domain/errors.js'

/**
 * Predisposizione del futuro motore locale (specifica §25). SOLO interfaccia
 * e implementazione disabilitata: nessun download, nessuna chiamata a modelli,
 * nessun ramo dormiente attivabile con una variabile d'ambiente. Il futuro
 * reasoner riceverà contesto ridotto e produrrà proposte che passeranno dalle
 * stesse policy indipendenti.
 */

export interface ReasonerPort {
  capabilities(): { available: boolean; structured_output: boolean; local_only: boolean }
  propose(input: {
    schema_version: 1
    request_id: string
    context_snapshot_id: string
    minimized_context: Record<string, unknown>
    allowed_candidate_kinds: Proposal['kind'][]
    deadline_at: string
  }): Promise<Proposal[]>
}

export class DisabledReasoner implements ReasonerPort {
  capabilities() { return { available: false, structured_output: false, local_only: true } }
  // Stessa firma del contratto: chi chiama con un input valido riceve un rifiuto esplicito, mai un modello.
  async propose(input: Parameters<ReasonerPort['propose']>[0]): Promise<Proposal[]> {
    void input
    throw new CoreError('REASONER_NOT_CONFIGURED', 'Nessun motore di ragionamento configurato: gli agenti deterministici restano attivi.')
  }
}
