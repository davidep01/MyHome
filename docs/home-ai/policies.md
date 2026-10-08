# Policy, conflitti, lifecycle

Il policy engine (`policy/engine.ts`) è l'**unico** punto che decide se un candidato può diventare visibile. È deterministico, ha clock iniettato e una precedenza fissa. Nessun esito autorizza un comando fisico.

## Precedenza

| # | Livello | Esiti e reason code |
|---|---|---|
| 1 | Barriera della release | `physical_execution !== 'disabled'` → `reject` `PHYSICAL_EXECUTION_DISABLED` (irraggiungibile per schema; resta come difesa) |
| 2 | Consenso e scope | `LEARNING_CONSENT_MISSING`, `PERSONAL_SCOPE_NOT_ALLOWED` → `reject` |
| 3 | Validità dei dati | fatti richiesti obsoleti/mancanti → `STALE_OR_MISSING_DATA`; candidato scaduto → `EXPIRED` |
| 4 | Preferenze esplicite, ospiti, quiete | `NEVER_SUGGEST`, `GUEST_MODE` (solo candidati appresi), `ALREADY_SAVED_AS_PREFERENCE` → `reject`; `QUIET_HOURS` → `defer` (salvo urgenza alta) |
| 4b | Regole utente (DSL) | esito della regola: `defer` \| `reject` \| `simulate_only` con il suo `reason_code` |
| 5 | Budget di attenzione | `ATTENTION_BUDGET_EXHAUSTED`, `TOPIC_COOLDOWN` → `defer` (i promemoria hanno budget proprio) |
| 6 | Utilità | punteggio pesato sotto `min_score` → `LOW_UTILITY` |
| 7 | Modalità | `observe` → `MODE_OBSERVE` (reject); `shadow` → `MODE_SHADOW` (`simulate_only`, visibile solo in diagnostica); `suggest` → `allow_local` (`SUGGESTION_ALLOWED` / `REMINDER_ALLOWED`) |

Punteggio: `utility·w₁ + imminenza·w₂ + supporto·w₃ − costo_attenzione·w₄ − incertezza·w₅` con pesi espliciti in configurazione (`policy.weights`).

Una **preferenza esplicita prevale sempre** su un'abitudine inferita (T35): `never_suggest` sul tema o sull'abitudine blocca la proposta; una routine già salvata non viene riproposta.

## DSL delle regole utente

Le regole sono **dati**, non codice. Operatori ammessi: `all`, `any`, `not`, `eq`, `in`, `range` (unità `ratio` | `count` | `weekday`), `time_window` (`HH:MM`). Profondità ≤ 4, ≤ 10 figli per nodo, ≤ 50 regole. Fatti chiusi:

`context.daypart`, `context.occupancy`, `context.guests`, `context.quiet_hours`, `context.weekday`, `context.mode`, `candidate.agent_key`, `candidate.kind`, `candidate.risk`, `candidate.topic`, `candidate.urgency`, `candidate.utility`.

```json
[{
  "rule_id": "no-weekend-mattina",
  "description": "Niente suggerimenti di routine il sabato e la domenica mattina",
  "when": { "all": [
    { "eq": { "fact": "candidate.kind", "value": "preference" } },
    { "in": { "fact": "context.weekday", "values": [6, 7] } },
    { "time_window": { "from": "06:00", "until": "11:00" } }
  ]},
  "outcome": "defer",
  "reason_code": "WEEKEND_MORNING"
}]
```

Le regole utente vengono valutate **dopo** le precedenze inderogabili (1–4): non possono riattivare ciò che consenso, privacy o quiete bloccano.

## Arbitraggio

Prima della policy, `policy/arbiter.ts`:

- stessa proposta (stesso piano prospettico) da più agenti → **una** proposta con evidenze e motivazioni aggregate (`MERGED_DUPLICATE`, T33); routine diverse dello stesso agente restano distinte;
- una routine salvata come preferenza esplicita scarta il candidato appreso che la contraddice sulla stessa risorsa (T35);
- proposte opposte sulla stessa risorsa (`on/off`, `open/close`, `play/pause`) → si tiene la più supportata e il conflitto è **esplicitato** nella spiegazione (`CONFLICT_LOWER_SUPPORT`, T34).

## Lifecycle delle proposte

```
candidate → policy_checked → visible
visible → dismissed | snoozed | preference_saved | simulation_authorized
simulation_authorized → simulated | simulation_failed
candidate / visible / snoozed → expired | superseded | withdrawn
```

- `preference_saved` **non** è "eseguito"; `simulated` **non** è "avvenuto in casa".
- Revisione + `plan_hash` (hash canonico di passi, tipo, tema, occorrenza, abitudine): un piano modificato invalida le approvazioni precedenti (`REVISION_CONFLICT`, T38).
- Approvazioni: `save_preference` (salva una routine come preferenza) o `simulate_once` (autorizza **una** simulazione, consumata all'uso).
- Feedback: `not_useful`, `wrong_context`, `snooze`, `never_suggest`, `forget`, `done`. Sul feedback di una proposta di routine si registra anche il feedback sull'abitudine d'origine.
- Isteresi meteo: una proposta meteo si ritira solo quando la condizione è chiaramente finita (finestra chiusa e disponibile, o previsione non più valida).

## Reason code principali

Ingestione: `SCHEMA_INVALID`, `SCHEMA_UNSUPPORTED`, `PAYLOAD_TOO_LARGE`, `EVENT_ID_CONFLICT`, `LATE_EVENT`, `CLOCK_SKEW`.
Attribuzione: `DASHBOARD_GESTURE`, `MANUAL_PATH_RESULT`, `EFFECT_OF_DASHBOARD_OPERATION`, `HA_USER_ID_ONLY`, `HA_PARENT_CONTEXT`, `NO_ORIGIN_EVIDENCE`, `SHARED_DEVICE`, `ADMIN_DEVICE`.
Apprendimento: `COLD_START`, `FEW_OPPORTUNITIES`, `FEW_SUCCESSES`, `FEW_DISTINCT_DAYS`, `LOW_COVERAGE`, `LOW_FREQUENCY`, `LOW_WILSON`, `NO_CONTEXT_ADVANTAGE`, `TEMPORAL_VALIDATION_PASSED|FAILED`, `NOT_YET_VERIFIED_IN_TIME`, `THRESHOLDS_MET`, `DECAYED`, `NO_LONGER_OBSERVED`, `USER_SUPPRESSED`.
Calendario: `CALENDAR_NOT_CONFIGURED`, `CALENDAR_NOT_APPROVED`, `CALENDAR_EXPIRED`, `AREA_MISSING`, `MUNICIPALITY_MISSING`, `EXCEPTION_WITHOUT_OCCURRENCE`, `RECURRENCE_UNSUPPORTED`, `DEMO_CALENDAR`.
Proposte: `USER_SNOOZED`, `USER_DONE`, `NOT_USEFUL`, `WRONG_CONTEXT`, `FORGET_REQUESTED`, `PREFERENCE_SAVED`, `SIMULATION_AUTHORIZED`, `SIMULATED`, `SIMULATION_FAILED`, `CONDITION_RESOLVED`, `FORECAST_NO_LONGER_VALID`.
