# S.I.M.I. — Audit tecnico e piano tassativo di correzione

Data: 1 ottobre 2026. Repository MyHome, base Git `7a95862` più modifiche locali non committate. Documento per lo sviluppatore: **69 interventi censiti**, correzioni già applicate da integrare e matrice di collaudo. Stato delle prime implementazioni: §18.

## 1. Stato e vincoli di consegna

L'audit comprende backend Hono, persistenza, configurazione, autenticazione, bridge HA e SSE, comandi kiosk, audio, backup, calendario, meteo, AI, temi, componenti modali, distribuzione e pipeline. Le evidenze sotto derivano dalla lettura del codice corrente; dove indicato sono state anche riprodotte. I test verdi non coprono automaticamente questi casi limite.

**Non riscrivere l'applicazione.** Conservare stack, persistenza a documento atomico e architettura HA con credenziali esclusivamente backend. Conservare autenticazione LAN disattivata per default e modalità autenticata esplicita. Mantenere camere nel drawer e dispositivi nella home secondo le regole di visibilità esistenti. Non alterare dati reali, configurazioni manuali o l'archivio preesistente `DomusUI-main.zip`.

Ogni modifica a un comando HA deve conservare aggiornamento ottimistico, rollback e feedback di errore. UI italiana, touch minimo 44×44, temi Light/Dark tramite token semantici. Nessun bump versione manuale concorrente con la CI.

Priorità:
- **P1:** integrità dei dati, affidabilità operativa del kiosk e conferme veritiere. Blocca l'approvazione della relativa funzione.
- **P2:** correttezza funzionale e resilienza. Da chiudere prima della consegna complessiva richiesta.
- **P3:** debito di strumenti/documentazione da chiudere o registrare con motivazione e responsabile.

Per chiudere un intervento servono codice, test mirati ai casi indicati e verifica del comportamento. Non è sufficiente eliminare il sintomo grafico o restituire HTTP 200.

## 2. Correzioni già presenti nella working tree

Queste patch sono locali, non sono un rilascio e vanno revisionate e integrate preservando le modifiche altrui.

| Area | Correzione applicata | Limite residuo |
|---|---|---|
| Configurazione allarme | `PUT /api/config` ora salva `alarm`; prima poteva rispondere 200 senza persistenza | Concorrenza generale: F11 |
| SSE HA | Evento esplicito di stato; recupero del poll anche senza cambiamenti; stato inviato al subscriber | Watchdog, risincronizzazione e recupero SSE: F03–F05 |
| Diagnostica bridge | Il poll aggiorna successo/errore nei dati diagnostici | Collaudare anche bridge idle e connessione registry senza subscriber |
| Config sync kiosk | Stream notifiche accessibile al kiosk autenticato, senza concedere lettura/export config admin; hook montato nel kiosk | Invalidazione registry: F06 |
| Avvio/container | Rispetto di `MYHOME_AUTH_MODE`; errore su valore invalido o required senza admin; Compose non impone required | Collaudo immagine finale |
| Import backup | Versione e timestamp home vengono assegnati localmente, senza adottare quelli importati; credenziali locali preservate | Semantica dei campi omessi: F16 |
| Foto allarme | Upload subordinato all'opzione foto; timestamp validato e anno limitato per compatibilità della retention | Validazione contenuto: F17 |
| Tema | Lettura iniziale della preferenza protetta da errori storage | Altri accessi storage: F10 |
| UI | Token semantici calendario e tooltip sidebar; testi tema chiariscono la preferenza locale | Modali e sensore: F25–F27 |
| Sviluppo audio | Proxy Vite per `/alarm-siren.wav` | Audio effettivo: F08–F09 e collaudo hardware |
| Dipendenze backend | Aggiornamenti compatibili di Hono, node-server e tsx nel lockfile | Advisory dev residuo: F31 |

Sono presenti nuovi test per avvio, foto, SSE client e tema, oltre agli aggiornamenti ai test backend esistenti. Non considerarli committati o installati sul tablet.

## 3. Interventi aperti: kiosk e connessione HA

### F01 — P1 — Stato offline assente nel kiosk
**Evidenza:** `src/components/layout/AppShell.tsx:198` monta `ConnectionOverlay` nel desktop; `KioskShell`, da riga 213, non lo monta. Gli stati conservati possono apparire ancora correnti al tablet.

**Correzione obbligatoria:** introdurre uno stato offline adatto al kiosk, con dati esplicitamente non aggiornati e disponibilità dei comandi coerente con la connessione. Non copiare pulsanti amministrativi del desktop. Coordinare priorità con allarmi, campanello e aggiornamento.

**Accettazione:** interrompere HA e backend separatamente nelle due home; verificare comparsa dello stato entro la soglia prevista, assenza di falsa conferma ai comandi e recupero automatico senza refresh.

### F02 — P1 — Aggiornamento add-on non gestito dalla shell kiosk
**Evidenza:** `AddonUpdateOverlay` è montato solo nel desktop (`AppShell.tsx:201`). La logica di attesa e ricaricamento associata non viene attivata dalla shell tablet.

**Correzione obbligatoria:** condividere il coordinamento dell'aggiornamento con il kiosk, mantenendo presentazione e priorità adatte al tablet. Ricaricare alla disponibilità della nuova versione, evitando loop e perdita silenziosa di modifiche non salvate.

**Accettazione:** simulare aggiornamento, arresto backend e ritorno con nuova build; il kiosk raggiunge la versione nuova senza intervento manuale. Provare anche fallimento e timeout.

### F03 — P1 — Stream aperto non equivale a dati disponibili
**Evidenza:** `src/api/ha-websocket.ts:211–247`: `ready` imposta `gotData` e annulla il fallback; gli errori successivi possono lasciare lo stato in connessione senza una scadenza di recupero.

**Correzione obbligatoria:** separare apertura del trasporto, salute HA e ricezione dati; aggiungere watchdog e recupero con backoff. Il solo `ready` non deve dimostrare che gli stati sono aggiornati. Gestire heartbeat e sospensione/ripresa del browser.

**Accettazione:** test ready senza snapshot, errore dopo uno stream sano, assenza prolungata di heartbeat e ritorno dal background. Nessuna attesa infinita né doppia connessione attiva.

### F04 — P1 — Fallback poll permanente e perdita del canale comandi
**Evidenza:** `toPoll()` chiude EventSource e passa a `connectHAProxy`; manca il ritorno automatico a SSE. Il poll degli stati non sostituisce tutti gli eventi di controllo, inclusi comandi kiosk e test campanello.

**Correzione obbligatoria:** riprovare SSE con backoff; effettuare il passaggio senza sovrascrivere dati nuovi con risposte poll vecchie. Segnalare esplicitamente l'indisponibilità del canale comandi quando il poll è forzato. Non riprodurre comandi distruttivi già eseguiti.

**Accettazione:** guasto SSE → poll → ripristino SSE; stati coerenti e un comando inviato dopo il recupero ricevuto una sola volta. Nessun falso successo durante il fallback.

### F05 — P1 — Risincronizzazione incompleta dopo reconnect
**Evidenza:** `backend/src/lib/ha-stream.ts`: il primo poll può produrre delta da una mappa vuota; la snapshot iniziale è condizionata a `snapshot.size > 0` (riga 407). Inoltre viene inviato lo stato `alarm-test` solo se attivo (riga 415).

**Correzione obbligatoria:** distinguere snapshot sconosciuta da snapshot valida vuota. Inviare una fotografia completa iniziale per ogni nuova generazione del bridge, anche con zero entità. Alla connessione idratare esplicitamente anche lo stato inattivo della simulazione allarme.

**Accettazione:** client con A+B, riavvio backend con sola A: B scompare; backend con zero entità: cache svuotata. Test allarme avviato, client disconnesso, test fermato, reconnect prima della scadenza: nessun allarme residuo.

### F06 — P2 — Registry della precedente connessione HA nella cache frontend
**Evidenza:** `src/hooks/useConfigSync.ts` invalida config/layout/feed ma non tutte le query registry/aree, fra cui `ha-area-index`, `ha-entity-registry-dashboard-curation` e `ha-entity-registry-platforms`.

**Correzione obbligatoria:** invalidare e isolare tutte le cache derivate da HA quando cambia la connessione. Preferire una generazione di connessione condivisa; ignorare risposte in volo della generazione precedente.

**Accettazione:** passare da HA A a HA B con stessi entity ID ma aree/categorie diverse; nessuna stanza, visibilità o associazione residua di A.

## 4. Comandi remoti e audio

### F07 — P1 — ACK non correlati: possibile successo riferito a un vecchio comando
**Evidenza:** `src/pages/SystemPage.tsx:150–157` attende 1200 ms e confronta `lastCommand` per nome; il protocollo non dispone di un identificatore univoco end-to-end.

**Correzione obbligatoria:** aggiungere `commandId`, destinazione, stato pending e scadenza server-side. Accettare ACK solo per il comando e dispositivo attesi; distinguere accettato, eseguito, fallito e timeout. Per invio multiplo riportare il risultato per dispositivo. Non considerare un `deviceId` dichiarato dal client prova autonoma dell'esecuzione.

**Accettazione:** due comandi identici consecutivi, dispositivo offline al secondo, ACK fuori ordine, duplicato o da altro dispositivo. Il secondo non può usare il successo del primo.

### F08 — P1 — Test audio e riavvio dichiarano successo troppo presto
**Evidenza:** `src/lib/kioskDevice.ts`: `audioTest` chiama una funzione asincrona indiretta senza attendere esito; `reload` naviga prima che il chiamante possa completare l'ACK. Anche il restart nativo può interrompere la richiesta.

**Correzione obbligatoria:** il canale audio deve restituire un risultato attendibile, con errori autoplay/canale mancante propagati. Per reload/restart registrare accettazione prima dell'azione e conferma dopo il nuovo avvio correlata a F07. Non chiamare “eseguito” ciò che è solo ricevuto.

**Accettazione:** `play()` rifiutato, audio non inizializzato, reload con rete lenta e restart nativo. L'interfaccia mostra lo stato corretto. L'audio udibile richiede separatamente prova fisica.

### F09 — P1 — Volume notifiche iniziale azzerato
**Stato al 1 ottobre 2026:** Implementato localmente; test automatici superati. Prova di audio udibile sul tablet pendente. Vedi §18.

**Evidenza riprodotta:** `src/lib/sound/SoundManager.ts:79` usa `Number(localStorage.getItem(VOL_KEY))`; una chiave assente restituisce null, convertito in zero. Istanza con storage vuoto: volume 0 invece del default 0,7.

**Correzione obbligatoria:** verificare l'assenza prima della conversione; conservare lo zero impostato intenzionalmente e scartare valori invalidi/fuori intervallo secondo una politica esplicita.

**Accettazione:** chiave assente → 0,7; stringa `0` → 0; valore invalido → default. Verificare notifiche/campanello e, separatamente, canale allarme.

### F10 — P1 — Storage browser indisponibile può interrompere inizializzazione e servizi
**Evidenza:** accessi non protetti in `SoundManager`, `src/lib/kioskDevice.ts`, `src/hooks/usePerfMode.ts`, `src/api/ha-websocket.ts`, `StatusHeader` e percorsi emergenza. La patch al tema copre solo una parte.

**Correzione obbligatoria:** adapter storage sicuro, compreso accesso al getter, parsing e scrittura. Prevedere fallback in memoria stabile per identità e preferenze; non rigenerare un device ID a ogni heartbeat. Evitare che persistenza opzionale blocchi connessione o allarme.

**Accettazione:** getter che lancia SecurityError, quota esaurita e JSON corrotto, sia al bootstrap sia durante azioni. App operativa, identità coerente nella sessione, errori non propagati al rendering.

## 5. Persistenza, configurazione e backup

### F11 — P1 — Lost update delle impostazioni non-home
**Stato al 2 ottobre 2026:** Implementato il 2 ottobre: configVersion obbligatoria e confronto atomico DB; coda frontend e rollback testati. Vedi §20.

**Evidenza:** `backend/src/routes/config.ts` sostituisce oggetti come kiosk/ai/alarm; il guard di versione riguarda il layout. Coda DB e spread del client non proteggono due browser che scrivono copie obsolete.

**Correzione obbligatoria:** introdurre versionamento della configurazione/sezione con confronto dentro la coda DB e 409, oppure patch atomiche validate per campo con semantica esplicita di cancellazione. Coordinare optimistic update e invalidazioni SSE affinché una risposta intermedia non cancelli lo stato pendente.

**Accettazione:** due client modificano campi diversi dello stesso oggetto: entrambi conservati o conflitto esplicito recuperabile; nessuna sovrascrittura silenziosa. Test anche errore e rollback della seconda scrittura accodata.

### F12 — P1 — Errori di permesso scambiati per corruzione DB
**Stato al 1 ottobre 2026:** Implementato localmente; fault injection su lettura e permessi superata. Vedi §18.

**Evidenza:** `backend/src/db/client.ts:77–92` racchiude lettura, parsing, validazione e chmod nello stesso catch che rinomina il file e crea default.

**Correzione obbligatoria:** distinguere corruzione strutturale da errori I/O/permessi. Un DB valido con errore chmod/read deve restare intatto e produrre stato storage non sano, senza reset automatico.

**Accettazione:** fault injection su lettura e chmod: nessuna rinomina `.corrupt`, nessuna scrittura dei default, health coerente. Il recupero del JSON realmente corrotto conserva comunque l'originale.

### F13 — P1 — Disco e memoria divergono se fallisce chmod dopo rename
**Stato al 1 ottobre 2026:** Implementato localmente; fault injection prima del commit e recupero verificati. Vedi §18.

**Evidenza:** `persistFile`, `backend/src/db/client.ts:131–135`, esegue rename e poi chmod; il chiamante ripristina la vecchia memoria su qualsiasi eccezione, anche dopo il commit su disco.

**Correzione obbligatoria:** applicare e verificare i permessi sul temporaneo prima del commit; definire un unico punto di commit. Gli errori successivi non devono simulare rollback del disco già avvenuto. Conservare il documento atomico esistente.

**Accettazione:** guasti prima e dopo rename: lettura in memoria e lettura dopo riavvio restituiscono la stessa versione confermata; nessun 200 su scrittura non persistita.

### F14 — P1 — Migrazione marcata completata prima della persistenza
**Stato al 1 ottobre 2026:** Implementato localmente; retry della migrazione dopo errore disco verificato. Vedi §18.

**Evidenza:** `backend/src/db/client.ts:138–140`: `migrated = true` precede le mutazioni e la scrittura finale.

**Correzione obbligatoria:** migrare su copia, pubblicare il risultato e il flag soltanto dopo commit riuscito. In caso di fallimento mantenere stato precedente e rendere possibile retry controllato o errore storage esplicito.

**Accettazione:** primo persist fallisce, secondo riesce: migrazione eseguita correttamente e una sola volta; nessuno stato parzialmente migrato servito come sano.

### F15 — P2 — Cronologia home ignora cambiamenti semantici
**Stato al 2 ottobre 2026:** Implementato: confronto semantico dei widget, riepilogo modifiche e conservazione dello snapshot precedente al primo edit. Test di ripristinabilità, copia indipendente e salvataggio identico.

