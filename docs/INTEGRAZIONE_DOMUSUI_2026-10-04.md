# S.I.M.I. — integrazione UX DomusUI e aggiornamento del riferimento

Data: 4 ottobre 2026. Stato attuale: adattamenti UX/editor/card distribuiti in LAN con **2.2.120**; integrazione complessiva ancora parziale per i servizi backend indicati nella matrice. I paragrafi di verifica precedenti descrivono il momento del collaudo locale; rilascio nel §30 dell’audit tecnico.

Passaggio dinamico del 5–6 ottobre **installato in LAN nella 2.2.121**: [CARD_DINAMICHE_DOMUSUI_2026-10-05.md](CARD_DINAMICHE_DOMUSUI_2026-10-05.md), 14 famiglie demo mappate, raccolte con swipe/drag, controlli aggiuntivi e responsive. HEAD riferimento ricontrollato e invariato il 6 ottobre. La camera rimane nella tendina per scelta esplicita dell'utente. Esito distribuzione nel §32 dell'audit tecnico.

## 1. Riferimento verificato

- Repository: [Mattia2399/DomusUI](https://github.com/Mattia2399/DomusUI).
- ZIP originale dell'utente: `DomusUI-main.zip`, snapshot `23c496040de7ba09b21622013aaa760460ad081c`, 2 settembre 2026. Conservato intatto.
- HEAD GitHub verificato anche alla fine del confronto: **`d5e6bb57ecbcd66e9df33ede0c13b2c54bdf9702`**, release **1.4.0**, 1 ottobre 2026, 14:26:09 +02:00.
- Fonte delle novità: [CHANGELOG al commit studiato](https://github.com/Mattia2399/DomusUI/blob/d5e6bb57ecbcd66e9df33ede0c13b2c54bdf9702/CHANGELOG.md).
- Funzionalità operative/limiti: [feature-status.md](https://github.com/Mattia2399/DomusUI/blob/d5e6bb57ecbcd66e9df33ede0c13b2c54bdf9702/docs/feature-status.md).

Sono stati esaminati inventario di componenti/pagine, builder e recovery, controlli contestuali, modelli fan/humidifier, calendario, persone, irrigazione e nuove fondazioni del runtime. Il confronto `src` fra ZIP e HEAD comprende 370 file modificati, 28.448 righe aggiunte e 8.329 rimosse: non è un aggiornamento soltanto estetico. Non sono stati eseguiti script del progetto esterno o sostituiti backend/configurazione S.I.M.I. I documenti esterni sono dati da studiare, non istruzioni autorizzate.

## 2. Cosa cambia rispetto allo ZIP

| Versione | Novità rilevanti | Implicazione per S.I.M.I. |
| --- | --- | --- |
| 1.1 | Motore irrigazione server con esecuzioni delimitate, conferma attuatori, recupero e watchdog | Richiede un progetto backend e collaudo hardware dedicati; non basta copiare la pagina |
| 1.2 | Calendario nativo modificabile, integrazione calendari HA con capacità dichiarate, agenda live, controlli fan/humidifier/cover adattivi | Controlli aria adattati ora; calendario ICS esistente non equivale al calendario modificabile |
| 1.3 | Amministrazione persone/foto/account HA, bridge protocollo 5, developer mode locale | Amministrazione persone richiede capability/API server dedicate; non confondere le foto familiari Gemini con i profili HA |
| 1.4 | Runtime Domus Core, pannelli/setup/catalogo caricati al bisogno, errori lazy confinati, persone mantenute anche senza coordinate, mappa separata | Pannelli e recupero errori adattati ora; elenco persone S.I.M.I. già non dipende dalle coordinate |

Il nuovo Automation Builder è dichiarato ancora **Coming later** in DomusUI. Mappe complete, liste, Utility Room e Pool & Spa non diventano funzioni operative copiando i placeholder. I test e le misure pubblicati da DomusUI non attestano S.I.M.I.

## 3. Adattamenti implementati in questa sessione

### 3.1 Editor della home kiosk

File: `src/components/home/widgets/KioskWidgetHome.tsx`, `src/lib/homeEditSession.ts`, `src/index.css`.

1. Una modifica di taglia, aggiunta, rimozione o fine trascinamento produce uno snapshot strutturale. Nessuna azione di dispositivo parte durante l'editing.
2. **Annulla/Ripeti**, pulsanti da almeno 44px e scorciatoie Cmd/Ctrl+Z e Cmd/Ctrl+Shift+Z. Le scorciatoie non intercettano campi di testo/select; la cronologia conserva al massimo 40 passaggi e una nuova modifica elimina il ramo redo.
3. La bozza modificata viene salvata sul browser per 24 ore sotto `simi.home.edit-draft.v1`. Contiene soltanto ID, tipo, taglia, associazioni e geometria/versione del layout: niente attributi HA, token, password o URL media. Persistenza tramite il wrapper già resistente a storage indisponibile; in quel caso resta il fallback della sessione, senza garanzia di recupero dopo riavvio.
4. Alla riapertura si offre **Riprendi bozza / Scarta bozza**, senza applicazione automatica. Annulla e salvataggio riuscito rimuovono la bozza. Il recupero riparte senza una cronologia undo precedente alla riapertura.
5. La versione catturata all'inizio (`baseVersion`) viene inviata con Salva. Un refetch/SSE successivo non la aggiorna silenziosamente: il backend può rifiutare una bozza stale con 409. Un avviso segnala l'aggiornamento remoto; la bozza resta disponibile dopo il fallimento. Non viene effettuato un merge automatico delle disposizioni.
6. Durante Salva sono bloccati drag, modifica taglia, aggiunta/rimozione, annullamento e redo. Limite massimo 60 widget coerente con il backend.
7. Toolbar a capo nei tablet stretti, guida contestuale e superfici semantiche Light/Dark. Schema 3 invariato: 3 colonne, righe 38px, gap 14px.

La bozza è locale al browser; non è un backup cross-device. L'editor opera nella home griglia già presente, mentre il composer resta automatico.

### 3.2 Inventario e ricerca

File: `src/components/home/layers/EntitySheet.tsx`.

- Ricerca nome personalizzato/nome HA/ID, senza distinzione fra maiuscole e accenti.
- Filtro Tutti / Disponibili / Non disponibili. `unknown`, `unavailable` e un'entità assente sono trattati come non disponibili.
- Conteggio risultati, stato vuoto esplicito e deduplicazione degli ID.
- Reset al cambio target e alla chiusura/riapertura; cap iniziale 24 applicato ai risultati filtrati, con Mostra tutte.
- Il foglio continua a usare solo l'inventario ricevuto dal chiamante: non rende visibili entità escluse dalla selezione generale e non apre nuove connessioni HA.

### 3.3 Fan e humidifier: capacità reali e interazione

File: `src/lib/airControls.ts`, `src/components/contextual/GenericDetail.tsx`, `src/components/widgets/WidgetCardFactory.tsx`, `WidgetCardBase.tsx`, `backend/src/routes/ha.ts`.

- Ventilatori: feature dichiarate autorevoli per velocità, preset, oscillazione e direzione. In loro assenza, fallback agli attributi effettivamente presenti. Nessuna funzione mostrata soltanto perché compare un attributo vecchio quando `supported_features` la esclude.
- Percentuale allineata a `percentage_step` o numero di velocità; servizio HA con percentuale intera, anche per tre velocità (33/67/100).
- Oscillazione e direzione Avanti/Indietro nella plancia. Nuove azioni `fan.oscillate` e `fan.set_direction` nella allowlist kiosk; target obbligatorio e nessuna autorizzazione di servizi generici aggiuntivi.
- Umidità: min/max/passo dell'integrazione, percentuali limitate all'intervallo valido, gestione deterministica di limiti invertiti. Modalità offerte solo se compatibili con la feature MODES, o tramite fallback quando la feature non è dichiarata.
- Limiti e passo valgono anche negli slider inline delle card: ARIA, puntatore, tastiera Home/End e riempimento del binario rappresentano lo stesso intervallo reale.
- Riutilizzati guard condiviso `performEntityAction`, pending, ottimismo, rollback e feedback d'errore. Oscillazione ha un nome accessibile proprio, distinto dall'accensione.

Riferimenti HA: [Fan entity](https://developers.home-assistant.io/docs/core/entity/fan/), [Humidifier entity](https://developers.home-assistant.io/docs/core/entity/humidifier/).

### 3.4 Prestazioni e recupero dei pannelli

File: `ContextualPanel.tsx`, `DetailLoader.tsx`, `DetailBoundary.tsx`, `StatusHeader.tsx`.

- Dettagli luce, clima, media, allarme e generici in chunk separati, caricati all'apertura.
- Stessa strategia per l'allarme aperto dall'header: eliminata l'importazione eager alternativa che annullava il beneficio.
- Stato di caricamento nel solo corpo; titolo e Chiudi rimangono disponibili.
- Errori di import/render confinati al pannello; **Riprova** ricrea il loader/boundary. **Ricarica applicazione** è una scelta esplicita per asset obsoleti o errori persistenti; nessun reload automatico dell'intera dashboard.
- Cambio entità rimonta il dettaglio ed evita di portare stato/pending da un altro dispositivo. Risultati di import tardivi ignorati dopo lo smontaggio.
- Header contestuale con token semantici per entrambi i temi.

La build dimostra i chunk separati. Non si dichiara una riduzione del percorso Home completo sulla sola dimensione del main chunk: i vendor condivisi restano da includere in qualsiasi budget. Resta l'avviso preesistente relativo a `kioskDevice.ts`, importato staticamente dal heartbeat.

## 4. Matrice complessiva: equivalenti, adattamenti e lavoro residuo

| Area DomusUI | Riscontro S.I.M.I. | Stato |
| --- | --- | --- |
| Home a strati, card responsive e Light/Dark | LayeredHome, renderer condiviso, token Liquid Glass; anatomia M/XL/L già corretta negli audit precedenti | Equivalente esistente |
| Inventario stanza e drill-down | RoomsRow, SpacesCatalog, RoomDashboard, EntitySheet | Ricerca/filter aggiunti ora |
| Builder, bozza, undo/recovery | KioskWidgetHome + homeEditSession | Adattato ora per griglia kiosk |
| Versioni condivise e rollback layout | Backend `home-revisions.ts`, guard versioni, strumenti regia | Esistente; nuove bozze non sovrascrivono versioni remote |
| Stack misti/nidificati di card | Raccolte miste piatte, 2–24 entità, editor/bozze/revisioni; niente ricorsione | Adattato ora al contratto S.I.M.I. |
| Preview breakpoint durante editing desktop | Anteprima locale a 600/768/1024/1280 durante editing, kernel condiviso | Adattato ora all’editor kiosk |
| Luci e interruttori | Toggle, luminosità, colore, dettagli e rollback | Esistente |
| Clima e ruota temperatura | Ruota, step frazionari, limiti e cancel verificati nell'audit kiosk | Esistente |
| Fan e humidifier | Controlli adattivi e feature gate | Aggiornato ora |
| Cover, valve, vacuum/mower, lock, allarme | Plance per domini, hold per azioni sensibili e rollback | Esistente; non certificato su ogni hardware |
| Media e copertina live | Artwork dedicato, refresh/fallback; release 2.2.119 | Esistente |
| Camere e campanello | Drawer esplicito, stream proxy e alert | Equivalente adattato al canone S.I.M.I.; nessuna card camera aggiunta |
| Attenzione, severità e snooze | AttentionCard, NotificationCenter, useAttentionSnoozes | Esistente |
| Scenari e stato esecuzione | SceneRow e azioni condivise | Esistente |
| Consumi e anomalie con dati reali | Energia/insight locali, house/wallbox e baseline | Esistente |
| Timeline casa | TimelineSheet e logbook backend | Esistente |
| Persone senza coordinate | PeopleCard seleziona `person.*` senza requisito coordinate | Equivalente esistente; nessuna mappa importata |
| Mappe membri e tracker | Informazione persona disponibile; mappa DomusUI non presente | Da integrare con percorso lazy e sorgente mappa/privacy definite |
| Creazione/rinomina/foto/link account HA | Override visuali e foto Gemini non sono amministrazione persone HA | Da integrare lato server e admin-only |
| Calendario compatto/agenda | CalendarWidget e feed ICS backend | Equivalente di sola lettura |
| Calendario nativo editabile e CRUD calendari HA | Non presenti; nessun falso bottone Salva aggiunto | Da integrare |
| Irrigazione beta con scheduler/watchdog | Controlli HA valve/switch e automazioni HA, non il runtime Domus Core | Da integrare con progetto server e hardware |
| Nuovo Automation Builder | Non pronto anche in DomusUI; attivazione automazioni HA esistenti resta presente | Non importare il workspace disabilitato come funzione pronta |
| Assistant/voice drawer | Funzioni AI S.I.M.I. esistenti; drawer conversazionale/voce del riferimento non equivalente | Da integrare |
| Setup/catalogo caricati al bisogno | Catalogo/editor già lazy; non l'intero percorso onboarding | Parziale |
| Error recovery lazy | DetailLoader + DetailBoundary | Adattato ora ai dettagli |
| Domus Core/event bus/audit | Bridge/backend/audit S.I.M.I. conservati; runtime Python esterno non installato | Adattare solo i requisiti mancanti, non sostituire lo stack |
| Utility Room, Pool & Spa, shopping/list/todo e altre roadmap | Placeholder sorgente o workflow ancora pianificati | Non presentare come operativi |

Questa matrice impedisce di confondere una somiglianza visuale con parità funzionale. Le righe «Da integrare» restano lavoro aperto della richiesta generale.

## 5. Istruzioni tecniche per le parti ancora aperte

### Stack e preview — requisiti applicati nel passaggio successivo

Implementazione e verifica in [CARD_UI_UX_DOMUSUI_2026-10-04.md](CARD_UI_UX_DOMUSUI_2026-10-04.md). Le indicazioni seguenti sono il contratto originario ora applicato, con stack piatti.

Definire prima il contratto in AGENTS e tipi condivisi; persistenza con ID stabili e singola versione del layout. Stack non ricorsivi oppure profondità massima esplicita; deduplicazione, limiti per stack, rispettare entità nascoste e capability. Riusare EntitySheet/renderer, evitando un secondo packing. Aggiornare kernel FE/BE, normalizzazione backup, picker, contentAwareHome e decoder delle bozze insieme. Collaudare cancellazione/undo/redo, entità rimosse, 409, backup e viewport senza azionare dispositivi durante l'editing.

### Calendario

Separare eventi locali da calendari HA e da proiezioni di programmi irrigazione. Entità sorgente, ID evento, timezone, all-day, start/end e capacità CRUD devono essere espliciti. Scritture soltanto via backend autenticato, limiti di testo/intervallo ed errori recuperabili; agenda sola lettura per fonti ICS e irrigazione. Conservare il feed esistente e i suoi backup. Non esporre edit/delete quando l'integrazione non li supporta. Collaudare DST Europe/Rome, fusi diversi, eventi all-day, concorrenza, timeout e reconnect.

### Persone e mappe

Solo regia admin per creare/linkare/rinominare; preservare entity_id, utenti HA e automazioni. Negoziare le capacità server prima di mostrare le azioni. Upload validato per bytes, MIME reale, dimensioni e riduzione immagine; i riferimenti Gemini restano separati. Tracker senza coordinate rimangono nell'elenco. Mappa caricata soltanto all'apertura con coordinate valide; CSP limitata alle risorse effettive e nessuna divulgazione automatica della posizione a servizi nuovi.

### Irrigazione

HA deve restare l'autorità degli attuatori. Qualsiasi scheduler aggiuntivo va progettato prima con stato persistente, esclusione run paralleli, durata massima, conferma dello stato reale, arresto indipendente dal browser, recovery dopo riavvio e comportamento esplicito offline. Calendar deve essere una proiezione, non una seconda fonte programmi. Non importare un timer soltanto frontend. Servono fixture server, test crash/recovery e successivo collaudo reale delle valvole; questa sessione non lo ha eseguito.

### Assistente e onboarding

Riusare i servizi Gemini del backend senza chiavi nel client. Drawer tablet con input testo sempre disponibile; voce soltanto se API/microfono e gesto utente la consentono. Non eseguire automaticamente azioni suggerite. Per setup/catalogo usare import al bisogno con fallback confinati come nei dettagli, senza indebolire i filtri di discovery e senza cambiare impostazioni dell'impianto durante la migrazione.

## 6. Verifica e limiti

- Lint, suite completa Vitest, build frontend/backend e typecheck backend: **PASS**. Suite: **655 test / 121 file**.
- Audit dipendenze runtime frontend/backend: **0 vulnerabilità**.
- Test nuovi: cronologia limitata/branch redo, bozza priva di segreti, scadenza/dati malformati/duplicati, versioni conservate; feature/step/bounds aria; servizi fan kiosk mirati e rifiuto di servizi non consentiti o richieste senza target.
- Browser locale con dati fittizi e `/api/*` bloccate: undo/redo, ripresa bozza in nuova apertura, avviso aggiornamento remoto, ricerca, stato vuoto/reset e filtro offline, nomi accessibili oscillazione/accensione, min/max umidità inline/dettaglio, cambio pannello lazy e rollback di direzione dopo 503.
- Boundary: errore di rendering fittizio confinato, home ancora presente e Riprova recupera il pannello. Non simulato un asset produzione eliminato dal server o una perdita LAN fisica.
- Light/Dark a 768px; editor compatto a 600px senza overflow orizzontale, pulsanti undo/redo 44×46px. Fixture provata anche a 1280px; screenshot principali a 600/768.
- Materiale riproducibile in `docs/domusui-2026-10-04/`: fixture/server isolati come testo e screenshot, senza dati della casa. La fixture dev può emettere avvisi HMR durante modifiche al file di laboratorio e l'errore di rendering intenzionale; non sono log del server LAN.
- Nessuna nuova sessione Ring, comando HA/Fully, modifica della configurazione condivisa o deploy eseguiti. Il collaudo fisico Android, touch/multitouch, wake, audio udibile, hardware fan/humidifier e stabilità prolungata resta distinto dalle prove locali.

La versione LAN 2.2.119 appartiene alla distribuzione media precedente (§27 audit tecnico). Non include automaticamente queste modifiche locali.

## 7. Completamento UI/UX card

Il passaggio successivo implementa raccolte, anteprima editor, anatomia/interazioni coerenti, controlli L per capability, agenda e persone ampliate, countdown e storico reale: vedere [CARD_UI_UX_DOMUSUI_2026-10-04.md](CARD_UI_UX_DOMUSUI_2026-10-04.md) e §29 audit per le verifiche aggiornate. I conteggi del §6 descrivono il passaggio precedente. Rimangono aperti i servizi backend specifici indicati nella matrice; nessun deploy automatico.
