# HOME AI CORE — Memoria di S.I.M.I.

Modulo locale che **osserva in sola lettura**, **impara abitudini statistiche** e **propone**. Non comanda la casa: in questa release nessuna modalità, ruolo, variabile d'ambiente o parametro API può accendere un dispositivo, chiamare un servizio di Home Assistant, pubblicare eventi/MQTT o inviare notifiche.

Stato della release: **impalcatura verificata in demo**. Non è stata verificata nella casa reale né sul tablet fisico (vedi [verification.md](verification.md)).

| Documento | Contenuto |
|---|---|
| [baseline.md](baseline.md) | Lettura del progetto esistente e mappa della casa |
| [adr.md](adr.md) | Decisioni tecniche e alternative scartate |
| [architecture.md](architecture.md) | Moduli, porte, flussi, separazione lettura/esecuzione |
| [privacy.md](privacy.md) | Consensi, scope, retention, oblio, backup |
| [policies.md](policies.md) | Precedenze, DSL, reason code, lifecycle delle proposte |
| [learning.md](learning.md) | Opportunità, supporto, soglie, copertura, limiti statistici |
| [waste-calendar.md](waste-calendar.md) | Calendario raccolta: configurazione, import ICS, eccezioni, approvazione |
| [operations.md](operations.md) | Avvio, stop, backup/restore, recupero, risorse misurate |
| [future-local-llm.md](future-local-llm.md) | Manuale della casa e contratto del futuro reasoner locale (disabilitato) |
| [verification.md](verification.md) | Matrice T01–T52 con esito, prova e limiti |
| [acceptance.md](acceptance.md) | Checklist di accettazione con evidenze |
| [config.example.json](config.example.json) | Configurazione d'esempio (senza segreti) |

Gli schemi JSON (Draft 2020-12) dei contratti sono in [`schemas/home-ai/`](../../schemas/home-ai), generati dagli stessi oggetti che validano API, archivio e fixture.

## Avvio della demo (senza token, HA o Internet)

```bash
npm install && npm --prefix backend install
npm run dev:all              # backend :3001 + vite :5173
# apri http://localhost:5173/memoria
```

Al primo avvio il core crea `backend/data/home-ai.sqlite` con la configurazione predefinita (`runtime.demo: true`, modalità `shadow`) e riproduce **14+ giorni di attività sintetica** (`fixtures/demo-home.ts`, dataset `demo-home-v1`) con orologio controllato: rientri, controesempi, eventi duplicati e fuori ordine, automazioni esistenti, un calendario dell'organico dimostrativo e previsioni sintetiche. Tutto è marcato `demo` e separato dai dati reali.

Richiede Node **≥ 22.13** (`node:sqlite` senza flag; verificato qui con Node 22.22); l’immagine Docker usa Node 24. Con una versione più vecchia il core si mette in stato *disattivo* e la dashboard continua a funzionare.

In produzione (add-on/container) il core vive accanto al database della dashboard: `/data/home-ai.sqlite`, backup in `/data/home-ai-backups/`, chiave dei backup in `/data/home-ai-backup.key`.

## Configurazione reale in sola lettura

Dalla regia: **Memoria → Impostazioni e privacy**.

1. Disattiva *Usa la demo con dati sintetici*.
2. Attiva *Leggi da Home Assistant (sola lettura)*: il core riusa il ponte già autenticato della dashboard (nessuna seconda connessione, nessun token nel browser).
3. Seleziona le entità da osservare (opt-in; scorciatoia *Usa i dispositivi attivi della dashboard*) e assegna i ruoli *Presenza*, *Porta d'ingresso*, *Finestra*.
4. **Salva**, poi dai i consensi separati: *Osservazione* (registrare eventi), *Apprendimento* (cercare abitudini), *Profili personali* (separare per persona). Senza consenso nulla viene registrato o appreso.
5. Calendario della raccolta: **Raccolta differenziata** → regole o import ICS → anteprima → approva.

La modalità resta `shadow` (diagnostica) finché non scegli `Suggerimenti`; in nessun caso le proposte diventano comandi.

## Stop e disattivazione

- `HOME_AI_CORE=off` nell'ambiente del backend: il core non parte, la dashboard è invariata.
- Fermare il backend ferma anche il core (stesso processo, job a tempo `unref`).
- *Dimentica tutto* (Impostazioni e privacy) cancella eventi e derivati lasciando tombstone; *Rimuovi i dati demo* pulisce solo la demo.

## Risoluzione problemi

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| "HOME AI CORE non è attivo" | Node senza `node:sqlite`, archivio non apribile, configurazione salvata non valida, `HOME_AI_CORE=off` | Vedi **Stato del sistema** e i log `[home-ai]` |
| Avvio rifiutato | Variabili `HOME_AI_PHYSICAL*`, `HOME_AI_EXECUT*`, `HOME_AI_LLM*`… presenti | Rimuoverle: non esiste un valore che abiliti effetti reali |
| Copertura "parziale" | Gap nel ponte HA (disconnessioni) | Normale dopo un riavvio di HA; le finestre con gap non contano come successi/insuccessi |
| Nessuna abitudine | Cold start, consenso apprendimento spento, soglie non raggiunte | Vedi **Abitudini**: ogni ipotesi riporta il motivo |
| Promemoria assenti | Calendario in bozza, scaduto o zona mancante | **Raccolta differenziata** mostra lo stato e la richiesta di verifica |
| Stato "degradato" | Disco pieno o database non scrivibile | La dashboard manuale continua; liberare spazio e riavviare |