**Evidenza riprodotta:** `backend/src/lib/home-revisions.ts:6–61` confronta aggiunte, rimozioni, geometria e ordine. Cambiare tipo/configurazione dello stesso widget con stessa posizione può essere classificato no-op. Si registra solo lo snapshot successivo.

**Correzione obbligatoria:** confrontare anche tipo, entity ID, titolo e configurazione significativa; ignorare solo metadati tecnici. Conservare lo stato precedente al primo edit per consentirne il ripristino. Adattare riepilogo e limite della cronologia.

**Accettazione:** modifiche solo titolo, entità o tipo generano revisione ripristinabile; primo edit reversibile; salvataggio realmente identico non genera rumore.

### F16 — P2 — Import backup con semantica di merge non dichiarata
**Evidenza:** `backend/src/routes/config.ts` combina config corrente e importata; campi opzionali assenti possono lasciare attive impostazioni della configurazione precedente.

**Correzione obbligatoria:** definire schema versionato e semantica del ripristino completo: campi mancanti normalizzati ai default previsti, mantenendo solo credenziali/parametri locali esplicitamente esclusi dal backup. Se si vuole supportare merge, deve essere un'operazione distinta e dichiarata. Rifiutare backup incompleti dove i campi sono obbligatori.

**Accettazione:** importare backup senza impostazioni opzionali sopra installazione che le possiede; risultato deterministico conforme allo schema, credenziali locali conservate, versione home locale incrementata. Test backup invalido senza scritture parziali.

## 6. Ingressi dati e integrazioni

### F17 — P2 — Upload foto accetta byte che non sono JPEG
**Evidenza:** `backend/src/routes/alarm.ts` verifica involucro base64 e dimensione, senza decodifica effettiva dell'immagine; anche una sequenza arbitraria di byte può superare i controlli.

**Correzione obbligatoria:** validare formato realmente decodificabile, dimensioni e limiti di risorse prima del salvataggio; non fidarsi del MIME dichiarato. Usare fixture JPEG reali nei test positivi.

**Accettazione:** JPEG valido accettato; buffer arbitrario, immagine troncata, formato dichiarato falso e dimensioni eccessive rifiutati senza creare file.

### F18 — P1 — Espansione calendario non limitata prima dell'allocazione
**Evidenza:** `backend/src/lib/calendar-feed.ts:63–96` espande ricorrenze e solo dopo ordina/taglia a MAX_EVENTS. La libreria materializza le occorrenze nell'intervallo: una frequenza molto elevata può creare una quantità enorme di istanze anche da un ICS piccolo.

**Correzione obbligatoria:** budget effettivo su complessità, numero di occorrenze e tempo di parsing/espansione. Un timeout tramite sola Promise sullo stesso event loop non interrompe un calcolo sincrono: isolare il lavoro interrompibile o usare un'espansione realmente limitata. Conservare disponibilità API durante un feed problematico.

**Accettazione:** fixture con ricorrenze ad alta frequenza interrotta/rifiutata entro limite; memoria limitata, health responsivo, errore calendario leggibile. Non provare carichi illimitati sul servizio reale.

### F19 — P2 — Limiti foto AI incoerenti e riferimenti omessi in silenzio
**Evidenza:** validazione consente un totale teorico di immagini superiore al body limit; `backend/src/routes/ai.ts:374–392` applica inoltre un budget aggregato separato e aggiunge il nome prima di sapere se invierà una foto.

**Correzione obbligatoria:** definire limiti individuali e aggregati condivisi fra UI, schema, upload e richiesta AI. Ogni persona dichiarata come riferimento deve avere foto effettivamente incluse; segnalare e impedire superamenti, senza scartare silenziosamente gli ultimi familiari.

**Accettazione:** massima configurazione ammessa salvabile e utilizzabile; sovralimite spiegato in UI; nessun nome senza riferimento per esaurimento budget. Test anche immagini singole invalide.

### F20 — P2 — Cache layout nasconde errori di autorizzazione e valida solo la versione
**Evidenza:** `src/hooks/useTabletLayout.ts:10–46`: schemaVersion 3 basta per il cast; qualsiasi errore fetch può essere convertito in successo usando cache.

**Correzione obbligatoria:** validare struttura e contenuto del layout; fallback solo per indisponibilità temporanea consentita. Propagare 401/403 e gestire invalidazione su logout/cambio identità. Mostrare chiaramente dati offline/cache.

**Accettazione:** cache malformata non causa crash; rete offline usa cache valida; 401/403 non diventano successo; cambio installazione non mostra layout precedente come attuale.

### F21 — P2 — Previsioni raggruppate nel fuso del server
**Evidenza:** `backend/src/routes/weather.ts:226` usa `Date.toDateString()` sui timestamp del provider, quindi il giorno dipende dal fuso del processo.

**Correzione obbligatoria:** raggruppare e mostrare secondo il fuso della località meteo, con una politica esplicita coerente anche sui cambi d'ora. Non assumere che il container abbia il fuso del tablet.

**Accettazione:** server UTC, località italiana e località in altro fuso; campioni attorno a mezzanotte e cambio ora assegnati al giorno corretto.

## 7. Stato visualizzato, tema e accessibilità

### F22 — P2 — Climatizzatore in pausa segnalato come riscaldamento attivo
**Stato al 2 ottobre 2026:** Implementato il 2 ottobre: derivazione HVAC condivisa tra riepilogo e card; idle non risulta attivo. Test per pausa e riscaldamento.

**Evidenza:** `src/hooks/useRoomsOverview.ts:67–71` usa azione heating oppure modalità heat. La modalità resta heat anche con `hvac_action=idle`; controllare anche il mapping visuale clima per evitare criteri divergenti.

**Correzione obbligatoria:** quando presente e valido, hvac_action determina l'attività; modalità come fallback solo in assenza di azione. Centralizzare la derivazione usata da riepiloghi e card.

**Accettazione:** heat+idle → in pausa; heat+heating → riscaldamento attivo; modalità senza attributo → fallback documentato. Stessa risposta in chip, catalogo e card.

### F23 — P2 — Temperatura mancante convertita a zero e unità ambigue
**Stato al 2 ottobre 2026:** Implementato il 2 ottobre nei riepiloghi: valori null/vuoti esclusi, zero reale conservato, unità °C/°F/K esplicite; valori senza unità nota omessi. Resta da estendere la preferenza di conversione globale dove necessaria.

**Evidenza:** `useRoomsOverview.ts` converte `current_temperature` con Number; null diventa 0. I riepiloghi, incluso SpacesCatalog, visualizzano il valore senza garantire unità coerente con HA.

**Correzione obbligatoria:** distinguere assente/non valido da zero reale. Trasportare unità con il valore e convertire solo secondo una preferenza implementata esplicitamente. Non etichettare implicitamente °F come °C.

**Accettazione:** null e stringa vuota → dato assente; zero reale preservato; sensori °C e °F visualizzati correttamente, senza medie fra unità diverse.

### F24 — P2 — Calendario aggiornato dal fetch, non dal tempo corrente
**Stato al 2 ottobre 2026:** Implementato il 2 ottobre: calendario derivato dal clock locale, tick al minuto e aggiornamento al ritorno dal background senza nuovo fetch.

**Evidenza:** `src/components/home/widgets/CalendarWidget.tsx:37–39` usa dataUpdatedAt come “adesso”; tra due fetch può mostrare come futuro un evento già iniziato o mantenere uno terminato.

**Correzione obbligatoria:** usare un clock locale con aggiornamento al minuto o alle scadenze rilevanti, senza richieste di rete aggiuntive. Ricalcolare al ritorno dal background.

**Accettazione:** con rete ferma e dati validi in cache, oltrepassare inizio/fine evento e mezzanotte; etichette e filtro cambiano entro la soglia prevista.

### F25 — P2 — Modali sovrapposte senza coordinamento del focus
**Evidenza:** `src/components/glass/GlassSheet.tsx:75–104` installa per ogni sheet un listener document per Escape e focus trap. Senza stack condiviso più sheet aperte possono reagire allo stesso evento.

**Correzione obbligatoria:** solo la modale in cima gestisce Escape e Tab; rendere inerte lo sfondo appropriato e ripristinare focus nel livello padre alla chiusura. Preservare il drill-down previsto dal catalogo.

**Accettazione:** due sheet aperte: Escape chiude solo la superiore; Tab non raggiunge né fondo né sheet sottostante; chiusura finale restituisce focus al trigger originale. Verifica touch e tastiera.

### F26 — P2 — Chiusura sheet sotto il target touch minimo
**Evidenza:** `GlassSheet.tsx:186`: bottone `h-9 w-9`, quindi 36×36, senza estensione della hit area. Lo stesso controllo contiene neutri hardcoded.

**Correzione obbligatoria:** hit area almeno 44×44, focus visibile e token semantici in entrambe le appearance. Controllare gli altri pulsanti dello stesso componente senza introdurre sovrapposizioni delle aree cliccabili.

**Accettazione:** misura effettiva in browser, attivazione ai bordi del target, contrasto e focus Light/Dark; nessuna regressione nelle dimensioni tablet.

### F27 — P2 — Tema automatico senza fallback se il sensore non produce letture
**Evidenza:** `src/hooks/useAutoTheme.ts`: nel ramo sensore disponibile non viene applicato un fallback iniziale né un timeout per mancata lettura; illuminance non finita non viene scartata esplicitamente.

**Correzione obbligatoria:** inizializzare coerentemente tema applicato e store; seguire la preferenza di sistema fino alla prima misura valida, con timeout e cleanup. Validare lux finiti e mantenere isteresi/debounce.

**Accettazione:** sensore presente ma silenzioso, NaN, errore permessi e passaggio manuale→auto; nessun flash persistente o stato UI diverso dalla classe applicata. Verificare sia sistema chiaro sia scuro.

## 8. Distribuzione, toolchain e contratto tecnico

### F28 — P1 — Asset JavaScript mancante restituisce la SPA con HTTP 200
**Evidenza riprodotta:** richiesta locale a `/assets/audit-missing-chunk.js`: 200, Content-Type text/html, corpo index.html. `backend/src/index.ts:38` esclude dal fallback solo i percorsi `/api/`. Durante il controllo browser è stato anche osservato un caricamento di vecchio chunk fallito dopo rebuild; reload ha recuperato.

**Correzione obbligatoria:** fallback SPA riservato alle navigazioni documento previste; asset mancanti restituiscono 404, API sconosciute JSON404 incluso `/api` esatto. Gestire chunk obsoleti con recupero controllato e limitato, proteggendo form non salvati; non ricaricare in loop su qualsiasi eccezione.

**Accettazione:** deep-link valido → SPA; JS/CSS inesistente → 404 corretto; API inesistente → JSON404. Sessione aperta prima del deploy recuperabile dopo deploy, senza loop né perdita silenziosa di editing.

### F29 — P1 — Pubblicazione immagine e commit manifest possono divergere
**Evidenza:** `.github/workflows/docker.yml:95` esegue push del commit di versione su main dopo pubblicazione. La serializzazione dei workflow non impedisce nuovi commit umani su main: il push può fallire non-fast-forward quando l'immagine è già pubblicata.

**Correzione obbligatoria:** aggiornare il manifest su base fresca con retry sicuro e controllo della versione associata, senza force push né sovrascrittura di cambi altrui. Definire ordine e recupero della pubblicazione affinché manifest add-on e immagine versionata restino coerenti anche su errore parziale.

**Accettazione:** due commit ravvicinati e avanzamento di main durante build; nessun commit perso, manifest che punta all'immagine attesa, failure recuperabile documentata.

### F30 — P2 — Gate sull'immagine realmente distribuita insufficiente
**Evidenza:** CI usa Node 24, immagine runtime Node 22. Questo è un gap di verifica, non una prova di incompatibilità attuale.

**Correzione obbligatoria:** allineare la versione supportata o verificare esplicitamente quella runtime. Aggiungere smoke test dell'immagine finale con storage persistente e autenticazione nelle modalità previste, oltre ai test sorgente. Verificare manifest delle architetture pubblicate.

**Accettazione:** avvio, health, riavvio con dati conservati, permessi non-root, auth disabled/required e SPA/API nell'immagine; prova delle architetture dichiarate con infrastruttura adeguata.

### F31 — P3 — Advisory basso nella toolchain backend
**Evidenza:** audit runtime frontend/backend puliti; audit backend completo segnala un solo advisory low su esbuild della toolchain di sviluppo. Non classificarlo come vulnerabilità runtime dell'app distribuita.

**Correzione obbligatoria:** cercare aggiornamento compatibile del proprietario della dipendenza e rieseguire build/test; evitare override forzati non verificati. Se non disponibile, registrare advisory, ambito, mitigazione e scadenza di rivalutazione.

**Accettazione:** audit completo pulito oppure eccezione documentata e circoscritta; audit runtime resta pulito.

### F32 — P3 — Contratto configurazione e documentazione da riallineare
**Evidenza:** campi come forceCelsius/advancedMode sono presenti in contratto/persistenza senza comportamento frontend corrispondente rilevato; documentazione storica descrive geometrie e componenti poi evoluti.

**Correzione obbligatoria:** censire ogni setting: controllo UI o API, default, validazione, persistenza, proiezione kiosk, consumer e test. Implementare i campi promessi oppure deprecarli esplicitamente con compatibilità; non aggiungere toggle privi di effetto. Riallineare AGENTS e DESIGN_SYSTEM allo stato finale senza cancellare intenzionalmente compatibilità legacy.

**Accettazione:** tabella di tracciabilità completa; ogni setting attivo ha consumer verificato e prova save→read→effetto. Nessun conflitto fra geometria documentata e kernel effettivo.

## 9. Sequenza consigliata di implementazione

1. **Integrità:** F11–F14 e F16. Prima proteggere scritture e ripristino; test con fault injection e client concorrenti.
2. **Affidabilità kiosk:** F03–F08, F01–F02, F09–F10. Definire prima contratto stream e commandId, poi UI.
3. **Ingressi e rilascio:** F18, F17, F19–F20, F28–F30.
4. **Correttezza visuale/dati:** F06 se non già chiuso, F15, F21–F27.
5. **Chiusura:** F31–F32, verifica completa e collaudo tablet.

Consegnare modifiche piccole e revisionabili per gruppo, evitando un unico refactor trasversale. Ogni commit deve dichiarare gli ID chiusi e i test aggiunti. Una correzione che dipende da una prova hardware resta “implementata, collaudo pendente”.

## 10. Verifiche eseguite sullo snapshot dell'audit

| Verifica | Esito |
|---|---|
| `npm run lint` | PASS |
| `npm test` | PASS: 92 file, 482 test |
| `npm run build:all` | PASS frontend e backend |
| `npm run --prefix backend typecheck` | PASS |
| `npm audit --omit=dev` | 0 vulnerabilità |
| `npm audit --prefix backend --omit=dev` | 0 vulnerabilità |
| Audit backend completo | 1 low, sviluppo: F31 |
| Browser locale con HA sintetico | Controllo Funzioni/Sistema e appearance; non collaudo hardware |
| Riproduzioni mirate | Volume iniziale zero; revisione semantica ignorata; asset mancante HTML200 |

I controlli passano **nonostante** i difetti descritti: occorre estendere la copertura ai casi di accettazione. Nessun deploy o comando a dispositivi HA reali è stato effettuato per questo audit.

## 11. Matrice tassativa prima della consegna finale

