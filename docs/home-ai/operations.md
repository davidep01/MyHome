# Operatività

## Supervisione

Il core gira **nello stesso processo** del backend MyHome (add-on HA o container Docker non privilegiato, utente non-root, volume `/data`). Non serve un servizio aggiuntivo. Avvio: dopo che il server HTTP è in ascolto; un errore del core viene registrato (`[home-ai] …`, testo redatto) e lascia la dashboard intatta.

| Variabile | Effetto |
|---|---|
| `HOME_AI_CORE=off` | Il core non parte |
| `HOME_AI_DB_PATH` | Percorso dell'archivio (default: accanto a `MYHOME_DB_PATH`, `home-ai.sqlite`) |
| `HOME_AI_PHYSICAL*`, `HOME_AI_EXECUT*`, `HOME_AI_ACTUATOR*`, `HOME_AI_AUTONOM*`, `HOME_AI_NOTIFY*`, `HOME_AI_NOTIFICATION*`, `HOME_AI_REASONER*`, `HOME_AI_LLM*`, `HOME_AI_MODEL*` | **Avvio rifiutato** (qualunque valore diverso da vuoto/`disabled`/`false`) |

Job: tick ogni 15 s (consumer dell'outbox, transizioni dei rientri, promemoria, revisione agenti ogni 15 min, forecast ogni 30 min, mining ogni 6 h o a episodio chiuso, retention una volta al giorno). Timer `unref`: non trattengono il processo.

## Health e diagnostica

`GET /api/home-ai/v1/status` (vista **Stato del sistema**) distingue:

| Voce | Valori |
|---|---|
| Servizio | `running` / `degraded` (archivio non scrivibile) |
| Sorgente HA | `reachable` / `unreachable` / `not_configured` / `disabled` (demo) |
| Copertura | `complete` / `partial` (gap aperti) / `unknown` |
| Learner | `active` / `stopped_no_consent` / `demo_only` |
| Calendario | `approved` / `draft` / `expired` / `conflict` / `not_configured` |
| Forecast | `available` (valido) / `unavailable` |
| Reasoner | `not_configured` (stato previsto, non incidente) |
| Esecuzione fisica | `disabled` (sempre) |
| Backup | ultimo creato vs ultimo ripristino verificato |

Metriche aggregate (solo regia): ingeriti, duplicati, quarantena, tombstone, degradi, tick, durata ultimo tick, decisioni per esito. Nessuna label con nomi, coordinate, token o payload.

## Backup e ripristino

- **Crea**: Stato del sistema → *Crea backup* (`VACUUM INTO` → `integrity_check` → AES-256-GCM). File in `home-ai-backups/`, chiave in `home-ai-backup.key` (fuori dalla cartella, `0600`). Rotazione 7.
- **Ripristina**: *Ripristina* su una copia. Sequenza: decifra e verifica → salva il database corrente a parte → ferma il core → sostituisce l'archivio → riapre → **riapplica le tombstone** → riprende i job.
- Perdere la chiave rende i backup illeggibili: includerla nel backup di sistema dell'add-on (`/data`) ma mai nella stessa cartella dei backup del core.

## Recupero

- **HA offline**: memoria, calendario locale e diagnostica restano consultabili; nuove inferenze su stati non disponibili sono rinviate (`STALE_OR_MISSING_DATA`). Al ritorno: snapshot delle sole differenze (`delivery: snapshot`), **gap dichiarato**, nessun rientro inventato, nessun avviso scaduto riprodotto.
- **Crash fra inserimento e consumer**: l'evento è nell'outbox; al riavvio i consumer ripartono dal checkpoint, senza perdita né duplicazione (deduplica per chiave naturale).
- **Disco pieno / archivio non scrivibile**: stato `degraded` esplicito, il core smette di registrare; i comandi manuali della dashboard non passano dal core e continuano a funzionare.
- **Configurazione salvata non valida**: avvio rifiutato con motivo; la configurazione non viene "corretta" in silenzio.

## Migrazioni e rollback

Migrazioni versionate e transazionali in `storage/db.ts` (tabella `schema_migrations`). Prima di un aggiornamento dell'add-on creare un backup dalla regia. Rollback della release: reinstallare la versione precedente dell'add-on; un archivio con una versione di schema più recente di quella conosciuta viene rifiutato (il core resta disattivo) invece di essere riscritto. In quel caso, con il core fermo, la vista di ripristino non è disponibile: ripristinare il backup di sistema dell'add-on (cartella `/data`) creato prima dell'aggiornamento, oppure spostare `home-ai.sqlite` per ripartire da un archivio vuoto.

## Risorse misurate

Profilo di prova (2026-10-08, container di sviluppo, **non** il server domestico): Node v22.22.0, 4 vCPU Intel Xeon 2,10 GHz, 15,7 GB RAM, archivio su file.

| Prova | Risultato |
|---|---|
| Catalogo | 1.000 entità selezionate |
| Burst | 3.000 eventi `state.changed` (equivalenti a 60 s a 50 ev/s), ingeriti e consumati uno per uno |
| Throughput | ~730 eventi/s sostenuti |
| Latenza ingest + consumer | p50 1,0 ms · p95 2,7 ms · p99 11,0 ms · max 16,5 ms |
| Coda residua | 0 |
| Costruzione del contesto (1.000 stati) | 46 ms |
| Memoria | +19,5 MB RSS |

Obiettivi della specifica (p95 < 500 ms, contesto < 2 s, burst 50 ev/s senza perdita) **raggiunti sul profilo di prova**. Non sono stati misurati sull'hardware della casa (Raspberry/mini-PC dell'add-on): ripetere la misura lì prima di considerarli validi.
