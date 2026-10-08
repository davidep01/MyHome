# Futuro reasoner locale (non attivo)

In questa release **non esiste** alcun modello: nessun download, nessuna chiamata, nessun ramo dormiente attivabile. L'unica implementazione è `DisabledReasoner` (`reasoner/disabled.ts`): `capabilities()` → `{ available: false, structured_output: false, local_only: true }`, `propose()` → errore `REASONER_NOT_CONFIGURED`. Gli agenti deterministici funzionano senza (T42).

## Contratto previsto (`ReasonerPort`)

```ts
interface ReasonerPort {
  capabilities(): { available: boolean; structured_output: boolean; local_only: boolean }
  propose(input: {
    schema_version: 1
    request_id: string
    context_snapshot_id: string
    minimized_context: Record<string, unknown>   // contesto ridotto, mai payload grezzi
    allowed_candidate_kinds: Proposal['kind'][]
    deadline_at: string
  }): Promise<Proposal[]>
}
```

## Vincoli per una release futura

- **Solo locale**: nessuna rete; la configurazione `reasoner.network_enabled` è oggi il letterale `false`.
- Le proposte del reasoner sono **candidati** come quelli degli agenti: passano dallo stesso arbitraggio e dallo stesso policy engine, con le stesse precedenze (consenso, privacy, quiete, budget). Il reasoner non può pubblicare né approvare.
- Output strutturato validato dagli schemi `proposal.v1`; testo libero non diventa mai un'azione.
- Il reasoner non riceve il gateway HA, credenziali o client di comando (test dei confini già attivi su `reasoner/`).
- Attivarlo richiederà una modifica di schema (`reasoner.adapter`), una nuova ADR e una richiesta esplicita: oggi variabili `HOME_AI_LLM*`/`HOME_AI_MODEL*`/`HOME_AI_REASONER*` **rifiutano l'avvio**.
