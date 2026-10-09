# Futuro reasoner locale (non attivo)

In questa release **non esiste** alcun modello: nessun download, nessuna chiamata, nessun ramo dormiente attivabile. L'unica implementazione è `DisabledReasoner` (`reasoner/disabled.ts`): `capabilities()` → `{ available: false, structured_output: false, local_only: true }`, `propose()` → errore `REASONER_NOT_CONFIGURED`. Gli agenti deterministici funzionano senza (T42).

## Il manuale della casa: la conoscenza del modello

Un modello locale piccolo (7–14B) ha poco contesto e della casa non sa nulla: senza una base di fatti inventa. Il **Manuale della casa** (Memoria → Manuale della casa, `backend/src/home-ai/knowledge/`) è quella base, pronta prima del modello.

- **Due livelli.** Fatti *generati* dallo stato del core a ogni lettura (casa, stanze, dispositivi, abitudini confermate con i numeri, preferenze esplicite, calendario della raccolta, regole di attenzione, limiti del sistema) e *note tue* (ciò che i sensori non sanno). I generati non si salvano: non invecchiano, e ciò che viene dimenticato sparisce anche dal manuale.
- **Fatti piccoli e strutturati** (`knowledge-fact.v1`): `fact_id` stabile, tipo, fonte (`source.module` + `ref`), affidabilità (`certain` · `observed` · `declared` · `uncertain`), validità (`valid_from`/`valid_until`), scope (nucleo o persona), tag. Le ipotesi non confermate non entrano.
- **Selezione deterministica** (`knowledge/retrieve.ts`): punteggio additivo su tag (3), titolo (2), testo (1) ed entità (5), fatti scaduti esclusi, budget di caratteri (default 2.000, massimo 12.000), il limite "il sistema non comanda nulla" sempre per primo. Stessa domanda → stessa selezione. Nessun embedding in questa release: arriveranno con il modello, dietro lo stesso contratto.
- **Export** `GET /api/home-ai/v1/knowledge/export` → `{ format: 'home-ai-knowledge/v1', secrets_included: false, facts }`, già redatto. Prova della selezione: `GET /knowledge/search?q=…&budget=…` (vista "Cosa riceverebbe il modello").
- **Dati, non istruzioni.** Il manuale non contiene regole eseguibili né credenziali (una nota con un token o una password viene rifiutata). I limiti restano nel policy engine, che filtra anche le proposte del futuro modello.

Quando il modello verrà installato, `minimized_context` conterrà la selezione del manuale per la richiesta (`core.knowledgeSelection(...)`), più lo snapshot di contesto minimizzato.

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
- Il reasoner non riceve il gateway HA, credenziali o client di comando (test dei confini già attivi su `reasoner/` e `knowledge/`).
- Attivarlo richiederà una modifica di schema (`reasoner.adapter`), una nuova ADR e una richiesta esplicita: oggi variabili `HOME_AI_LLM*`/`HOME_AI_MODEL*`/`HOME_AI_REASONER*` **rifiutano l'avvio**.
