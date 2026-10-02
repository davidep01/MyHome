# Contratto impostazioni S.I.M.I. — 2 ottobre 2026

Fonte dei tipi: `backend/src/db/types.ts`. Validazione: `backend/src/lib/config-validation.ts`. Persistenza atomica: `backend/src/db/client.ts`. Ogni PUT config richiede `configVersion`; il conflitto restituisce 409. La proiezione kiosk è `tabletHomeLayout` in `home-layout.ts`: contiene soltanto dati operativi, mai credenziali o foto biometriche. I default effettivi sono in `defaultConfig()`; assenza di un opzionale significa comportamento indicato sotto.

| Setting | Controllo / default | Consumer / proiezione kiosk | Verifica |
|---|---|---|---|
| haUrl, haToken | Sistema; env prevale e blocca il form | Bridge backend; token mascherato admin, assente kiosk | config/security/HA generation tests |
| configVersion | Automatico, intero crescente | Tutti i writer; confronto dentro la coda DB | due salvataggi concorrenti, import/layout |
| weatherCity | Preferenze; Milan,IT | route weather, widget; città nel layout | config + weather timezone tests |
| newsCategory, newsFeedUrl | Preferenze/API; technology e feed ANSA | route news, widget | config/news tests; richiesta client con deadline |
| calendarFeedUrl | Preferenze, assente | route calendar; worker limitato, widget con clock | calendar/config tests |
| userName, dashboardName | Preferenze; Davide/S.I.M.I. | Header e titolo | config save/read tests |
| hiddenEntities | Entità; [] | discovery, home; kiosk sì | curation/composer tests |
| deviceOverrides.label/icon/type/areaId | Dettaglio Entità; assenti | discovery e renderer; kiosk sì | discovery/curation/card tests |
| deviceOverrides.hero/cardSize/cardSizes/showWhenActive/enabled | Dettaglio Entità; auto/abilitata | composer e geometria; kiosk sì | composer/card-size tests |
| solarProductionEntityId | Funzioni → Tablet; assente = confronto spento | EnergyCard; kiosk sì; solo sensor distinto dal consumo | selezione esplicita e unità energia tests |
| forceCelsius | **Deprecato**, compatibilità backup; nessun toggle | Nessun consumer: card rispettano unità HA; medie aggregate convertite prima del calcolo | null/unità climate tests |
| advancedMode | **Deprecato**, compatibilità backup; nessun toggle | Sostituito da kiosk.homeMode | home layout tests |
| doorbell.entityId/cameraEntityId | Legacy, migrato su lettura | compatibilità; usare doorbells | config migration tests |
| doorbells.id/name/location/entityId/cameraEntityId | Funzioni → Campanelli; [] | useDoorbells, alert e camera; kiosk sì | validation + transitions/camera tests |
| doorbells.active/priority/sound/volume | Funzioni; attivo, medium, preset, volume 0..1 | evento/coda/suono; kiosk sì | validation, sound e transitions tests |
| doorbells.lockEntityIds/shortcuts | Funzioni; [] | hold 900ms, non operativi in simulazione | shortcuts/lock action tests |
| groups.id/label/icon/type/entityIds | Entità; [] | GroupCard e dettaglio; kiosk sì | groups/config tests |
| home.widgets/order/positions | Editor kiosk; layout iniziale normalizzato | griglia schema 3, 3 colonne, riga 38px; kiosk sì | packing, cache geometry, layout CAS tests |
| home.layoutVersion/updatedAt/updatedBy/lastValidPositions | Automatici | concorrenza, cronologia, recupero | history e layout tests |
| dashboardLayout.cols/items | Compatibilità API delle precedenti griglie | percorso legacy; non determina la home composer | validazione/migrazione layout |
| kiosk.homeMode | Funzioni; composer | TabletDashboard: composer/grid | config e layout tests |
| kiosk.wakeEntityId | Funzioni; assente = nessun sensore HA aggiuntivo | AmbientLayer; sensori nativi restano attivi | wake policy tests; hardware necessario |
| kiosk.perfProfile | Funzioni; balanced | usePerfMode, perf-lite reattivo | storage/performance tests |
| kiosk.screensaver.enabled/idleSeconds | Funzioni; true/180s | AmbientLayer; riattivazione riparte da timer completo | lifecycle; hardware necessario |
| kiosk.screensaver.slideSeconds/brightness | Funzioni; 20s/28 su 255 | slideshow e Fully; override manuale prioritario | config/Fully tests |
| kiosk.screensaver.source/sourceUrl | Funzioni; local, URL assente | endpoint locale/Google con allowlist | screensaver routes tests |
| kiosk.screensaver.recapEntityIds | Funzioni; undefined=auto, []=nessuna | recap grounded; annullato offline/schermo spento | recap tests |
| alarm.photo/shortcuts | Suoni e sicurezza; foto opt-in false, [] | scatto, coda persistente, pulsanti hold | photo route/upload queue/action tests |
| ai.doorbellVision/faces | Campanelli; visione attiva, volti [] | backend Gemini; kiosk riceve solo flag | AI, face validation/limits tests |

## Preferenze locali e comandi

Tema (Auto/Giorno/Notte), volume/mute, abilitazione audio, performance misurata e override diagnostici restano per dispositivo. Storage negato usa fallback di sessione. Auto: scelta manuale > lettura Fully valida > lux browser > appearance sistema; luma è una scala distinta 0–255, mai etichettata lux. Debounce 3s con isteresi. Le capability native dichiarano disponibilità; non dimostrano esecuzione fisica.

Wake unico: emergenza e campanello hanno priorità sullo standby; tocco, comando remoto e evento nativo riattivano esplicitamente. `screenOff` manuale sospende il wake automatico per 30s, senza impedire emergenze; presenza già attiva evita l'ambient e la presenza iniziale viene valutata. La luminosità manuale prevale sull'adattamento per 10 minuti. Senza Fully si può risvegliare l'interfaccia ma non garantire l'accensione del display Android. Il wake lock browser è distinto da queste azioni.

## Limiti e restore

Volti: 8 persone, 3 JPEG per persona, 400.000 caratteri per foto e 2.500.000 complessivi; immagini realmente decodificabili. Nessun riferimento viene scartato silenziosamente. Worker calendario/JPEG: massimo 2 simultanei, deadline 3s, memoria limitata. Calendario sorgente massimo 1 MiB. JPEG massimo 4 MP.

Backup v2 è uno snapshot: gli opzionali omessi tornano ai default; conserva soltanto le credenziali HA locali. v1 resta compatibile. Cache offline kiosk: geometria e config validate, appartenenza all'installazione verificata, banner visibile; non copre 401/403, JSON invalido o config incompatibile. Cambio HA invalida registry, dati storici e cache precedente.

Le prove automatiche save/read e i consumer sopra non equivalgono a una prova completa save→read→effetto su ogni dispositivo: tablet, attuatori, sensori e servizi esterni richiedono la matrice hardware dell'audit.