- **Configurazione:** ogni sezione salvata, riletta dopo reload e restart, propagata ad almeno due client; errori e conflitti visibili. Nessun dato manuale perso.
- **Auth:** disabled e required; admin/kiosk; API, stream, media e backup; logout/sessione scaduta; nessun segreto nel bundle o nella proiezione kiosk.
- **HA:** snapshot vuota e popolata, delta/rimozione, reconnect breve e lungo, restart backend/HA, fallback e ritorno SSE, cambio installazione, browser sospeso. Nessuna duplicazione delle connessioni o degli effetti.
- **Comandi:** successo, errore HA, timeout, click ripetuti, rollback; ACK correlati; allarmi/campanelli senza falsi successi o replay involontari.
- **Storage:** filesystem non scrivibile, permessi, fallimenti di scrittura/migrazione, backup corrotto e valido, retention foto. Usare directory isolate e fault injection, mai dati reali.
- **Grafica:** Light/Dark, portrait/landscape, viewport reali del tablet e desktop; modali annidate, overflow, tastiera/focus, target44px, contrasto, reduced-motion e perf-lite. Usare screenshot per provare il risultato visivo.
- **Fully Kiosk reale:** suono udibile e sblocco autoplay, wake/presenza, luminosità, schermo off/on, riavvio, rete persa/ritrovata, sensore luce; prova prolungata per memoria, animazioni e riconnessioni.
- **Camere:** HLS/MJPEG/snapshot, indisponibilità, scadenza URL, apertura/chiusura drawer e campanello vero. Evitare regressioni della scelta di non montarle nella home.
- **Feed/AI:** timeout, payload invalido o grande, ricorrenze, fusi orari, assenza chiavi, rate limit e budget immagini; fallback espliciti e nessun blocco generale.
- **Rilascio:** immagine finale, versione manifest, restart con persistenza e client aperto con chunk vecchi. Verificare l'installazione effettiva prima di dichiarare il rilascio riuscito.

## 12. Formato richiesto per il ritorno dello sviluppatore

Per ciascun F01–F69 riportare: stato (aperto/implementato/verificato), commit, file modificati, prova del caso originario, test automatico e risultato, verifica browser o hardware quando richiesta. Segnalare dipendenze e deviazioni motivate dal fix prescritto prima di dichiarare chiuso il punto.

La chiusura della lista certifica i casi verificati su quella versione; non costituisce garanzia astratta di assenza di qualsiasi bug.

## 13. Approfondimento kiosk tablet, video e funzionamento continuativo

Integrazione del 1 ottobre 2026 su richiesta dell'utente. **F33–F57 aggiungono 25 interventi** ai precedenti. In questa integrazione è stato aggiornato soltanto questo documento: i fix sotto sono prescrizioni da implementare, non correzioni già eseguite.

Metodo: controllo del codice attualmente presente, delle catene asincrone e dei relativi consumer. Le evidenze del §13 sono **statiche**: non sono prove di guasto osservato sul tablet fisico. Il codice corrente contiene un signaling WebRTC backend: le vecchie note che lo descrivono come interamente assente sono superate. L'audio bidirezionale resta una funzione distinta, non dimostrata dal video funzionante.

### F33 — P1 — Listener WebRTC residui possono attribuire un frame HLS alla sessione sbagliata
**Evidenza:** `src/components/widgets/CameraStream.tsx`, `startWebRtc`, registra `loadeddata` e `playing` con `firstFrame`; `stopWebRtc` chiude peer/sessione ma non rimuove questi listener. Il video DOM viene riutilizzato per HLS. Il callback precedente può quindi impostare `settled` e `mode='webrtc'` su un frame del fallback, oppure impedire la corretta conclusione HLS. Anche i listener anonimi del percorso HLS nativo non hanno cleanup esplicito.

**Correzione obbligatoria:** ownership dei listener per tentativo e trasporto; cleanup al cambio modalità, non soltanto unmount; generation ID controllato da ogni callback e continuazione asincrona. Distruggere il trasporto perdente prima di promuovere quello nuovo.

**Accettazione:** WebRTC senza frame → HLS con frame; nessun successo WebRTC spurio. Ripetere almeno 100 cambi modalità/aperture: listener e sessioni non crescono; callback vecchi non cambiano il player corrente.

### F34 — P1 — Timeout video non copre l'intera negoziazione
**Evidenza:** in `CameraStream.tsx` il watchdog WebRTC parte solo dopo capabilities, configurazione, offer e creazione sessione. Il ramo HLS classico non imposta una scadenza complessiva al primo frame. Le richieste HTTP frontend non hanno una deadline predefinita (F54).

**Correzione obbligatoria:** deadline complessiva dalla richiesta di apertura fino al primo frame, più limiti per fase; annullare le operazioni superate. Distinguere caricamento, tentativo alternativo, snapshot ed errore. Applicare un budget breve per il campanello: l'overlay attuale dura 30 secondi, mentre il solo watchdog WebRTC ne può consumare 18 dopo le richieste preliminari.

**Accettazione:** bloccare separatamente capabilities, offer, manifest e primo segmento; il player passa a un'alternativa entro un limite dichiarato. Il campanello non deve chiudersi dopo aver mostrato soltanto attesa; definire e misurare tempo al primo frame per camere LAN/cloud.

### F35 — P1 — “LIVE” prima della riproduzione effettiva e autoplay fallito ignorato
**Evidenza:** `CameraStream.tsx` promuove HLS su `FRAG_BUFFERED`, HLS nativo/WebRTC anche su `loadeddata`, e ignora il rigetto di `video.play()`. Buffer disponibile non prova che il video stia avanzando.

**Correzione obbligatoria:** stato LIVE soltanto dopo riproduzione effettiva e avanzamento frame/tempo; gestire esplicitamente autoplay rifiutato con azione di avvio touch quando necessaria. Watchdog di progresso, non basato solo sugli eventi waiting/stalled; i timeupdate senza progresso non devono azzerarlo indefinitamente.

**Accettazione:** `play()` rifiutato, decoder fermo con buffer pieno, timeupdate a tempo costante: nessun falso LIVE; recupero o messaggio azionabile. Verificare WebView Fully e browser senza privilegi autoplay.

### F36 — P1 — MJPEG non recupera un guasto successivo al primo caricamento
**Evidenza:** l'`onError` dell'immagine MJPEG chiama il fallback soltanto quando `mjpegLoadedRef.current` è falso. Dopo il primo `onLoad`, errori successivi vengono ignorati; non c'è monitoraggio del flusso congelato. Il comportamento onLoad dei multipart va inoltre verificato nel WebView target.

**Correzione obbligatoria:** gestire anche caduta/chiusura dopo avvio, resettare stato LIVE e riaprire con backoff oppure passare a snapshot. Per distinguere immagine immobile da trasporto fermo usare segnali attendibili del proxy/decoder, senza inventare freschezza dei frame da un semplice timer.

**Accettazione:** interrompere lo stream dopo il primo frame, restituire multipart troncato e ripristinare la camera; recupero senza chiudere il drawer, nessuna immagine congelata etichettata LIVE. Verifica reale su Fully per gli eventi multipart.

### F37 — P1 — Errore senza snapshot diventa terminale e immagini fallite restano nascoste
**Evidenza:** `goSnapshot()` sceglie `error` quando non esiste preview; il retry periodico è presente solo in modalità snapshot. Inoltre gli onError di placeholder/backdrop impostano `style.display='none'` senza ripristino sul nuovo URL e la snapshot finale non gestisce errori. Il vecchio `snap` non viene azzerato al cambio entity ID.

**Correzione obbligatoria:** retry limitato con backoff anche per camere senza snapshot, pulsante Riprova e riattivazione su ritorno rete/HA. Gestire visibilità delle immagini con stato per risorsa, resettare placeholder/snapshot al cambio camera e mostrare ultimo aggiornamento; distinguere foto precedente da diretta.

**Accettazione:** camera live-only inizialmente guasta poi sana; snapshot 500 poi 200; cambio camera A→B con preview fallita. Recupero automatico, niente foto di A sotto il nome B, nessun elemento permanentemente nascosto.

### F38 — P1 — Scadenza fissa WebRTC interrompe anche sessioni in uso
**Evidenza:** `backend/src/lib/ha-webrtc.ts` crea ogni sessione con TTL fisso di due minuti, senza rinnovo. Alla scadenza la rimuove; il relativo stream SSE esce e il client reagisce a onerror riconnettendo il player, anche se i media erano sani.

**Correzione obbligatoria:** distinguere TTL di setup/orfano da durata di una sessione effettivamente utilizzata. Usare lease rinnovabile e pulizia deterministica su chiusura/disconnessione; preservare i limiti di risorse senza interrompere indiscriminatamente dirette sane.

**Accettazione:** diretta aperta per almeno 10 minuti senza reconnect periodico dovuto al TTL; tab chiusa o dispositivo scomparso → sessione e risorse rilasciate entro soglia. Test fake timer e prova di streaming prolungata.

### F39 — P2 — Errori ICE accodati ignorati e sessioni attive espulse senza criterio
**Evidenza:** `ha-webrtc.ts`, `flushCandidates`, usa Promise.allSettled senza esaminare gli errori. Al limite di 12 sessioni viene rimossa la più vecchia, indipendentemente dall'uso; il circuito client registra fallimenti solo in alcuni percorsi ICE.

**Correzione obbligatoria:** propagare fallimenti ICE rilevanti alla sessione; ordinare gli invii quando richiesto e controllare gli esiti. Rimuovere prima le sessioni orfane; a capacità esaurita rispondere esplicitamente e consentire fallback, evitando di interrompere un altro utente in silenzio. Applicare backoff coerente a errori/timeout ripetuti.

**Accettazione:** candidate prima del session ID con rifiuto HA; tredicesima apertura mentre dodici sono attive; nessun ACK ingannevole o interruzione non segnalata. Retry limitati durante guasto persistente.

### F40 — P1 — Anteprime continuano dietro campanello, ambient o schermo Fully spento
**Evidenza:** `CameraStream` sospende anteprime solo per `fullscreenCameraId` oppure visibilità DOM. `DoorbellAlert` azzera fullscreenCameraId e apre una camera priority: così le anteprime possono riattivarsi dietro il campanello. `useActiveWhenVisible` non legge `useFullyKioskStore.screenOn` né lo screensaver; un overlay opaco non rende un elemento non intersecting.

**Correzione obbligatoria:** arbitro condiviso dei consumatori video con priorità allarme/campanello/fullscreen/drawer; sospensione su ambient e schermo nativo off anche se document.visibilityState resta visible. Solo le camere effettivamente visibili occupano decoder e sessioni. Ripresa graduale al risveglio.

**Accettazione:** drawer con tre camere → campanello → chiusura; ambient; comando screenOff che non genera visibilitychange. Contare peer, richieste MJPEG e HLS: nessun flusso nascosto attivo; al risveglio recupero senza raffica incontrollata.

### F41 — P2 — Abort del proxy MJPEG collegato troppo tardi
**Evidenza:** `backend/src/routes/ha.ts`, `/camera-stream/:entityId`, aggiunge il listener all'abort del client solo dopo aver atteso la risposta HA. Se il client chiude durante setup, l'evento può essere già passato e l'upstream prosegue fino al timeout o oltre.

**Correzione obbligatoria:** collegare l'abort prima del fetch, controllare il segnale già aborted e pulire timer/listener in finally. Propagare chiusura/cancellazione del body verso HA anche dopo gli header. Verificare l'effettiva propagazione nell'adapter Node usato.

**Accettazione:** chiudere il drawer prima degli header e durante il flusso; upstream cancellato, nessuna richiesta orfana. Ripetere 100 volte con connessione lenta e verificare stabilità dei socket.

### F42 — P1 — Campanello disattivato ancora osservato sul kiosk
**Evidenza:** `backend/src/lib/home-layout.ts` proietta `config.doorbells ?? []`; `KioskShell` passa questo array a `useDoorbells` tramite DoorbellAlert. `useDoorbells` usa l'override direttamente, saltando `normalizeDoorbells`, che invece filtra `active !== false` nel percorso config.

**Correzione obbligatoria:** normalizzazione unica anche per override/proiezione kiosk; esclusione dei dispositivi disattivati e invalidi. Se un dispositivo viene disabilitato mentre suona, definire e applicare la chiusura coerente dell'episodio e dei relativi effetti.

**Accettazione:** campanello disattivato, stato cambia: nessun overlay/suono/riconoscimento nel kiosk; riattivazione senza falsa suonata iniziale. Desktop e kiosk hanno lo stesso comportamento.

### F43 — P1 — Eventi campanello falsi su unavailable/reconnect e gestione simultanea incompleta
**Evidenza:** `useDoorbells.ts` interpreta ogni cambio di stato di `event.*` come suonata, inclusi unknown/unavailable e ritorno a un timestamp precedente. La scansione termina al primo evento (`break`), lasciando altri prevStates non aggiornati e senza una politica esplicita per pressioni simultanee.

**Correzione obbligatoria:** validare lo stato evento e deduplicare per identità/timestamp; non confondere risincronizzazione con nuova pressione. Aggiornare il baseline di tutti i campanelli prima di selezionare o accodare episodi. Definire una coda limitata/priorità con scadenza, evitando perdita o replay tardivo.

**Accettazione:** timestamp→unavailable→stesso timestamp non suona; timestamp nuovo suona una sola volta; due campanelli nello stesso batch sono gestiti secondo politica documentata. Riavvio HA senza pressioni non genera allarmi alla porta.

### F44 — P1 — Campanello e presenza HA non accendono direttamente lo schermo nativo
**Evidenza:** DoorbellAlert chiama `markKioskActivity`; il sensore HA in AmbientLayer chiama `wakeRef`. Questi percorsi risvegliano l'ambient React ma non invocano `bridge.turnScreenOn()`. L'accensione nativa è presente per movimento Fully ed emergenza, non automaticamente per quei due eventi.

**Correzione obbligatoria:** coordinatore wake comune che, con capability disponibile, accenda lo schermo e interrompa lo screensaver nativo e quello applicativo, con ripristino della luminosità. Evitare cicli fra eventi nativi e applicativi. Riportare eventuale impossibilità di wake.

**Accettazione:** Fully con schermo realmente spento: pressione campanello e fronte del sensore HA accendono e mostrano il contenuto; browser senza bridge degrada senza errore. Ripetere con risparmio energetico Android e rete riagganciata.

### F45 — P1 — Emergenza già attiva saltata durante inizializzazione del bridge
**Stato al 1 ottobre 2026:** Implementato localmente; inizializzazione e ricreazione bridge testate. Collaudo schermo Fully reale pendente. Vedi §18.

**Evidenza:** `useFullyKiosk.ts` inizializza `emergency` leggendo lo store e poi chiama `applyEmergency` con lo stesso valore; la funzione ritorna subito per uguaglianza. Al rimontaggio/reinizializzazione con emergenza già attiva non esegue necessariamente accensione e luminosità 255.

**Correzione obbligatoria:** separare stato desiderato e stato nativo effettivamente applicato; applicare sempre la condizione iniziale e riapplicarla quando cambia la disponibilità del bridge. Non lasciare il tablet attenuato al cambio impostazioni durante un allarme.

**Accettazione:** mount con emergencyActive=true; modifica luminosità ambient durante allarme; ricreazione bridge. Schermo acceso e luminosità emergenza ripristinati; cessazione allarme riporta al livello corretto.

