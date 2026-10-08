# Accettazione della release — HOME AI CORE

Esito: **impalcatura verificata in demo**. Non è "verificata nella casa reale": nessun test su Home Assistant reale né sul tablet fisico in questa consegna. Il calendario di fixture non valida il calendario del comune.

Legenda: ✅ dimostrato con evidenza · ⚠️ dimostrato in parte · ❌ non dimostrato.

| # | Criterio (§27) | Esito | Evidenza |
|---|---|---|---|
| 1 | Demo locale senza token, HA o Internet | ✅ | [README](README.md#avvio-della-demo-senza-token-ha-o-internet); T50 (`fetch` bloccato, demo completa); bundle `backend/dist` avviato con `HA_URL` irraggiungibile → core attivo in demo |
| 2 | Architettura letta, modifiche additive | ✅ | [baseline.md](baseline.md): elenco puntuale delle modifiche al codice esistente |
| 3 | Ingestione, outbox, proiezione dopo riavvio | ✅ | T46 (crash fra insert e consumer, archivio su file riaperto), T10, T47 |
| 4 | Retry/duplicati non gonfiano; intenzione/esito/effetto separati | ✅ | T01, T02, T03, T05, T09, T10 |
| 5 | Azioni manuali dei canali coperti registrate; lacune dichiarate | ⚠️ | T01–T09 su telemetria e feed; copertura dichiarata in **Stato del sistema**. Il mapping lato proxy (`recordManualResultFromProxy`) non è testato in isolamento (T04 parziale) |
| 6 | Eventi incerti/automazioni non diventano preferenze certe | ✅ | T06, T07, T08, T14 |
| 7 | Rientro della fixture → pattern spiegabile e controesempi | ✅ | T15 (8/10, evidenze per episodio), T17 |
| 8 | Cold start senza abitudini stabili; decadimento | ✅ | T19, T21 |
| 9 | Calendario configurabile senza codice (zona, fonte, validità) | ✅ | T22–T28; vista **Raccolta differenziata** (regole manuali + import ICS) |
| 10 | Raccolta, esposizione, reminder distinti; eccezioni e versioni riconciliate | ✅ | T22, T24, T28, test TEMPO |
| 11 | Forecast validi solo dove pertinenti; mancanti/scaduti senza certezza | ✅ | T29–T32 |
| 12 | Privacy, preferenze, quiet hours, budget, conflitti prima della pubblicazione | ✅ | T33–T36, T43, regressione "proposta che si mette in cooldown da sola" |
| 13 | Approvazioni = solo preferenze o simulazioni | ✅ | T37, T38 |
| 14 | Nessuna modalità/richiesta attiva comandi, eventi HA o notifiche | ✅ | T40, T41, test CONFINI (allowlist gateway, scansione degli import) |
| 15 | Simulazioni, demo e reale separati e indicati in UI | ✅ | T39; badge *Demo*/*Simulazione* (screenshot); timeline filtrata sul dataset attivo |
| 16 | Export, revoca, cancellazione includono i derivati (end-to-end) | ✅ | T43, T49, regressione "abitudine dimenticata non ricostruita" |
| 17 | Scope protetti su API, persistenza, stream; tablet condiviso | ✅ | T44, T14 |
| 18 | Backup e ripristino coerenti su archivio sintetico | ✅ | T49 (backup cifrato, oblio, ripristino, tombstone riapplicate) |
| 19 | Viste UI utilizzabili, accessibili, verificate alle dimensioni | ⚠️ | Screenshot Playwright light/dark a 390/768/1024/1440, nessun errore console né scroll orizzontale; target 44px. Nessun audit con screen reader |
| 20 | Reasoner disabilitato, nessun download o modello | ✅ | T42, [future-local-llm.md](future-local-llm.md) |
| 21 | Test, typecheck/lint, build passano; limiti dichiarati | ✅ | `npm run lint`, `npm test`, `npm run build:all`, `npm run --prefix backend typecheck` (vedi [verification.md](verification.md)) |
| 22 | Nessuno stub nelle componenti di questa fase | ⚠️ | L'agente *comfort* è una regola funzionante (clima in raffreddamento + finestra aperta), spenta di default. L'agente *energia* è un segnaposto dichiarato: senza obiettivi né tariffe configurabili in questa release non produce candidati (scritto in UI). Unico adapter futuro: `DisabledReasoner` |

## Fonti simulate in questa consegna

- Home Assistant: fixture `demo-home-v1` e adapter di lettura alimentati a mano nei test; gateway verificato contro `fetch` intercettato.
- Meteo: porta forecast sintetica (`demo-forecast`) e forecast costruiti nei test.
- Calendario: `demo-waste` e ICS scritti nei test.
- Tablet: browser headless Chromium, non Fully Kiosk su Android.

## Da fare per passare a "verificata nella casa reale"

1. Attivare la sola lettura su HA reale con entità selezionate e osservare almeno 14 giorni.
2. Confermare la copertura dichiarata (gesti dalla dashboard correlati a `context.id`).
3. Inserire il calendario reale del comune con zona e fonte, e approvarlo.
4. Ripetere la misura delle risorse sull'hardware dell'add-on.
