# Architettura

Monolite modulare in `backend/src/home-ai/`, montato su `/api/home-ai/v1`. Elaborazione guidata da eventi e job limitati (tick ogni 15 s): nessun ciclo che "ragiona" in continuo su tutta la casa.

```
            ┌───────────────── SOLA LETTURA ─────────────────┐
HA ──WS──▶ ponte MyHome (ha-ws/ha-stream) ──SSE interno──▶ adapters/ha-feed ─┐
HA ◀─GET── adapters/ha-gateway (allowlist: states, config, calendars)        │
                                                                              ▼
dashboard: click ──▶ /api/ha/services (comando ESISTENTE, invariato)   ingestion/
           │                 └─▶ recordManualResultFromProxy ──────────▶ normalize → event-log
           └──▶ /telemetry/manual-intents (canale separato) ──────────▶   (dedup, quarantena,
                                                                            outbox SQLite)
                                                                              │ consumer con checkpoint
                                     ┌────────────────────────────────────────┤
                                     ▼                                        ▼
                         context/projection (stato,                 episodes/arrival
                         gap, ordinamento per                       (macchina a stati
                         source_updated_at)                          dei rientri)
                                     │                                        │
                                     ▼                                        ▼
                         context/context (HomeContext,              learning/miner + patterns
                         snapshot versionati)                       (statistica, niente LLM)
                                     │                                        │
       waste/ (calendari, ICS,  ─────┼──── weather/ (forecast con validità) ──┤
       promemoria)                   ▼                                        │
                         agents/ (arrival, waste, weather, comfort, energy) ◀─┘
                                     │ candidati
                                     ▼
                         policy/arbiter → policy/engine (precedenze fisse)
                                     │ decisione
                                     ▼
                         suggestions/ (proposte, feedback, approvazioni circoscritte)
                                     │ simulate_once
                                     ▼
                         simulation/dry-run  ← UNICA ExecutionPort (nessun effetto)
```

## Moduli

| Modulo | Responsabilità | Non può |
|---|---|---|
| `domain/` | Contratti versionati (`contracts.ts`), combinatori di schema, tempo/DST, ID, redazione segreti, errori | — |
| `storage/` | SQLite (WAL), migrazioni, transazioni, degrado esplicito; backup cifrati | — |
| `ingestion/` | Validazione, minimizzazione, deduplica per chiave naturale, quarantena limitata, outbox; telemetria manuale | Reinviare comandi |
| `adapters/ha-feed` | Lettore dello stream del ponte; scarta le entità non selezionate prima della persistenza; gap su disconnessione | Aprire una seconda connessione |
| `adapters/ha-gateway` | Letture REST/WS ammesse da allowlist | `call_service`, `fire_event`, scritture, MQTT |
| `context/` | Proiezione dello stato, catalogo opt-in con ruoli, `HomeContext` e snapshot | — |
| `episodes/` | Rientri: assenza confermata → presenza stabile; correzione tardiva | Attribuire persone per coincidenza |
| `learning/` | Miner a sottosequenze ordinate, Wilson, baseline, decadimento, validazione temporale | Usare LLM |
| `waste/` | RRULE (sottoinsieme), ICS, eccezioni, revisioni, promemoria | Spostare raccolte per festività senza eccezione |
| `weather/` | Porte forecast (demo, OpenWeather esistente, nessuna) con TTL | Affermare previsioni scadute |
| `agents/` | Candidati deterministici puri | Importare client di comando o credenziali |
| `policy/` | Arbitraggio + decisione con precedenze fisse e DSL chiuso | Autorizzare esecuzioni |
| `suggestions/` | Lifecycle proposte, feedback, preferenze, approvazioni legate a `plan_hash` | — |
| `simulation/` | Dry-run deterministico su copia dello stato | Toccare HA |
| `reasoner/` | `DisabledReasoner` | Scaricare o chiamare modelli |
| `privacy/` | Consensi, export, oblio con tombstone, retention | — |
| `observability/` | Audit minimizzato e redatto | Registrare payload domestici |
| `api/` | Router Hono, ruoli, `Idempotency-Key` sulle mutazioni, barriera `/execute` & co. | — |

## Separazione lettura/esecuzione

1. **Allowlist** nel gateway: richieste fuori forma rifiutate prima dell'I/O.
2. **Letterali di configurazione**: `physical_execution: 'disabled'`, `external_notifications: 'disabled'`, `reasoner.adapter: 'disabled'` non hanno altri valori validi.
3. **Ambiente**: variabili `HOME_AI_PHYSICAL*`, `HOME_AI_EXECUT*`, `HOME_AI_NOTIFY*`, `HOME_AI_LLM*`, `HOME_AI_MODEL*`… rifiutano l'avvio.
4. **Router**: `/execute`, `/call-service`, `/call_service`, `/fire-event`, `/fire_event`, `/publish-mqtt`, `/publish_mqtt`, `/mqtt`, `/ha/*`, `/services/*`, `/proxy/*` (con sottopercorsi, qualunque metodo) → `PHYSICAL_EXECUTION_DISABLED` + audit.
5. **Import**: agenti, miner, simulatore, policy, proposte e reasoner non importano client di comando né credenziali (test `boundaries.test.ts`).
6. **Approvazioni**: scopi `save_preference` | `simulate_once`, legati a revisione e `plan_hash`.

## API (`/api/home-ai/v1`)

Lettura: `health`, `status`, `context` (ridotto per il tablet), `episodes`, `episodes/:id`, `patterns`, `patterns/:id/explain` (episodi e abitudini con scope *persona* solo per la regia con consenso ai profili), `suggestions`, `waste-calendar`, `preferences`, `coverage`, `reasoner`, `stream` (SSE di notifica, senza dati); solo regia: `events`, `simulations`, `privacy`, `privacy/delete/:jobId`, `audit`, `config`, `entities/candidates`, `backups`.

Mutazioni (header `Idempotency-Key` obbligatorio dove indicato in `routes.ts`): `telemetry/manual-intents`, `telemetry/manual-results`, `suggestions/:id/feedback`, `reminders/:id/feedback`; solo regia: `patterns/:id/feedback`, `suggestions/:id/approve`, `suggestions/:id/simulate`, `waste-calendar/import`, `waste-calendar/:id/approve`, `preferences/:id`, `privacy` (PATCH), `privacy/export`, `privacy/delete`, `config` (PUT, revisione attesa), `policy-rules`, `flags`, `demo/seed|clear`, `backups`, `backups/:id/restore`.

Il tablet (`kiosk`) vede proposte di nucleo e contesto ridotto; episodi e abitudini personali restano invisibili anche via API diretta (`FORBIDDEN_SCOPE`).

Errori: `{ error: { code, message, details } }` con codici chiusi: `VALIDATION_ERROR`, `FORBIDDEN_SCOPE`, `REVISION_CONFLICT`, `STALE_CONTEXT`, `CALENDAR_UNVERIFIED`, `SOURCE_UNAVAILABLE`, `PHYSICAL_EXECUTION_DISABLED`, `REASONER_NOT_CONFIGURED`, `NOT_FOUND`, `STORAGE_UNAVAILABLE`, `CORE_DISABLED`.

## Flusso della demo

`seedDemo()` costruisce il dataset sintetico, sostituisce il catalogo con le entità demo e riproduce gli eventi con orologio controllato (`CoreClock.override`): tick leggeri durante il replay (solo transizioni a tempo degli episodi), poi calendario demo approvato, mining e valutazione finale degli agenti. Gli eventi demo hanno `demo = 1` in ogni tabella.