### F46 — P2 — Due controllori del tema e luminosità manuale sovrascritta
**Evidenza:** `useAutoTheme` e `useFullyKiosk` scrivono entrambi il tema automatico. Il secondo modifica solo la classe dark, senza `applyDarkAppearance`, lasciando possibili differenze con colorScheme/meta theme-color. Il poll Fully regola inoltre la luminosità ogni quattro secondi senza coordinamento con un comando manuale remoto.

**Correzione obbligatoria:** un resolver tema con priorità fra manuale, sensore Fully, sensore browser e sistema; usare sempre lo stesso applicatore. Per luminosità definire auto/manuale e durata dell'override, evitando che un comando riuscito sia annullato pochi secondi dopo senza spiegazione. Non presentare average-luma come lux reali nei dati diagnostici.

**Accettazione:** sensori e OS discordanti senza oscillazioni; classe/store/meta coerenti; comando luminosità rispettato secondo la modalità scelta; emergenza prevale e poi restituisce il controllo correttamente.

### F47 — P2 — Wake lock acquisito dopo cleanup e mancato recupero da release
**Evidenza:** `src/hooks/useWakeLock.ts` controlla cancelled prima dell'await ma non dopo: una richiesta pendente può consegnare un lock dopo unmount. Release azzera il riferimento ma non tenta recupero quando la pagina rimane visibile; non esiste guard per richieste concorrenti.

**Correzione obbligatoria:** singola acquisizione in volo, verifica generazione dopo await con rilascio immediato se superata, gestione release e retry limitato compatibile con stato browser/batteria. Segnalare la capability effettiva: su origine LAN HTTP l'API può non essere disponibile e il comportamento deve affidarsi alla configurazione Fully supportata.

**Accettazione:** unmount prima del resolve, visibilitychange ripetuti, release con pagina visibile e rifiuto per batteria. Nessun lock perso/orfano, nessun retry aggressivo; collaudo display reale.

### F48 — P1 — Coda foto rimossa prima della conferma e retry dipendente solo da online
**Stato al 2 ottobre 2026:** Implementato il 2 ottobre: coda persistita fino all’ACK, retry periodico serializzato e upload idempotente. Vedi §20; storage negato e quota piena restano limiti espliciti.

**Evidenza:** `useEmergencyMode.ts` chiama `drainQueue`, che rimuove subito tutte le foto dallo storage; le ricarica nella coda soltanto al catch. Un reload durante l'upload perde la foto. Il retry avviene al mount o evento browser online: se cade solo il backend e la rete resta connessa, non riparte da solo.

**Correzione obbligatoria:** outbox persistente con rimozione dopo conferma, ID idempotente, upload seriale e retry con backoff su recupero backend. Distinguere errori permanenti da transitori. Rivalutare il consenso prima di inviare foto accodate; documentare cosa accade alla coda quando si disabilita la funzione.

**Accettazione:** backend offline con navigator online, ritorno backend, reload a metà upload, risposta persa dopo salvataggio, opzione foto disattivata durante attesa. Nessuna perdita silenziosa o duplicazione e nessun invio contrario alla configurazione corrente.

### F49 — P2 — Scatto emergenza segnato eseguito anche quando non esiste una foto
**Stato al 2 ottobre 2026:** Implementato il 2 ottobre: tre tentativi limitati di acquisizione, cancellati alla chiusura, una sola foto valida per episodio. Vedi §20.

**Evidenza:** `useEmergencyMode.ts` assegna `shotFor.current` prima di ottenere `getCamshotDataUrl`; se restituisce null non riprova nello stesso episodio. Seleziona inoltre soltanto il primo alert reale.

**Correzione obbligatoria:** stato per episodio distinto fra pending, acquisito, accodato e fallito. Retry breve e limitato per fotocamera non ancora pronta; definire se la foto è per emergenza aggregata o per singolo evento e implementare coerentemente deduplicazione e concorrenza. Mai acquisire durante simulazioni.

**Accettazione:** primo tentativo null poi JPEG valido senza nuovo allarme; due alert simultanei secondo politica scelta; nessuno scatto ripetuto illimitato; test ring/alarm sempre senza foto.

### F50 — P2 — Screensaver fotografico senza gestione errore e perf-lite incompleto
**Evidenza:** `AmbientPhoto` non gestisce onError; una foto non disponibile lascia uno sfondo senza diagnosi fino alla rotazione e, con una sola foto, indefinitamente. Le animazioni Ken Burns sono guidate da Framer e limitate da reduced-motion, ma non dalla scelta perf-lite; i CSS che spengono keyframe non fermano quei transform JS.

**Correzione obbligatoria:** saltare foto guaste con retry limitato e fallback orologio; evitare loop rapidi se tutte falliscono. Integrare profilo prestazioni e schermo off nella pianificazione delle animazioni/preload, limitando duplicati decodificati e blur sui tablet deboli.

**Accettazione:** una foto 404, album tutto guasto, foto molto grande e cambio album; schermata sempre leggibile. In perf-lite nessun loop Ken Burns attivo; memoria stabile dopo molte rotazioni e durante schermo spento.

### F51 — P2 — Recap screensaver dichiara “Live” senza verificare la connessione
**Evidenza:** `AmbientAIRecap.tsx` mostra sempre pallino verde e testo Live, ricavando il contesto dalle entità in memoria senza includere salute/freschezza HA.

**Correzione obbligatoria:** derivare lo stato del recap dalla salute della sorgente; mostrare dati non aggiornati e ultimo aggiornamento attendibile. Sospendere richieste AI su contesto obsoleto o identico quando non utili. Un fetch AI riuscito non rende live i dati HA vecchi.

**Accettazione:** interrompere HA mentre l'ambient è aperto: niente indicatore verde ingannevole; riconnessione ripristina stato live solo dopo dati validi. Nessuna raffica AI durante outage.

### F52 — P2 — Overlay video/campanello fuori dal coordinamento accessibilità
**Evidenza:** FullscreenCameraOverlay dichiara dialog ma non gestisce focus trap/restauro; DoorbellAlert non espone una semantica equivalente e non coordina il focus. Listener Escape separati possono agire insieme alle sheet sottostanti (F25).

**Correzione obbligatoria:** includere fullscreen e campanello nello stack modale condiviso; focus e tastiera solo sul livello superiore, ritorno al trigger, sfondo inerte. Un dialog aperto dietro non deve ricevere pressioni prolungate o scorciatoie.

**Accettazione:** aprire dettaglio → video → campanello: Tab ed Escape agiscono solo sul livello previsto; chiusura conserva focus e stato del livello sottostante. Verificare anche screen reader e navigazione touch.

### F53 — P2 — Operazioni pendenti sulle serrature non impediscono reinvio
**Evidenza:** `HoldUnlockButton` in DoorbellAlert disabilita per unavailable/unlocked, ma non per `unlocking` o richiesta pendente; dopo i 900 ms il timer torna null e può partire un secondo hold prima del riscontro. Un errore ritardato ripristina lo stato catturato alla partenza, potenzialmente superando uno stato HA più recente.

**Correzione obbligatoria:** serializzare per entità, rendere visibile pending e proteggere rollback con identità operazione/versione. Mantenere hold900ms e cancellazione su blur/pointercancel. Applicare la stessa politica agli altri controlli di apertura che condividono il percorso.

**Accettazione:** due hold rapidi con risposta lenta; evento HA unlocked prima di un errore tardivo; unmount durante richiesta. Nessun doppio comando involontario né ritorno visivo a locked dopo uno stato reale più recente.

### F54 — P1 — Richieste frontend prive di deadline possono bloccare azioni e accumularsi
**Evidenza:** helper `request` in `src/api/backend.ts` e helper AI non impostano un timeout; diversi caller non passano AbortSignal. Il heartbeat a intervallo può avviare nuove richieste mentre le precedenti restano pendenti.

**Correzione obbligatoria:** deadline differenziate per categoria, cancellazione su lifecycle e singola richiesta in volo dove appropriato. Non ritentare automaticamente comandi non idempotenti dopo un timeout ambiguo: prima riconciliare stato/esito. Propagare errori di sessione coerentemente anche nei client AI/media.

**Accettazione:** connessione che accetta TCP ma non risponde, senza evento offline; pulsanti escono dal pending entro soglia, heartbeat non cresce senza limite, UI resta utilizzabile. Risposta tardiva non sovrascrive un'operazione successiva.

### F55 — P2 — Aggiornamento in tempo reale dei controlli audio incoerente fra componenti
**Evidenza:** `useSoundNotifications` copia mute/volume dal singleton in stato locale di ogni istanza, ma non si iscrive ai cambiamenti del SoundManager. Una modifica da un componente non aggiorna automaticamente l'interfaccia degli altri.

**Correzione obbligatoria:** unica sorgente reattiva per mute/volume e stato di disponibilità audio, con sincronizzazione delle istanze; preservare la distinzione tra notifiche normali e canale emergenza. Non mostrare “audio attivo” soltanto perché la preferenza non è muta.

**Accettazione:** cambiare volume/mute da due controlli aperti: valori coerenti immediatamente; reload preserva preferenze; autoplay bloccato visibile senza confonderlo con mute.

### F56 — P2 — Inserimento tardivo del bridge Fully non recuperato automaticamente
**Evidenza:** `useFullyKiosk` valuta `window.fully` nell'effetto dipendente solo da ambientBrightness; se inizialmente manca, resetta lo store e ritorna. Non riprova quando l'interfaccia diventa disponibile, ad esempio dopo attivazione impostazione o reiniezione del WebView senza remount React.

**Correzione obbligatoria:** rilevamento controllato su resume/visibilità o evento capability, con retry limitato e inizializzazione idempotente. Riallineare store, event bindings, audio e stato emergenza senza duplicare callback nativi. Se la versione Fully impone reload, esporre istruzione esplicita anziché attesa silenziosa.

**Accettazione:** iniziare senza bridge, poi renderlo disponibile nello stesso documento; recupero o richiesta di ricarica corretta. Cento resume non moltiplicano binding/polling.

### F57 — P2 — Stato dei comandi video presentato con testi incoerenti
**Evidenza:** FullscreenCameraOverlay mostra sempre “Video in diretta” anche quando CameraStream è in snapshot, connecting o errore; DoorbellAlert considera camera unavailable come “Nessuna telecamera associata”, confondendo configurazione assente e dispositivo offline.

**Correzione obbligatoria:** esporre uno stato player condiviso con il contenitore: connessione, diretta confermata, foto con timestamp, offline, autorizzazione, non configurato. Messaggi e azioni devono distinguere i casi; nessuna promessa di audio/talk-back se non implementati e verificati.

**Accettazione:** camera associata offline → messaggio di indisponibilità; camera assente → configurazione mancante; fallback snapshot → nessun titolo che la presenta come diretta. Ripristino aggiorna tutte le etichette insieme.

## 14. Collaudo kiosk tassativo: scenari end-to-end

Questa matrice integra il §11. È richiesta **sul modello Android/WebView/Fully realmente installato**, in entrambe le home e appearance. Annotare modello, RAM, versioni Android/WebView/Fully, build S.I.M.I., origine HTTP/HTTPS e impostazioni Fully rilevanti. Mai includere token o credenziali nel report.

| Scenario | Procedura | Risultato da dimostrare |
|---|---|---|
| Primo avvio | Storage vuoto, config lenta, HA sano | Nessun crash/schermo vuoto permanente; audio e preferenze corretti |
| LAN assente al boot | Avviare senza backend, poi ripristinare | Stato offline onesto, eventuale cache identificata, recupero senza refresh manuale |
| HA down | Backend raggiungibile, HA assente per 1 e 10 minuti | Stati obsoleti segnalati, comandi senza falsi successi, ritorno coerente |
| Backend down | HA sano, arresto/ritorno backend controllato | SSE, config, comandi e foto recuperano senza dipendere da navigator.online |
| Rete instabile | Cadute ripetute, latenza, richieste bloccate | Backoff limitato, nessun accumulo di richieste/peer/listener |
| WebRTC | Camera compatibile, diretta ≥10 minuti | Nessun restart artificiale ogni due minuti; corretta pulizia alla chiusura |
| HLS | WebRTC assente/guasto; manifest e segmenti rallentati | Fallback bounded, primo frame verificato, rinnovo URL e recupero errori |
| MJPEG | Caduta prima e dopo primo frame; multipart interrotto | Niente falso LIVE congelato; riconnessione o fallback |
| Solo snapshot | Live impossibile, poi di nuovo disponibile | Timestamp, aggiornamento foto e ritorno live; guasti preview gestiti |
| Campanello al buio | Schermo Fully off e ambient attivo, pressione vera | Wake nativo, audio e video entro budget misurato; niente flussi nascosti |
| Eventi simultanei | Due campanelli, allarme e video manuale | Priorità deterministica; comandi e audio non duplicati; allarme non coperto |
| Campanello disattivato | Disabilitare e cambiare entità HA | Nessuna suonata, richiesta AI o overlay |
| Video e navigazione | Aprire/chiudere/cambiare camera 100 volte | Risorse tornano al baseline; nessuna immagine della camera precedente |
| Autoplay | Riavvio tablet senza tocco iniziale | Esito reale del canale audio; eventuale sblocco richiesto chiaramente |
| Comandi Fully | Screen on/off, luminosità, TTS, screensaver, reload, restart | Ogni esito correlato al comando; unsupported distinto da offline/timeout |
| Emergenza | Allarme già attivo al boot e durante modifica config | Schermo acceso, luminosità appropriata, audio prioritario e rollback corretto |
| Foto emergenza | Acquisizione ritardata, backend offline, reload in upload | Coda persistente, invio idempotente al recupero, rispetto opt-in |
| Sessione auth | Required, sessione invalida e nuovo login kiosk | Nessun loop di retry o successo da cache che nasconde il login necessario |
| Orientamento | Portrait/landscape, tastiera, font Android ingrandito | Nessun controllo essenziale tagliato; target44px e scroll accessibile |
| Aggiornamento app | Client aperto durante nuova build/riavvio | Versione corretta, recovery chunk, nessuna perdita silenziosa dell'editing |
| Uso prolungato | 24 ore con cicli ambient/wake/video e variazioni HA | Nessuna crescita sostenuta di heap/sessioni/socket dopo warm-up; niente reset inattesi |

Per il soak test registrare almeno: memoria JS quando esposta, memoria processo WebView con strumenti dispositivo se disponibili, numero sessioni WebRTC, richieste attive, errori console/backend, frequenza reconnect e tempo al primo frame. Raccogliere baseline e misure periodiche; non inventare una soglia universale di RAM o latenza senza il dispositivo reale.

Il controllo deve includere tutte le funzioni di dominio realmente configurate: luci/dimmer, switch, clima, cover/valvole, serrature, media, robot, scene/script, numeri/select, allarmi, shortcut e gruppi. Per ciascuna: successo, rifiuto HA, timeout ambiguo, click ripetuti, stato esterno concorrente e rollback. Usare fixture per i comandi con effetti fisici durante i test automatici; le prove reali vanno eseguite in condizioni controllate.

## 15. Ordine di chiusura e stato di questa integrazione

