# ADR — HOME AI CORE

Formato: contesto → decisione → alternative scartate → conseguenze.

## ADR-001 · Monolite modulare dentro il backend esistente

- **Contesto.** MyHome ha già un backend Hono che possiede l'unica connessione autenticata a HA e serve la regia.
- **Decisione.** Il core è un modulo (`backend/src/home-ai/`) nello stesso processo, con archivio, router (`/api/home-ai/v1`) e job propri. Avvio isolato: un errore lo mette in stato *disattivo/degradato*, mai la dashboard.
- **Scartate.** Servizio separato (secondo container, seconda credenziale HA, più superficie); add-on HA dedicato (duplica il ponte).
- **Conseguenze.** Nessuna nuova credenziale; il core può solo *iscriversi* allo stream esistente. Il confine con il percorso comandi è garantito da import (test dei confini) e allowlist, non dal processo.

## ADR-002 · `node:sqlite` per l'archivio del core

- **Contesto.** Servono transazioni, indici, outbox con checkpoint, `VACUUM INTO` per backup coerenti; il JSON a documento unico della dashboard non regge eventi append-only.
- **Decisione.** SQLite integrato in Node (`node:sqlite`, WAL, `synchronous=NORMAL`), migrazioni versionate in `storage/db.ts`. Import con specificatore costruito a runtime perché il bundler non rimuova il prefisso `node:`.
- **Scartate.** `better-sqlite3` (dipendenza nativa da compilare per amd64/arm64 nell'immagine add-on); file JSON append-only (niente transazioni né indici); Postgres (sproporzionato per una casa).
- **Conseguenze.** Richiede Node ≥ 22.13 (immagine: Node 24). Su Node più vecchio il core resta disattivo con motivo esplicito.

## ADR-003 · Contratti come combinatori runtime che esportano JSON Schema

- **Decisione.** `domain/schema.ts` (combinatori minimi: `obj`, `tagged`, `refine`, …) definisce ogni contratto una volta; lo stesso oggetto valida API, record persistiti e fixture, ed esporta JSON Schema Draft 2020-12 in `schemas/home-ai/` (test di coerenza `__tests__/schemas.test.ts`). Oggetti chiusi (`additionalProperties: false`), versioni esplicite (`schema_version: 1`): un input di versione futura va in quarantena, non viene reinterpretato.
- **Scartate.** `zod`/`ajv` (nuove dipendenze; il progetto chiede di non aggiungerne senza necessità); tipi TS senza validazione runtime.

## ADR-004 · Configurazione JSON validata, non YAML

- **Contesto.** La specifica propone `config.example.yaml`.
- **Decisione.** La configurazione del core è un documento JSON versionato in archivio, modificato dalla regia (revisione attesa, 409 su conflitto) e validato dallo schema `core-config.v1`. L'esempio è `config.example.json`.
- **Scartate.** File YAML su disco: nuova dipendenza di parsing, secondo percorso di scrittura in conflitto con la UI, nessun controllo di revisione.
- **Conseguenze.** Valori pericolosi non sono rappresentabili: `physical_execution`, `external_notifications` e `reasoner.adapter` sono **letterali** `disabled`; `capture_audio/video` sono letterali `false`.

## ADR-005 · Nessun LLM in questa release

- **Decisione.** Pattern mining statistico deterministico; `DisabledReasoner` come unica implementazione della porta del reasoner. Nessun download, nessun ramo dormiente attivabile da env (le variabili `HOME_AI_LLM*`/`HOME_AI_MODEL*` rifiutano l'avvio).
- **Conseguenze.** Le spiegazioni sono template deterministici sui conteggi reali.

## ADR-006 · Unica `ExecutionPort` = simulatore

- **Decisione.** Non esiste un adapter di esecuzione reale. Le approvazioni hanno due soli scopi: `save_preference` e `simulate_once`. Il gateway HA è un'allowlist di sola lettura; il router blocca esplicitamente `/execute`, `/call-service`, `/fire-event`, `/publish-mqtt`, `/mqtt` (anche nelle varianti con `_`), `/ha/*`, `/services/*`, `/proxy/*` con `PHYSICAL_EXECUTION_DISABLED` e audit.

## ADR-007 · Calendari ICS con `node-ical` + sottoinsieme RRULE proprio

- **Decisione.** `node-ical` (già dipendenza del backend) per il parsing; espansione delle regole manuali con un sottoinsieme RRULE esplicito (`FREQ` DAILY/WEEKLY/MONTHLY, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `COUNT`, `UNTIL`, `WKST`) che rifiuta il resto (`RECURRENCE_UNSUPPORTED`) invece di indovinare.

## ADR-008 · Ora legale

- **Decisione.** Orario civile inesistente (salto in avanti) → primo istante valido successivo (`shifted_forward`) se ancora utile; orario ambiguo (ritorno all'ora solare) → **prima** occorrenza (`first_of_ambiguous`), un solo promemoria. La risoluzione è mostrata nell'anteprima (`dst_adjusted`).