- Prima stabilizzare protocollo comandi e stream già elencati (F01–F08), poi player e risorse (F33–F41, F54).
- Chiudere campanello/wake/emergenza (F42–F49), mantenendo separati test e attivazioni reali.
- Concludere ambient, accessibilità, feedback audio/video e capability Fully (F50–F57).
- Eseguire tutti i quality gate del §10 dopo l'implementazione e allegare il collaudo §14. Una funzione non provata su hardware resta “implementata, collaudo tablet pendente”.

**Verifica di questa integrazione:** lettura statica dei percorsi elencati, controllo riferimenti e numerazione del documento. Non sono state cambiate le sorgenti applicative, avviate camere reali o inviate azioni HA. I risultati 482 test/lint/build/typecheck del §10 appartengono alla precedente verifica dello snapshot applicativo; non sono nuove prove di risoluzione dei punti F33–F57.

Obiettivo operativo: tablet affidabile, guasti gestiti con recupero e stato veritiero. Non dichiarare “ogni bug eliminato” o “perfettamente funzionante” sulla sola base di questo elenco: la chiusura richiede evidenze dei criteri di accettazione e collaudo sul dispositivo.

## 16. Standby, wake e funzioni smart connesse a HASS

Ulteriore estensione richiesta dall'utente: **F58–F69**, da trattare insieme a F40, F44–F49 e F56. “Wake” significa distinguere tre risultati: riattivazione dell'interfaccia, uscita dallo screensaver nativo e accensione fisica del display. Il primo non dimostra gli altri due.

### F58 — P1 — Standby e wake senza una politica unica, impostazioni non rappresentative
**Evidenza:** AmbientLayer gestisce timer e wake da HA/lux/prossimità; useFullyKiosk avvia motion detection e accende lo schermo su movimento; i comandi remoti agiscono sul bridge separatamente. In FunctionsPage la scelta sensore vuota è etichettata “nessuno (solo tocco)”, ma luce, prossimità e movimento Fully possono comunque svegliare il tablet.

**Correzione obbligatoria:** coordinatore dello stato schermo con motivazione e precedenze esplicite fra uso, inattività, presenza, orario, comando manuale, campanello ed emergenza. Rendere configurabili/documentate le sorgenti effettive di wake; il testo “solo tocco” deve essere vero oppure va corretto. Definire durata/annullamento dell'override screenOff, così un evento movimento immediato non annulla inspiegabilmente il comando.

**Accettazione:** matrice sorgente×stato (attivo, ambient, native screensaver, display off, emergenza) con esito atteso; nessun loop off/on, oscillazione di luminosità o doppio timer. Emergenza prevale; al termine ritorna lo stato appropriato senza spegnimento inatteso durante un'interazione.

### F59 — P2 — Presenza HA valutata solo su transizione e senza politica di permanenza
**Evidenza:** AmbientLayer si iscrive ai cambiamenti e sveglia per `on` dopo un valore diverso, senza valutare il valore iniziale. Un sensore già on all'attivazione della configurazione non produce wake. Presenza che resta on non impedisce il successivo timeout idle; unavailable→on può invece svegliare a ogni recupero.

**Correzione obbligatoria:** definire esplicitamente modalità “wake sul fronte” e, se richiesta, “mantieni sveglio durante occupazione”; applicare lo stato iniziale secondo quella politica. Validare disponibilità/freschezza, introdurre debounce e distinguere movimento reale da risincronizzazione. Non attribuire un comportamento keep-awake che non è implementato.

**Accettazione:** sensore già on al boot/cambio setting; on continuo oltre idleSeconds; on/off rapido; unavailable→on su reconnect; sensore rimosso. Ogni caso ha comportamento documentato e testato, senza risvegli ripetuti ingiustificati.

### F60 — P2 — Riattivare lo screensaver può mostrarlo immediatamente
**Evidenza:** AmbientLayer mantiene `idle` nello stato React; l'effetto al cambio enabled/idleMs ricrea il timer ma non azzera idle. Disabilitare mentre idle=true nasconde l'overlay senza cancellare quello stato; riabilitare può mostrarlo subito, ignorando il nuovo tempo di inattività.

**Correzione obbligatoria:** ricalcolare idle in funzione dell'ultima attività e della politica scelta; alla riabilitazione applicare il nuovo intervallo senza riusare un booleano obsoleto. Coordinare anche modifiche del timeout mentre l'utente interagisce e lo stato native screensaver.

**Accettazione:** standby attivo → disabilita → interazione → riabilita; nessun oscuramento immediato. Cambio 180→60 secondi e viceversa con clock controllato produce il comportamento specificato.

### F61 — P2 — Sensore di prossimità senza gestione errori asincroni completa
**Evidenza:** AmbientLayer gestisce eccezioni del costruttore/start ma registra solo reading, non error. Nel catch ritorna senza cleanup di un sensore eventualmente creato prima dell'eccezione. Il vecchio useAmbientNightMode non ha consumer rilevati: non usarlo come prova che una politica oraria sia effettivamente attiva.

**Correzione obbligatoria:** gestire errori/permessi e cleanup di sensore parzialmente avviato; evitare callback dopo unmount. Esporre le sorgenti wake disponibili. Inventariare la modalità notte realmente collegata all'app ed eliminare/deprecare documentazione di hook non montati, senza introdurre un secondo controllore.

**Accettazione:** errore emesso dopo start, permesso negato, start che lancia dopo creazione e remount ripetuto: nessun sensore orfano; wake touch/HA ancora funzionante e diagnostica veritiera.

### F62 — P1 — Simulazione campanello lascia attive azioni reali HASS
**Evidenza:** useDoorbells marca le prove con `test:true`; DoorbellAlert impedisce il riconoscimento AI per i test ma renderizza HoldUnlockButton e ShortcutActionButton senza disabilitarli. L'overlay allarme invece disabilita esplicitamente gli shortcut quando current.test è vero.

**Correzione obbligatoria:** rendere il test campanello privo di effetti fisici: disabilitare o simulare serrature/shortcut reali e indicare chiaramente “Simulazione”. Propagare il contesto test fino all'esecutore, affinché la protezione non dipenda solo dal colore o dallo stato disabled del bottone. Non impedire i controlli nelle suonate reali.

**Accettazione:** avviare prova dalla regia e premere/tenere premuti tutti i controlli: zero chiamate HA mutative, zero foto/AI; nella suonata reale comandi disponibili secondo le regole previste. Verificare tastiera e touch.

### F63 — P1 — Qualsiasi binary_sensor “problem” può attivare l'emergenza completa
**Stato al 2 ottobre 2026:** Implementato il 2 ottobre: problem è avviso ordinario; escalation esplicita attraverso device_class safety in HA. Sensori fumo/gas/acqua/intrusione preservati e testati. Vedi §20.

**Evidenza:** `src/lib/criticalAlerts.ts` classifica device_class problem tra gli alert critici; useCriticalAlerts passa l'intero insieme a schermo, audio e foto d'emergenza. La categoria generica problem non specifica da sola un pericolo: può rappresentare diagnostica ordinaria. Anche useNotifications la promuove a critical.

**Correzione obbligatoria:** separare guasti diagnostici da emergenze di sicurezza usando metadati/registry e una politica esplicita di escalation per i casi ambigui. Conservare l'eccezione P0 visibile anche senza opt-in per veri sensori di sicurezza. Non silenziare indiscriminatamente smoke/gas/intrusione per correggere il rumore diagnostico.

**Accettazione:** problema ordinario di dispositivo → avviso adeguato senza sirena/foto/fullscreen; smoke/gas/intrusione reali → percorso emergenza. Un problem esplicitamente classificato critico segue la politica configurata e testata.

### F64 — P2 — Scene della home ignorano selezione e disponibilità
**Stato al 2 ottobre 2026:** Implementato il 2 ottobre: scene opt-in/registry, unavailable e connessione con controllo al tap. Vedi §20.

**Evidenza:** `src/hooks/useScenes.ts` restituisce tutte le scene presenti nello store senza filtro opt-in/registry o stato unavailable; QuietSection decide la presenza della sezione da qualsiasi `scene.*`. SceneRow le rende azionabili.

**Correzione obbligatoria:** applicare la stessa politica di curation prevista dal wizard; scene non selezionate non compaiono come azioni ordinarie. Gestire unavailable e stato della connessione senza dichiarare eseguibile ogni entità soltanto perché presente nella cache. Separare accettazione HA da completamento degli effetti della scena, se non osservabile.

**Accettazione:** scena nascosta/non configurata esclusa; scena scelta ma unavailable disabilitata con motivo; ritorno disponibilità la riabilita. Nessun comando automatico al reconnect o al rendering.

### F65 — P2 — Suggerimenti clima con correlazione incerta e senza aggiornamento ottimistico
**Evidenza:** `computeInsights` correla finestra e clima anche quando una delle aree manca; `LayeredHome.runAlertAction` chiama direttamente il servizio senza aggiornamento ottimistico. Il suggerimento non rivalida la condizione immediatamente prima dell'azione.

**Correzione obbligatoria:** separare correlazione certa stessa area da informazione non localizzata; non presentare come relazione verificata ciò che è ignoto. Al tap rivalidare entità/azione e stato disponibile, applicare optimistic update e rollback protetto da eventi concorrenti. Mantenere sempre esecuzione su gesto esplicito, mai automatica.

**Accettazione:** finestra senza area e clima in altra stanza non producono una relazione certa ingannevole; finestra chiusa fra render e tap gestita; errore HA ripristina stato; nessuna azione quando la sola riconnessione cambia il suggerimento.

### F66 — P1 — Falso allarme acqua: durata non dimostrata e unità non validate
**Stato al 1 ottobre 2026:** Implementato localmente; copertura temporale, unavailable, unità e campioni futuri testati. Vedi §18.

**Evidenza riprodotta localmente:** `detectSustainedWaterFlow` in `src/lib/consumptionInsights.ts` accetta tre campioni sopra soglia negli ultimi 30 minuti senza verificare copertura temporale. Tre punti da 3 L/min nei soli ultimi due secondi producono “Flusso d'acqua costante da almeno 30 minuti”. Il convertitore tratta come litri qualunque unità non riconosciuta come m³ purché contenga /min o /h; vengono scartati i campioni invalidi, senza far decadere la continuità.

**Correzione obbligatoria:** dimostrare la durata con una serie ordinata, stato al confine iniziale e regole sui buchi/unavailable. Escludere timestamp futuri e richiedere unità note con conversione esplicita; supportare altre unità solo se implementate. Se i dati non bastano, indicare evidenza insufficiente anziché una durata inventata.

**Accettazione:** tre punti in due secondi → nessuna affermazione di 30 minuti; copertura reale continua → avviso; interruzione sotto soglia/unavailable → continuità interrotta; gal/min o unità sconosciuta non trattati come L/min. Nessuna azione fisica automatica derivata dall'insight.

### F67 — P2 — Confronto solare/consumo può usare lo stesso sensore e unità non normalizzate
**Stato al 2 ottobre 2026:** Parzialmente corretto il 2 ottobre: unità e ordinamento normalizzati, consumo domestico distinto e copertura senza tolleranza ingannevole. Identificazione configurabile della produzione ancora aperta. Vedi §20.

**Evidenza riprodotta localmente:** findSolarProductionSensor ordina i valori grezzi: con 500 W e 2 kW seleziona 500 W. EnergyCard seleziona analogamente qualunque sensore power come “consumo”, includendo quello solare; può quindi confrontare la produzione con sé stessa e dichiarare copertura della casa senza un sensore di consumo identificato.

**Correzione obbligatoria:** normalizzare prima del confronto e distinguere produzione, consumo domestico e singolo sottocircuito tramite configurazione/capability affidabile. Richiedere sorgenti appropriate e distinte per l'autosufficienza; altrimenti omettere il giudizio. Non sommare sensori sovrapposti o dedurre il consumo della casa dal dispositivo più attivo.

**Accettazione:** 2 kW prevale su 500 W; sola produzione solare non basta a dichiarare autosufficienza; produzione e consumo verificati danno il risultato corretto. Segni/unità non riconosciuti rendono il confronto indisponibile.

### F68 — P2 — Media energia non temporale e storico non rinnovato durante uso continuo
**Stato al 2 ottobre 2026:** Parzialmente corretto il 2 ottobre: media temporale con copertura e refresh periodico; invalidazione specifica al cambio installazione ancora da completare. Vedi §20.

**Evidenza:** EnergyCard fa media aritmetica dei punti HA, che possono essere cambi di stato irregolari, e la presenta come confronto con la media 24h. Query storico energia/acqua hanno staleTime ma non refetchInterval: staleTime non è un timer di fetch. Il tick nowMs ricalcola i giudizi su uno storico che può restare vecchio finché la card rimane montata.

**Correzione obbligatoria:** media ponderata sulla durata con copertura e unità validate, oppure etichetta esplicita di media dei soli campioni senza attribuirle significato temporale. Aggiornare gli storici con frequenza controllata mentre visibili, su recupero connessione e cambio sensore; invalidare al cambio installazione HA. Non far crescere query in background inutilmente.

**Accettazione:** potenza bassa per 23h e alta per 1h con campionamento irregolare → media temporale corretta; card aperta un'ora riceve storico nuovo; finestra acqua non si svuota per mancato refetch mascherando il problema.

### F69 — P1 — “Tutto è sicuro” e regole smart non distinguono dati mancanti da casa sana
**Stato al 2 ottobre 2026:** Parzialmente corretto il 2 ottobre: stato iniziale/offline esplicito, suggerimenti sospesi offline; modello comune di freschezza e conservazione degli episodi ancora aperti. Vedi §20.

**Evidenza:** useHomeStatus può restituire “Tutto è sicuro” con store vuoto e nessun avviso; useCriticalAlerts e le altre derivazioni smart lavorano sugli stati conservati senza un modello comune di freschezza/connessione. L'assenza di dati non prova assenza di problemi e uno stato vecchio non dimostra una nuova attivazione.

**Correzione obbligatoria:** aggiungere qualità/freschezza della sorgente alle derivazioni: inizializzazione, online sincronizzato, degradato e obsoleto. Non annunciare sicurezza con snapshot sconosciuta; non cancellare un'emergenza reale solo perché cade la rete, ma mostrarla come ultima condizione nota da verificare. Non generare nuovi scatti, notifiche ripetute o azioni per la sola reidratazione di uno stesso episodio.

**Accettazione:** boot senza dati, HA offline dopo allarme, reconnect con stesso episodio e con stato risolto. Testi corretti, nessuna falsa rassicurazione, nessuna duplicazione effetti; risoluzione dell'allarme soltanto da informazione valida o procedura esplicita.

## 17. Matrice smart HASS e contratto standby da consegnare

Per ogni funzione lo sviluppatore deve compilare: entità e attributi sorgente, area, unità, configurazione che la abilita, comportamento se unknown/unavailable, freschezza richiesta, effetto sul tablet, eventuale comando HA, priorità, deduplicazione e prova. Inventariare almeno:

| Funzione | Casi obbligatori |
|---|---|
| Presenza HASS | Già presente al boot, fronte nuovo, presenza continua, sensore offline/rimosso, cambio sensore, reconnect |
| Movimento Fully | Impostazione abilitata/disabilitata, bridge tardivo, screenOff manuale, movimento ripetuto, notte |
| Luce/prossimità | Lux validi/NaN, average-luma distinta, soglie/isteresi, permessi negati, sensore silenzioso |
| Standby | Tempo inattività, disabilita/riabilita, cambio timeout, tocco/scroll/tastiera, app e native screensaver contemporanei |
| Wake prioritario | Campanello e allarme con display spento; ritorno al livello luminosità corretto; controllo manuale in corso |
| Comandi e scene | Opt-in, unavailable, successo/errore/timeout, stato concorrente, zero replay al reconnect |
| Sicurezza | Intrusione, fumo/gas/acqua, guasto diagnostico; episodio già attivo, più eventi e simulazione isolata |
| Suggerimenti clima | Stessa area certa, area assente, finestra chiusa prima del tap, HA down, optimistic update/rollback |
| Consumi | W/kW, produzione distinta da consumo, campionamento irregolare, unità acqua, serie incompleta, refresh storico |
| Recap e notifiche | Dati obsoleti, AI indisponibile, cache vecchia, nessuna falsa indicazione Live/sicuro |
| Configurazione live | Due tablet, cambio setting dalla regia, conflitto, riavvio e ripristino backup |

**Distinzione di scope obbligatoria:** risvegliare il display tramite Fully non equivale a Wake-on-LAN di un computer, né garantisce la ricezione di eventi mentre Android ha sospeso il processo. Se HASS deve accendere un tablet la cui pagina è sospesa, verificare il percorso nativo/integrazione disponibile e la configurazione Android effettiva; non prometterlo sulla sola sottoscrizione JavaScript. Non aggiungere accessi Remote Admin, password o automazioni HA non richiesti per aggirare il problema: documentare la capability necessaria e implementare solo il percorso autorizzato.

**Evidenze aggiuntive di questa estensione:** eseguite due riproduzioni locali delle funzioni pure consumi, con dati sintetici, che confermano F66 e F67. Nessuna chiamata a HASS reale. Gli altri nuovi punti sono riscontri statici o lacune funzionali documentate; il collaudo hardware rimane richiesto.


## 18. Primo gruppo di fix implementati — 1 ottobre 2026

Su richiesta dell'utente è iniziata l'implementazione. Modifiche locali non committate e non distribuite. Le evidenze originarie nelle sezioni precedenti descrivono il difetto prima della correzione; lo stato riportato sotto i singoli ID e questa sezione descrivono il risultato corrente.

| ID | Modifica effettiva | Prova effettuata | Residuo |
|---|---|---|---|
| F12 | Errori read/chmod fuori dal recupero per JSON corrotto; un DB valido non viene rinominato/reset | Errori di permessi simulati: file e credenziali invariati; recupero di JSON realmente corrotto conserva i byte originali | Collaudo packaging/volume finale resta nel gate F30 |
| F13 | Permessi del temporaneo verificati prima di rename; memoria pubblicata soltanto dopo commit | Guasti chmod/write/rename: memoria e disco mantengono versione precedente; scrittura successiva recupera | Nessuna riscrittura del modello DB |
| F14 | Migrazione su copia, flag impostato soltanto dopo successo | Primo persist fallisce; DB originale conservato; seconda lettura migra e persiste correttamente | — |
| F09 | Preferenza assente/vuota/invalida mantiene 0,7; zero intenzionale preservato | Test bootstrap e volume salvato; letture/scritture storage negate non bloccano il manager | Audio udibile/autoplay hardware da collaudare; F10 resta aperto per altri consumer storage |
| F45 | Stato emergenza desiderato conservato al reset del bridge; prima applicazione distinta da valore già applicato | Mount con emergenza attiva, fine emergenza e ricreazione bridge per cambio setting | Verifica accensione e luminosità sul tablet reale |
| F66 | Richiesta evidenza all'inizio della finestra di 30 minuti; invalidità/unavailable interrompe la continuità; unità esplicitamente riconosciute; campioni ordinati e futuri esclusi | Tre campioni recenti non producono falso avviso; serie con baseline, unavailable, m³/h, gal/min e dati non numerici verificate | Freschezza della sorgente complessiva e refresh storico restano F68/F69 |

File principali: `backend/src/db/client.ts`, `src/lib/sound/SoundManager.ts`, `src/hooks/useFullyKiosk.ts`, `src/store/fullyKiosk.ts`, `src/lib/consumptionInsights.ts`. Test aggiunti: `backend/src/db/client.test.ts`, `src/hooks/useFullyKiosk.test.ts`; estesi i test SoundManager e consumptionInsights.

**Quality gate sul codice di questo gruppo:** lint PASS; test PASS **94 file / 503 test**; build:all PASS frontend e backend; typecheck backend PASS. Le prove database usano directory temporanee isolate e fault injection. Nessuna operazione su HASS reale, nessun deploy o comando fisico al tablet.

Gli altri ID restano aperti. Prossimi gruppi: protocollo stream/commandId e player video; coordinamento completo standby/wake; isolamento delle simulazioni e impostazioni concorrenti. Non confondere questa prima implementazione con la chiusura dell'intero audit.

## 19. Secondo gruppo implementato e rilascio — 1 ottobre 2026

La richiesta di deploy pubblica lo stato implementato dopo l'interruzione del lavoro; **non chiude tutti i 69 punti dell'audit**. Gli stati del primo gruppo restano validi. Nei seguenti punti sono state aggiunte correzioni, con gli eventuali criteri hardware o end-to-end ancora da verificare:

- **F01–F02:** overlay connessione e aggiornamento montati anche nella shell kiosk; testo sui dati non aggiornati e controllo di riprova.
- **F03–F05:** watchdog di idratazione e silenzio SSE, recupero dal polling allo stream, snapshot iniziale anche con zero entità e sincronizzazione del test allarme anche inattivo.
- **F07–F08:** `commandId` e riscontri correlati al dispositivo; rifiuto di ACK obsoleti/estranei; stati pending/accepted/completed/failed. Reload e restart sono confermati da un avvio successivo, audioTest attende l'esito di riproduzione. Il browser senza storage persistente può confermare soltanto l'accettazione del riavvio.
- **F10 (parziale):** identità kiosk stabile nella sessione se localStorage è negato; lettura diagnostica stream protetta. Resta il controllo degli altri utilizzatori di storage.
- **F33–F37 (parziale):** rimozione dei listener del trasporto abbandonato, timeout WebRTC dall'inizio della negoziazione, scadenza HLS, LIVE dopo `playing`, controllo dell'avanzamento temporale, retry dopo errore MJPEG/snapshot e reset delle immagini al cambio camera. Restano le prove con flussi reali, autoplay bloccato e MJPEG silenziosamente fermo.
- **F38–F39:** scadenza delle sessioni WebRTC solo senza spettatori, nessuna espulsione di camere visualizzate per saturazione; errori ICE propagati e overflow candidati esplicito. Test di sessione oltre due minuti e capacità massima.
- **F41:** abort del client collegato prima della connessione MJPEG, pulizia timeout e cancellazione del corpo upstream; cleanup degli spettatori SSE anche su errore di scrittura.
- **F42/F62 (parziale):** esclusi campanelli disabilitati; serrature e shortcut reali disabilitati nelle simulazioni. Restano gestione dell'episodio già aperto e prove di cambio configurazione durante il gesto.
- **F44/F59–F61 (parziale):** presenza HA e forceWake accendono il display Fully; presenza continua impedisce l'ambient; riabilitazione screensaver riparte da un nuovo intervallo idle; gestione errore prossimità. Il coordinamento generale standby resta aperto.
- **F47:** wake lock tardivo rilasciato dopo cleanup, richieste concorrenti evitate, recupero dopo release imprevista mentre la pagina è visibile; tre test dedicati.
- **F54:** deadline frontend 15 s (AI 30 s), anche sulla lettura JSON, cancellazione del chiamante e heartbeat senza sovrapposizioni; quattro test del ciclo richiesta. Resta da completare la cancellazione nei singoli componenti.

**Quality gate dello stato da pubblicare:** lint PASS; Vitest **96 file / 520 test PASS**; `build:all` PASS; typecheck backend PASS; audit runtime frontend e backend **0 vulnerabilità**. I due errori TypeScript nei nuovi test request sono corretti. Nessuna installazione o verifica hardware HASS/Fully è stata eseguita durante questi controlli.

Il deploy usa il workflow `Build & Publish Docker Image` su `main`, senza bump manuale della versione e senza includere `DomusUI-main.zip`. La pubblicazione GHCR e l'installazione dell'aggiornamento sul server Home Assistant sono passaggi distinti.


## 20. Terzo gruppo di correzioni — 2 ottobre 2026

- **Impostazioni concorrenti (F11):** tutte le scritture `PUT /api/config` richiedono `configVersion`; il confronto avviene dentro la coda del database. Ogni modifica reale della config, anche da layout/import o altri percorsi, incrementa la versione locale. Client obsoleti ricevono `409` senza sovrascrivere. Il frontend usa la versione su cui è stato renderizzato il form; coordina polling/SSE con gli update ottimistici e non ripristina valori ottimistici appartenenti a richieste già fallite. Test con due salvataggi concorrenti, scritture senza versione, coda e rollback.
- **Foto allarme (F48–F49):** persistenza prima dell'upload, rimozione soltanto dopo risposta positiva, retry serializzato ogni 30 secondi e al ritorno online. ACK di una foto preserva quelle aggiunte durante la richiesta; errori di upload o di scrittura della coda non vengono scambiati per conferme. Hash deterministico di evento/dispositivo/data/byte evita file duplicati ai reinvii. Acquisizione fallita ritentata al massimo tre volte, con cancellazione al cleanup; le simulazioni non scattano. Rimane il limite documentato di tre foto accodate e della disponibilità di localStorage: con storage negato/pieno è possibile solo la consegna immediata.
- **Sicurezza (F63):** `device_class: problem` produce un avviso ordinario senza fullscreen, sirena o foto. Per i problemi realmente critici la politica esplicita è classificarli `safety` in HASS. Fumo, gas, CO, acqua, calore, sirena e intrusione conservano il percorso di emergenza e l'eccezione all'opt-in.
- **Scene (F64):** unica derivazione per la home e SceneRow, solo scene scelte nel wizard e non escluse da registry/nascondi. Stati unavailable/unknown o HA offline disabilitano il controllo con motivo; il tap rivalida la disponibilità corrente. La spunta indica richiesta accettata da HA, non prova degli effetti fisici completati.
- **Energia (F67–F68):** confronto W/kW/MW normalizzato, unità sconosciute e valori invalidi scartati. Produzione distinta dal sensore domestico già identificato nella StatusHeader; nessun giudizio di copertura dal dispositivo più attivo e nessuna dichiarazione di copertura se la produzione è inferiore al consumo. Media 24h ponderata per durata degli stati, con baseline al confine e rifiuto degli intervalli unavailable; refresh energia ogni 5 minuti e acqua ogni minuto, senza fetch offline. Token semantici della card energia allineati a Light/Dark. Rimangono la scelta esplicita configurabile della sorgente solare e l'invalidazione degli storici al cambio installazione.
- **Qualità dati (F69, parziale):** boot vuoto e HA offline mostrano stato da verificare; un allarme noto offline resta indicato come ultima condizione nota. Il testo normale è “Nessun avviso ricevuto”, senza certificare sicurezza assoluta. I suggerimenti con azioni non sono prodotti offline. Il modello completo di freschezza/episodi e la gestione delle reset-snapshot restano aperti.

I test usano store/bridge simulati e storage temporaneo; non azionano serrature, scene o allarmi reali. Nuovi test: `useDashboardConfig.test.ts`, `useEmergencyMode.test.ts`, `useScenes.test.ts`, `homeDataStatus.test.ts`; estesi quelli di config atomica, foto, consumo e notifiche. Non è stato eseguito un nuovo deploy di questo gruppo.


**Ulteriori correzioni nello stesso gruppo (F22–F24):** `climateAction` centralizza l'attività: `hvac_action=idle` prevale su modalità heat; modalità fallback solo se l'azione manca/non è riconosciuta. La stanza non conta il termostato in pausa come attivo. Temperature con unità esplicita, senza conversioni o medie arbitrarie; null e stringhe vuote non diventano zero. Calendario usa `useClock.now`, aggiornato al minuto e su visibilitychange; il cambio di giorno non viene perso se l'ora coincide con quella del giorno precedente. Test dedicati `climateState.test.ts`, `useRoomsOverview.test.ts`, `useClock.test.ts`.


**Cronologia home (F15):** modifiche al contenuto del widget (tipo, entità, gruppo e altre proprietà persistite), anche senza movimenti, producono una revisione. Il confronto ignora l'ordine delle chiavi JSON. Prima della prima modifica reale viene conservata la versione precedente; snapshot indipendenti evitano modifiche accidentali della cronologia. Riepilogo italiano dei widget modificati, compatibile con revisioni precedenti senza il nuovo contatore; limite della cronologia invariato.

**Verifica finale del gruppo §20:** `npm run lint` PASS; `npm test` **103 file / 547 test PASS**; `npm run build:all` PASS; `npm run --prefix backend typecheck` PASS; `git diff --check` PASS; audit delle dipendenze runtime frontend/backend **0 vulnerabilità**. Log locali `/tmp/myhome-next-fixes-{lint,tests,build,typecheck}.log`. Le modifiche di questo gruppo sono locali, senza commit/push o nuovo deploy. La versione pubblicata rimane **2.2.113**, workflow riuscito e manifest GHCR amd64/arm64 verificato. L'installazione su HASS e il collaudo del tablet non sono stati verificati.


## 21. Ring live e ristrutturazione della regia — 2026-10-02

Richiesta: correggere lo streaming Ring e rendere la regia amministrativa ordinata e funzionale. Modifiche locali, senza nuovo deploy.

### Video Ring (F33–F41, F57)

- Rimosso il cutoff WebRTC di **4 secondi** del percorso campanello. Le capacità ricevute da HA determinano il trasporto: una camera nativa con `web_rtc` senza `hls` ha fino a **45 secondi** per negoziare e non ripiega su MJPEG dell'ultima registrazione presentandolo come live. Le camere legacy mantengono HLS/MJPEG. L'offerta WebRTC ha un timeout HTTP di 30 secondi, superiore al timeout backend di 20 secondi.
- Backoff dopo errore ICE: **10 secondi** per le camere native, compatibile con il tentativo automatico a 12 secondi; nessuna esclusione Ring per cinque minuti. Un errore ICE dopo il primo frame avvia il recupero anziché lasciare un LIVE falso.
- LIVE solo dopo `playing` con dati video disponibili; fullscreen e diagnostica ricevono lo stato reale (connessione, WebRTC/HLS/MJPEG, foto, sospensione, errore, gesto necessario per autoplay). Aggiunti avvio con tocco quando il browser blocca autoplay e riprova manuale.
- Eventi `waiting` ripetuti non spostano all'infinito la scadenza di un flusso bloccato. Snapshot fallback arresta il video precedente. Candidati remoti accodati limitati a 64.
- Fully con schermo spento o screensaver attivo sospende i trasporti; il ritorno allo stato attivo rinegozia. Uscita dalla diagnostica o cambio camera chiude peer, segnalazione, tracce e sessione HA; un'offerta arrivata dopo la chiusura viene anch'essa cancellata. Il backend sveglia subito il listener SSE alla chiusura esplicita della sessione.
- Fonti tecniche verificate: [Ring in Home Assistant](https://www.home-assistant.io/integrations/ring/), [implementazione Ring](https://github.com/home-assistant/core/blob/dev/homeassistant/components/ring/camera.py), [player WebRTC HA](https://github.com/home-assistant/frontend/blob/dev/src/components/ha-web-rtc-player.ts), [chiusura della sottoscrizione WebRTC](https://github.com/home-assistant/core/blob/dev/homeassistant/components/camera/webrtc.py). Ring distingue vista live e ultima registrazione; il percorso MJPEG può leggere un filmato precedente. Ricezione audio/video mantiene i transceiver `recvonly` del player ufficiale, senza richiedere il microfono.

**Prova reale, browser desktop e HA LAN:** 258 entità ricevute; `camera.entrata_live_view` e `camera.giardino_live_view` dichiarano esclusivamente `web_rtc`. Entrata: video **1920×1080**, `readyState=4`, `paused=false`, `currentTime` avanzato da **8,68 a 25,04 secondi**. Giardino: video **1920×1080**, `readyState=4`, `paused=false`, avanzato oltre **20,33 secondi**. Badge e diagnostica entrambi `Diretta · WebRTC`. DELETE delle due sessioni riuscite all'arresto/cambio sezione. Nessun filmato o immagine privata salvato come evidenza. Questo prova le due Ring nel browser desktop, non il firmware Fully/Android o una suonata fisica del campanello.

### Regia funzionale

- Conservate le quattro viste canoniche: Stato, Entità, Funzioni, Sistema. Sidebar con etichette e descrizioni; unica definizione condivisa con la navigazione mobile.
- Funzioni divisa in **Preferenze**, **Tablet e aspetto**, **Campanelli**, **Suoni e sicurezza**. Sistema diviso in **Connessione**, **Tablet**, **Video e Ring**, **Cronologia**. URL `?section=…`, back/forward e refresh verificati. Form esistenti e impostazioni conservati; bozze mantenute tra sottosezioni.
- Nuova diagnostica video: selezione da entità HA, lettura delle capacità, avvio esplicito, stato del primo frame, arresto e retry. Nessun avvio automatico delle camere aprendo le impostazioni.
- Palette delle quattro pagine e delle card operative migrata a token semantici Light/Dark. Target touch preservati. Corretto il bug mobile: `glass-border` sovrascriveva `position:fixed` della barra inferiore, creando una colonna laterale e tagliando il contenuto.
- HA offline non blocca la regia: avviso di dati non aggiornati e accesso a configurazione/diagnostica; overlay del kiosk conservato. Provato con un backend separato senza HA: Funzioni → Entità → Verifica connessione → Sistema funziona.
- Preferenze: versione della config acquisita alla prima modifica della bozza; un aggiornamento da un'altra finestra genera **409** senza clobber e offre il caricamento delle preferenze aggiornate. Verificati persistenza dopo refresh, mantenimento della bozza tra sottosezioni e conflitto tra due finestre su database isolato.
- Cronologia e registro distinguono caricamento/errore da elenco vuoto, con retry. Ripristino home invalida `tablet-layout` e viene disabilitato con storage in sola lettura. Messaggio meteo distingue OpenWeather assente dal possibile fallback HA.
- `docs/DESIGN_SYSTEM.md` allineato alla regia corrente.

**Verifica UI:** quattro viste a **390 / 768 / 1024 / 1440 px** in Light e Dark; contenuto principale interamente nel viewport e nessun overflow orizzontale della pagina. Screenshot ispezionati per mobile, tablet e desktop; artefatti locali in `/tmp/myhome-ring-regia/`. Scorrimento orizzontale delle sottosezioni su schermi stretti intenzionale. Nessun errore console nella prova finale della regia.

**Verifica automatica:** lint PASS; Vitest **105 file / 557 test PASS** (7 regressioni sul ciclo Ring, 2 sul criterio di trasporto, estensione della chiusura sessioni backend); build frontend/backend PASS; typecheck backend PASS; `git diff --check` PASS; audit runtime frontend/backend **0 vulnerabilità**. Log `/tmp/myhome-ring-{lint,tests,build,typecheck}.log`. La build conserva un warning informativo preesistente sul chunk `kioskDevice`, senza errori.

**Confini:** server di collaudo con copia separata del database; preferenze reali non sovrascritte. Nessuna serratura, sirena o scena reale azionata. Restano necessari il collaudo Fully sul tablet, il comportamento durante una suonata fisica e prove prolungate di perdita rete/cloud: i test di regressione simulano timeout, ICE fallita, flusso fermo e chiusura tardiva. Le altre voci aperte dell'audit conservano il loro stato. Versione pubblicata ancora **2.2.113**; queste correzioni non sono state pubblicate.

## 22. Chiusura implementativa dell'audit — 2 ottobre 2026

Questo aggiornamento integra tutti i gruppi F01–F69. Le prescrizioni originali restano come evidenza dello snapshot iniziale; non descrivono più da sole lo stato corrente. Le correzioni dei §§20–22 sono nella working tree, **non ancora pubblicate in una nuova release**. Il commit di release 2.2.113 del §19 non include queste correzioni successive. Non viene dichiarata la chiusura hardware o il funzionamento perfetto di ogni dispositivo sulla base dei soli test sorgente.

### Nuove correzioni

- **Cache, sorgente e continuità critica (F06, F20, F68–F69):** generazione HA opaca propagata via config/layout/SSE; invalidazione registry, storico e cache alla sostituzione della connessione. Risposte della generazione precedente ignorate. Snapshot vuoto/unavailable non risolve un'emergenza già osservata: rimane un ultimo avviso noto da verificare fino a uno stato valido di risoluzione. Nessuna falsa quiete durante inizializzazione. Cache kiosk validata anche su geometria, gruppi e configurazione; solo guasti temporanei autorizzano fallback, con banner. Logout e 401/403 revocano cache e scritture tardive.
- **Restore e ingressi (F16–F19):** backup v2 è uno snapshot, non un merge implicito; opzionali omessi tornano ai default, credenziali locali conservate. JPEG realmente decodificato prima del salvataggio, limite 4 MP. Parser calendario e decoder lavorano in worker limitati, deadline 3s e massimo due lavori contemporanei. Foto AI: limite condiviso 8 persone × 3 immagini, budget complessivo, nessuna omissione silenziosa; immagini false/invalide rifiutate anche su import.
- **Meteo e unità (F21, F23, F67):** fuso IANA della località e giorno italiano calcolato per ogni istante, incluso DST; temperature null/vuote non diventano zero; recap e card conservano unità, medie convertite prima del calcolo. Produzione fotovoltaica scelta esplicitamente in Funzioni, distinta dal consumo; senza sensore il confronto è spento.
- **Modalità, focus e storage (F10, F25–F27, F46, F52, F55–F56):** storage negato non interrompe inizializzazione/deduplicazione; audio condiviso reattivo; tema gestito da un solo controllore con fallback OS immediato, lux e luma distinti, priorità manuale e isteresi. Bridge Fully tardivo rilevato senza reload. Un solo stack coordina Escape, Tab, focus e background inert per sheet, catalogo Spazi, video, campanello ed emergenza; chiusure touch 44px, appearance semantiche.
- **Video, campanelli e risorse (F36, F40–F44, F50–F51, F54, F57):** lease del MJPEG rinnova soltanto su frame JPEG completi, annulla letture bloccate e riconnette; anteprime sospese dietro campanello/video prioritario, ambient, display spento o emergenza. Campanelli disabilitati rimossi subito; reconnect/unavailable non simulano suonate; coda limitata per eventi simultanei recenti, consumo di tutte le transizioni. Test richiede ID configurato. AI abortita alla chiusura; schermata nativa svegliata da campanello/presenza. Foto screensaver fallite escluse con fallback orologio; preload e recap sospesi a schermo spento; perf-lite reattivo. Meteo/news/AI usano richieste con deadline e cancellazione.
- **Azioni e standby (F53, F58–F62, F65):** mutex condiviso per entità, transizioni serratura non reinviabili, rollback soltanto se il dato ottimistico è ancora proprio. Simulazione impedisce comandi anche da hold già iniziati. Suggerimenti richiedono area conosciuta comune e rivalidano al tap stato/azione. Wake centralizzato: emergenza/campanello prioritari, spegnimento manuale sospende sensori per 30s; presenza ancora attiva rivalutata alla scadenza. Luminosità manuale mantenuta per 10 minuti. Touch e comando esplicito annullano il blocco.
- **SPA, release e toolchain (F28–F32):** asset mancanti e API sconosciute restituiscono 404; chunk obsoleti propongono ricarica esplicita con avviso di editing non salvato, senza reload automatici o loop. Manifest aggiornato su main fresca con retry e divieto di downgrade; latest promosso solo dopo il manifest. Runtime Node24 come CI, smoke dell'immagine finale su amd64/arm64 con auth/persistenza/read-only e worker. Toolchain esbuild compatibile aggiornata, build verificata. Contratto completo in `SETTINGS_CONTRACT.md`; forceCelsius/advancedMode esplicitamente deprecati, geometria corrente 3×38 documentata.

### Stato per ID

**Legenda:** implementato = codice presente; verificato automatico = regressioni controllate in test; browser = prova specifica indicata sotto; hardware/CI finale = collaudo ancora necessario. Nessun ID è considerato chiuso hardware per deduzione.

| ID | Stato implementativo e prova | Collaudo residuo |
|---|---|---|
| F01–F05 | Implementati: overlay kiosk, aggiornamento, stream dati/fallback/resync; test stream e stato | Disconnessione HA reale durante uso continuativo tablet |
| F06 | Implementato: invalidazione registry/query/cache per generazione; test generazioni tardive | Cambio installazione HA con browser già aperto |
| F07–F08 | Implementati: ACK correlati, completamento audio/restart onesto; test protocollo | Audio udibile e restart Fully reale |
| F09–F10 | Implementati: volume default corretto, accesso storage protetto; test sound/storage | WebView con policy storage negata |
| F11–F15 | Implementati: CAS config, errori storage, commit atomico/migrazione, revisioni semantiche; test concorrenti/fault injection | Volume del container finale |
| F16 | Implementato: restore snapshot e credenziali locali; test export/import | Restore su add-on installato |
| F17–F18 | Implementati: JPEG reale e calendario in worker; test payload ostili/deadline + JPEG su backend compilato | Gate container delle due architetture |
| F19–F20 | Implementati: immagini/budget condivisi, cache validata e revocabile; test invalidità/budget/permessi/epoch | Foto Gemini reali e cache su WebView |
| F21–F24 | Implementati: fuso/DST, HVAC action, null/unità, clock calendario; test specifici | Sensori reali con unità differenti |
| F25–F27 | Implementati: stack focus, touch, theme fallback; test tema + browser stack | Tastiera/accessibilità Fully |
| F28 | Implementato: SPA allowlist/404, recupero esplicito chunk; API/asset provati sul backend compilato | Sessione aperta attraverso deploy reale |
| F29 | Implementato: retry manifest e latest condizionato; fixture git con main avanzata conserva commit umano e impedisce downgrade | Workflow reale dopo pubblicazione |
| F30 | Implementato gate finale Docker e Node24 allineato | **Smoke Docker locale non eseguito: daemon non disponibile; CI amd64/arm64 non ancora eseguita su questi fix** |
| F31 | Implementato esbuild aggiornato compatibile; build e audit completi | Ripetere audit nel workflow release |
| F32 | Implementato censimento `SETTINGS_CONTRACT.md`, deprecazioni e allineamento geometria | Prova save→read→effetto su ogni setting nel tablet reale |
| F33–F35 | Implementati cleanup/listener/deadline/playing/autoplay; test CameraStream; Ring live verificato nel §21 | Autoplay e ripresa sul tablet |
| F36 | Implementato lease client + frame watchdog proxy; test stallo/chunk/header-only | MJPEG reale fermo dopo primo frame |
| F37–F39 | Implementati retry snapshot, lease WebRTC e gestione ICE/sessioni; test player/proxy | Sessioni Ring lunghe e perdita rete fisica |
| F40–F41 | Implementati sospensione per owner/stato native/emergenza e abort precoce/lettura bloccata | Verifica consumo risorse su GPU tablet |
| F42–F44 | Implementati disattivazione/coda/baseline/recent timestamp/wake; test transizioni | Due suonate simultanee e display fisicamente spento |
| F45–F47 | Implementati emergenza iniziale, priorità tema/brightness, wake lock cleanup; test hook | Screen-on/luminosità/wake lock Android |
| F48–F49 | Implementati coda persistente con ACK, retry, idempotenza e scatto solo reale; test upload/route | Fotocamera e riavvio tablet offline |
| F50–F52 | Implementati errori foto/perf-lite/recap offline/focus; test recap + browser stack | Tutte le foto guaste, sensore screenOff e accessibilità tablet |
| F53–F57 | Implementati mutex/rollback, deadline/cancel, audio condiviso, bridge tardivo e testi onesti; test action/Fully/audio/player | Test udibile/native bridge e rete lenta reale |
| F58–F62 | Implementati wake unico, presenza iniziale/permanenza, timer, cleanup sensore e simulazione sicura; test wake/Fully/azioni | Priorità e sensori Fully sul tablet |
| F63–F65 | Implementati problem non critico, scene esplicite, clima correlato e rivalidato; test critical/scene/insight/actions | Pulsanti e attuatori solo in collaudo autorizzato |
| F66–F69 | Implementati baseline acqua, unità/potenza esplicita, storico pesato/rinnovato, qualità dati e continuità allarmi; test acqua/energia/generazioni | Continuità di una giornata con HA e sensori reali |

### Verifiche di questa consegna

Suite completa, lint, build frontend/backend e typecheck backend rieseguiti; risultati finali riportati sotto. Backend compilato avviato con database isolato: upload JPEG autentico esercita il worker di produzione; `/api` e asset inesistenti 404, `/kiosk` SPA 200. Fixture git isolata esercita un push non-fast-forward, conserva il commit concorrente e rifiuta una release più vecchia. Non è stato eseguito alcun comando a serrature, scene, sirene o altri attuatori domestici per simulare i test.

Browser: Funzioni → Tablet e aspetto in Light/Dark, selettore fotovoltaico e stato sorgente; a 390px nessun overflow orizzontale. Fixture browser del modulo stack reale: due modali, Escape chiude solo la superiore e ripristina focus prima sul trigger interno poi su quello iniziale. Screenshot in `/tmp/myhome-all-audit-smoke/screenshots`. È una prova del coordinatore, non una prova completa degli overlay con un'emergenza fisica.

**Esito finale locale:** `npm run lint` PASS; `npm test` **116 file, 601 test PASS**; `npm run build:all` PASS; `npm run --prefix backend typecheck` PASS; audit frontend/backend runtime e backend completo **0 vulnerabilità**; `git diff --check` PASS. Worker calendario compilato provato separatamente oltre al JPEG nel backend. Prova browser aggiuntiva: Tab resta nella modale superiore, background inert durante lo stack, nessun elemento inert residuo dopo entrambe le chiusure.

**Residui di accettazione, non mascherati come fix chiusi:** Docker daemon locale assente; gate dell'immagine amd64/arm64 predisposto ma non eseguito su questa working tree. Non verificati su dispositivo reale: accensione fisica display, sensori e audio Fully, wake lock Android, scatto camera, suonate simultanee, video continuativo e memoria di una giornata. Il §21 contiene la precedente prova Ring reale; questa sessione non la sostituisce con una nuova prova dopo tutte le modifiche. Pubblicazione e installazione di questi ulteriori fix non ancora effettuate.

**Toolchain frontend aggiuntiva:** il controllo completo (incluse devDependencies) ha rilevato 9 advisory oltre all'ambito runtime inizialmente controllato. `npm audit fix` ha aggiornato 21 dipendenze compatibili senza force; dopo l'aggiornamento audit completo frontend e backend entrambi **0 vulnerabilità**, suite **601/601** e gate rieseguiti. Questo controllo estende F31 anche alla toolchain frontend.

## 23. Rilascio e collaudo dell'immagine — 2 ottobre 2026

Su autorizzazione «Procedi» è iniziata la pubblicazione dei fix dei §§20–22. Docker Desktop locale avviato; ricostruita l'immagine finale ARM64 e verificati avvio non-root, DB con permessi 0600, upload JPEG attraverso worker compilato, worker calendario, SPA/404, riavvio con persistenza, read-only e login admin/kiosk con cookie HttpOnly/SameSite. Il caso required senza credenziali deve fallire e viene verificato come tale. Nel test protetto `/api` anonimo restituisce 401, dopo login admin 404: l'asserzione iniziale del test container è stata corretta per rispettare l'autenticazione.

Preflight LAN: HA raggiungibile, versione installata 2.2.113, bridge WebSocket con 258 entità; un tablet Fully online con canale audio dichiarato ready. Backup config v2 pre-rilascio salvato localmente in `/tmp/myhome-release-backup/config-before-release.json`, permessi 0600, contenuto non stampato. Le informazioni di heartbeat non dimostrano audio udibile né esecuzione fisica di screen-on.

Gate locali ripetuti prima del rilascio: lint, 601 test, build frontend/backend e typecheck backend PASS. Pubblicazione, architettura AMD64 e installazione verranno registrate con gli esiti effettivi; nessun risultato ancora atteso viene dichiarato superato.

**Immagini locali:** smoke ARM64 e AMD64 entrambi PASS nelle quattro modalità direct/restart/readonly/protected; caso auth required senza credenziali correttamente rifiutato. AMD64 è eseguito su host ARM64 tramite emulazione Docker Desktop, non su hardware x86 fisico. Questo chiude il precedente impedimento Docker locale di F30; resta da verificare il workflow e il digest realmente pubblicato.

**Primo tentativo CI:** commit `21941a7`, workflow `36998138241` fermato prima del publish da `npm ci`: mancavano tre dipendenze opzionali @emnapi nel lockfile prodotto su macOS. Lock rigenerato in ambiente Linux Node24, `npm ci` pulito verificato sia Linux sia macOS; lint, 601 test, build e typecheck ripetuti con successo. Nessuna immagine incompleta è stata pubblicata dal tentativo fallito.

**Pubblicazione verificata:** 2.2.115 dal commit `2de9df6`, workflow https://github.com/davidep01/MyHome/actions/runs/36998350948 SUCCESS (include smoke finali amd64/arm64). Manifest multiarch pubblicato con digest `sha256:1aee7e56aadacd892fbda76de0c834dbedea3cbcfd7c887403ab9b4a1ad6b744`, architetture linux/amd64 e linux/arm64; manifest add-on allineato automaticamente dal commit `ddc0cc2`.

**Installazione HASS verificata:** `update.myhome_dashboard_update` riporta installed/latest 2.2.115, in_progress false. La regia aperta prima dell'installazione ha mostrato progress 70% e si è aggiornata automaticamente a v2.2.115; backend riconnesso, 258 entità, storage scrivibile. Backup HA richiesto con l'installazione; la richiesta di versione esplicita iniziale era stata rifiutata perché questa entità supporta installazione/backup ma non scelta versione. Installazione latest avviata solo dopo aver verificato latest=2.2.115.

**Ulteriore difetto rilevato durante il collaudo:** la chiamata HTTP update.install può scadere prima che il Supervisor termini l'installazione. Il proxy ha restituito 502, ma lo stato HA confermava l'installazione in corso e poi completata. Corretto il messaggio regia: errore di rete/5xx dopo l'avvio è «esito non confermato», non «aggiornamento fallito»; la prima azione successiva verifica lo stato senza reinviare l'installazione. I rifiuti HTTP 4xx espliciti restano errori. Diagnostica backend distingue esito incerto da rifiuto. Test di regressione timeout/502/408/rifiuto/controllo iniziale aggiunti. La correzione seguirà nel successivo rilascio automatico.

**2.2.116 pubblicata e installata:** workflow https://github.com/davidep01/MyHome/actions/runs/36999095530 SUCCESS; digest multiarch `sha256:51cfeadaf6cf026968708bf982f5f80cf8d941991b10a615ba46c7bd25de31be`; installed/latest 2.2.116 e frontend v2.2.116 osservati. Gate della correzione update: 603 test PASS, lint/build/typecheck PASS.

**Ring live nell'installazione LAN:** Entrata WebRTC 1920×1080, readyState 4, non paused, currentTime avanzato oltre 114s; Giardino nelle stesse condizioni oltre 155s. Stato «Diretta · WebRTC» solo con frame reali. «Ferma video» su entrambe rimuove il video dal DOM (conteggio zero). Non è una prova di una giornata di streaming sul tablet.

**Tablet reale:** target 6081a3f6-746177fd online con Fully disponibile; screenOn, audioTest e reload confermati completed da ACK correlati, reload completato dopo nuovo avvio. Un ulteriore ciclo screenOff → screenOn è stato accettato, ma il valore screenOn letto dal fleet apparteneva a un heartbeat precedente: non viene usato come prova visiva di spegnimento fisico.

**Regressione audio scoperta dal ciclo standby:** dopo riaccensione una nuova audioTest è rimasta pending perché `HTMLMediaElement.play()` non terminava. Tablet recuperato con screenOn/reload, entrambi completed. La verifica del canale ora ha deadline 5s, una sola richiesta pending per elemento, cancellazione su cleanup e nessun falso ready da risoluzioni tardive; in assenza di riproduzione confermata torna needs-interaction/audio-blocked. Anche la verifica HEAD dell'asset sirena nativa ora è limitata a 5s e cancellata al cleanup, con fallback TTS e nessun annuncio tardivo dopo chiusura. Test deadline, cleanup e risoluzione tardiva aggiunti; gate locali completi **607 test PASS**. Queste ultime correzioni sono destinate al successivo rilascio automatico.

### Esito finale del rilascio e prosecuzione del collaudo

- **Versione finale 2.2.117 pubblicata e installata**, commit sorgente `fac92a2`, workflow https://github.com/davidep01/MyHome/actions/runs/37000244241 SUCCESS. Test CI dell'immagine finale sia linux/amd64 sia linux/arm64; manifest pubblicato con digest `sha256:43db99997d74c3818a3300f7fb1828e1ff689efdf402ba567888ae4653af7864`, manifest add-on aggiornato automaticamente dal commit `be9b427`.
- Installazione dal pulsante reale della regia «Controlla e aggiorna ora»: HA installed/latest 2.2.117, in_progress false; regia v2.2.117 caricata automaticamente al ritorno del servizio. Bridge WS con 258 entità, storage scrivibile, nessuna caduta del bridge dall'ultimo avvio.
- **607 test PASS**, lint, build frontend/backend e typecheck backend PASS; audit completo frontend/backend entrambi 0 vulnerabilità. I test includono gli ulteriori difetti update/audio emersi dal collaudo, oltre ai 601 della prima consegna.
- Dopo l'installazione finale, tablet Fully: screenOn, audioTest e reload nuovamente completed con commandId correlato; reload confermato dal nuovo avvio. Questi esiti digitali non sono una prova uditiva/visiva davanti al dispositivo.
- Confronto export v2 pre/post aggiornamento: nessuna impostazione cambiata, stanze ed entità invariate. Il backup locale pre-rilascio e la richiesta di backup HA delle installazioni precedenti restano disponibili; l'ultimo aggiornamento dal pulsante regia usa il comportamento ordinario del servizio HA.
- **Monitoraggio 24 ore attivo**, heartbeat dell'app `collaudo-s-i-m-i-24-ore`, ogni 15 minuti. Finestra fino al 3 ottobre 2026 11:22:31 UTC / 13:22:31 Europe/Rome; al giro conclusivo raccoglie l'ultimo campione, produce riepilogo e si mette in pausa. Baseline e campioni in `docs/COLLAUDO_24H_2026-10-02.jsonl`. Nessun comando a impianto/tablet, nessuna nuova sessione Ring avviata dal monitor. L'esecuzione dipende dalla disponibilità del computer/app e della LAN; campioni periodici e contatori non provano assenza di ogni interruzione tra i campioni.

**Ancora da accettare sul dispositivo fisico:** ascolto dell'audio, accensione/spegnimento visivo e wake da sensori/presenza, suonate simultanee, fotografia opt-in e accessibilità WebView. La sessione Ring reale Entrata/Giardino è verificata con frame e avanzamento temporale, ma non rappresenta streaming continuativo per 24 ore sul tablet. Non sono stati attivati allarmi reali, scene, serrature, sirene HA o alterati stati di sensori domestici per simulare prove.

**Passaggio visivo sull'installazione finale:** Funzioni → Tablet e aspetto in Light/Dark, v2.2.117 confermata nel DOM, a 390px nessun overflow orizzontale. Screenshot `/tmp/myhome-release-browser/functions-117-*.png`; preferenza appearance del browser riportata ad Auto dopo la prova. Nessuna configurazione condivisa alterata.


## 24. Correzione interfaccia kiosk Liquid Glass — 3 ottobre 2026

Su richiesta dell'utente applicate le correzioni grafiche del [report kiosk, §14](AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md#14-correzioni-applicate--3-ottobre-2026): materiali stratificati Light/Dark, altezze card preservate, layout M/XL, controlli touch reali, editor accessibile, scorrimento informativo e dettagli dei gruppi, rappresentazione onesta degli stati HA e dati mancanti, blur disattivato nei profili leggeri, priorità della richiesta audio nella shell. Nessun comando a impianto/HA/Fully, sessione Ring o cambio configurazione condivisa eseguito.

Verifica locale: lint, **626 test / 117 file**, build frontend/backend e typecheck backend PASS. Matrice grafica di 470 configurazioni sintetiche, più editor e stanza stretta; evidenze in `docs/kiosk-fixes-2026-10-03/`. Questo non equivale a collaudo fisico né a streaming/audio/wake provati. Deploy di queste modifiche non effettuato. Il monitoraggio precedente non è stato riattivato; le affermazioni sul rilascio 2.2.117 del §23 restano storiche e non attestano installazione delle correzioni di questo paragrafo.

### Priorità aggiuntiva: controlli interattivi

Corretti ruota temperatura, snapping frazionario condiviso, sincronizzazione con nuovi valori HA, annullamento slider, luminosità zero, disabilitazione ai limiti e durante stati non azionabili, pressioni prolungate e cambio dispositivo nei pannelli. Registro dettagliato e accettazione in [audit grafico, §15](AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md#15-priorità-ai-controlli-interattivi--3-ottobre-2026). **640 test / 118 file**, lint, build frontend/backend e typecheck PASS. Prove browser solo locali con richieste HA rifiutate; touch/multitouch e timer di hold non collaudati sul tablet. Deploy non eseguito.

### Tendina Telecamere vuota

Diagnosi LAN in sola lettura: Entrata/Giardino presenti in HA e nei campanelli attivi, ma senza `deviceOverrides.enabled: true`. Il filtro della tendina ignorava la configurazione del campanello. Corretto nel sorgente per riconoscere entrambe le forme di selezione, rispettando disabilitazioni/nascondimenti. Il pulsante globale riporta alla home quando aperto da una stanza. Registro in [audit grafico §16](AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md#16-pulsante-telecamere-senza-camere--3-ottobre-2026). Tre regressioni aggiunte: totale **643 test PASS** e gate completi PASS. Nessun nuovo stream, deploy o cambio configurazione.


## 25. Deploy delle correzioni kiosk — 3 ottobre 2026

**2.2.118 pubblicata e installata**: sorgente `bdd027e`, workflow https://github.com/davidep01/MyHome/actions/runs/37109502878 SUCCESS; smoke finali amd64/arm64, quality gate e 643 test PASS. Manifest digest `sha256:9a0845ceb54fbaa9e338d65ee3593b16975165cef08dd09f54c65bbe83b9b644`, aggiornamento automatico add-on `7347fe2`. HA conferma installed/latest 2.2.118, in_progress false; health/HA/storage OK, nessuna caduta del bridge dal nuovo avvio. Export pre/post identico nella sezione store. Backup portatile pre-deploy locale v2 senza segreti, permessi 0600.

Pulsante Telecamere verificato sulla LAN: dopo clic compaiono Entrata/Giardino e arrivano frame reali su entrambe; readyState 4 e currentTime avanzante. Stream di prova chiusi; nessun frame privato salvato. Tablet Fully online, screenOn=true, audioChannel=ready sono esiti digitali, non prove fisiche. Registro completo nell'ultima sezione del [report grafico](AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md). La prova di questa sessione non certifica video continuativo, wake, audio udibile o gesti touch su Android. Monitor precedente non riattivato.


## 26. Card media: copertina persistente e aggiornamento live — 2026-10-03

Corretti caricamento/fallback delle cover, conservazione in stato `off`, invalidazione della cache al cambio contenuto e refresh periodico di 30 s. Alternativa automatica dopo errore o timeout, con retry; allowlist backend allineata alle proprietà immagini già utilizzate dal frontend, senza autorizzare URL arbitrari. Copertina intera in regione dedicata e pulsanti touch anche in XS/S. Dettagli, screenshot e matrice di collaudo nel §17 di [AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md](AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md). Verifica locale con dati fittizi: lint, 647 test, build:all e typecheck backend; nessun deploy o comando sull'impianto.


## 27. Distribuzione correzione media — 4 ottobre 2026

**2.2.119 pubblicata e installata in LAN.** Commit sorgente `6507f8d`, workflow [37217503550](https://github.com/davidep01/MyHome/actions/runs/37217503550) SUCCESS; 647 test, lint, build:all, typecheck backend e audit runtime frontend/backend (0 vulnerabilità) PASS. Smoke finali amd64/arm64 PASS. Manifest multiarch `sha256:dd9f21c6adea26c8568fabfb78402bf98cba61f2df11df0a2c668e020a9fcdda`; manifest add-on aggiornato automaticamente dal commit `7107122`.

Installazione richiesta una sola volta tramite l'entità update dedicata. La connessione HTTP si è chiusa durante il riavvio; nessun reinvio: il successivo controllo HA ha confermato installed/latest `2.2.119` e in_progress false. `/api/health` HTTP 200, storage scrivibile, HA raggiungibile e bridge WS connesso con 260 entità. La SPA kiosk restituisce il bundle `index-DhydO0Bx.js` contenente la versione 2.2.119 e la nuova gestione cover. Export v2 pre/post senza segreti: sezione store identica. Backup locale protetto in `/tmp/myhome-media-release-2026-10-04/config-before.json`.

Il controllo remoto verifica installazione, bundle e servizi, ma non dimostra ricezione di una copertina reale da ogni integrazione o resa sul tablet fisico; la verifica grafica Light/Dark con dati fittizi resta documentata nel §17 dell'audit grafico.
