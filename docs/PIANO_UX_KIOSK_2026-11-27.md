# S.I.M.I. — Piano UX del kiosk e ottimizzazioni

**Data:** 27 novembre 2026 · **Stato:** proposta; **Fase 0 implementata** il 27/11 sera (vedi §5), non ancora rilasciata.
**Versione analizzata:** `2.2.128` (commit `f8431b7`, la stessa installata sull'add-on).
**Riferimenti di design:** l'app Casa di Apple e **Apple HomeView**, il display smart da casa presentato il 13 ottobre 2026. Le regole citate vengono dalla copia locale della HIG Apple aggiornata al 21 novembre 2026. I fatti su HomeView vengono da fonti giornalistiche (§8), non da una pagina Apple.

Questo piano **non riapre** il lavoro già chiuso negli audit di ottobre: [AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md](AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md) (G01–G26) e [AUDIT_TECNICO_FIX_2026-10-01.md](AUDIT_TECNICO_FIX_2026-10-01.md) (F01–F69). Parte da quello che resta e da quello che è cambiato dopo: home bento, card che si palesano e home che impara (2.2.123–2.2.128).

---

## 0. In breve

1. **Il tablet non è collegato all'add-on.** Dal riavvio dell'add-on (26/11, 12:16 ora italiana) nessun tablet ha mandato l'heartbeat e lo stream dati non aveva client. La regia non può segnalarlo: l'elenco dei tablet vive solo in memoria e un riavvio lo svuota.
2. **La home reale è vuota per configurazione.** Nel wizard non c'è nessun dispositivo attivato (0 su 279 entità). Esistono 14 override di prima dell'opt-in (allarme, luce, media, robot, cancello…), ma nessuno ha `enabled: true`.
3. **Le card che si palesano ignorano le tue scelte.** Delle 5 card visibili ora sul tablet, 4 sono luci che hai **nascosto** esplicitamente. In più si duplicano: l'uscita multipla Sonoff compare accanto ai singoli canali.
4. **In verticale la griglia esce dallo schermo.** A 800×1280 la home è larga 1017 px e la quarta colonna di card resta tagliata fuori.
5. **Non si legge da lontano.** Le tessere sono grandi, ma nomi e stati sono a 13 px su tutte le taglie. Le etichette dell'header sono a 9 px, sotto il minimo HIG di 11 pt.
6. **Le card cambiano posto da sole.** Il riordino appreso e le tessere doppie per i più usati tolgono la memoria spaziale, che su un pannello a muro conta più di tutto. Apple tiene le posizioni stabili e mostra i suggerimenti in una zona separata.
7. **La categoria scelta nel wizard non cambia la card.** Un relè classificato come luce resta un interruttore verde «Acceso». Il cancello resta un toggle «Spento».
8. **Tema scuro:** le icone delle stanze sono invisibili, con contrasto circa 1:1.

**Direzione proposta:** una «Home View» di S.I.M.I. presa dai pattern di Apple e adattata al nostro canone. In alto la barra delle categorie, poi i **preferiti in posizioni fisse**, una fascia **Adesso** separata e le stanze. A schermo inattivo **quadranti** al posto del solo orologio, **due densità** (da lontano e da vicino) e una **modalità ospiti**. Dettagli nel §4, fasi nel §5.

---

## 1. Metodo e limiti

| Verifica | Come | Esito |
|---|---|---|
| Collegamento add-on ↔ HA | `/api/health`, `/api/system/status`, `/api/system/errors` sull'add-on LAN (sola lettura) | OK: WS connesso, HA a ~11 ms, nessun errore registrato |
| Stream dati | Apertura di `GET /api/ha/stream` per 8 s | OK: 279 entità nello snapshot, nessuna disconnessione |
| Tablet | `/api/kiosk/devices` + client dello stream | **Nessun tablet registrato, 0 client** prima della prova |
| Configurazione reale | `GET /api/config/export` (backup v2, `secretsIncluded:false`) | 0 dispositivi `enabled`, 14 override legacy, 227 `hiddenEntities`, screensaver spento, `homeMode: composer` |
| Kiosk dal vivo | Backend isolato dal sorgente (porta 3199, copia del DB in scratchpad, `HOME_AI_CORE=off`) + build di produzione servita da `vite preview`, dati reali di HA | Scenario A con la configurazione reale; scenario B con 14 dispositivi attivati. 1280×800 light/dark, 800×1280 |
| Misure | DOM e stili calcolati, rettangoli, contrasti, frequenza dei delta HA, long task | Vedi registro §3 |
| Gate di partenza | `npm run lint`, `npm test`, `npm run --prefix backend typecheck`, `vite build` isolato | lint OK · **887/887 test** (145 file) · typecheck OK · build OK con l'avviso noto `INEFFECTIVE_DYNAMIC_IMPORT` |

**Limiti.** Nessun comando è stato inviato a HA: solo aperture di pannelli e navigazione. Non è stato avviato nessuno stream video e non è stata scritta nessuna configurazione sull'add-on. Il browser è Chromium su Mac, non il WebView del tablet: fluidità, GPU, touch e Fully restano da provare sul dispositivo (§6). `build:all` non è stato eseguito perché avrebbe sovrascritto la `dist/` servita dal backend locale ancora acceso.

**Evidenze visive.** 11 screenshot in `output/ux-kiosk-2026-11-27/`, cartella ignorata da git. Il repository è **pubblico** e gli screenshot contengono il tuo nome, i nomi dei dispositivi e la località: per questo non stanno in `docs/`.

---

## 2. Cosa prendere da Apple e cosa no

### 2.1 Cosa insegnano Casa e HomeView

| Pattern Apple | Cosa vuol dire per noi | Oggi in S.I.M.I. |
|---|---|---|
| **Riepilogo per categorie in alto** (Clima, Luci, Sicurezza, Acqua…). Ogni voce apre la vista di quella categoria. | Da qualunque punto si risponde con un colpo d'occhio a «quante luci accese?» e «la casa è chiusa?» | L'header mostra valori (temperature, kW, allarme) ma non porta a viste per categoria |
| **Sezioni per stanza con tessere stabili.** Le stanze sono raccolte in un'unica pagina e l'ordine lo decide l'utente («Edit Home View»). | Memoria spaziale: il cancello è sempre in basso a destra | Griglia piatta riordinata dall'uso, con tessere doppie ai più usati |
| **Tessera = icona + nome + stato.** Il tocco sull'icona agisce, il tocco sulla tessera apre i controlli. | Due zone chiare. Niente switch iOS dentro le tessere | Switch iOS in ogni card (vedi K11) |
| **Controlli grandi nel dettaglio** (slider verticale enorme, preset) | Il pannello è il posto del controllo fine, la tessera quello del gesto rapido | Il pannello di un on/off è un riquadro basso (circa 520×170 px) che ripete la card |
| **HomeView: quadranti** che si alternano quando lo schermo non è in uso: orologio, foto, «Home Modular» (clima, video, luci, scene), «Home Camera» con fino a 9 feed, meteo, calendario | A schermo inattivo il pannello resta **utile**, non solo decorativo | Ambient = orologio o foto, e in produzione è spento |
| **HomeView: prossimità.** Alcune funzioni mostrano più informazioni quando ti avvicini. | Due densità: *lontano* (pochi dati grandi) e *vicino* (controlli completi) | Una sola densità, tarata per la vicinanza |
| **HomeView: profili e ospiti.** Gli ospiti comandano gli accessori ma non vedono i dati personali. | Modalità ospiti: comandi sì, calendario, timeline, nomi e volti no | Prevista dal §6.4 del piano correzioni, mai implementata |
| **Campanello e serratura «come una cosa sola»** | Dalla suonata si vede chi è e si apre con un gesto | C'è già (scorciatoia «Cancello Giardino»): va solo rifinita |
| **Live Activities** per compiti con inizio e fine | Fascia «In corso» per robot, lavatrice, ricarica auto, timer | Le attività vivono sparse nelle card e nel catalogo Spazi |

### 2.2 Regole HIG che il kiosk oggi non rispetta

| Pagina HIG | Regola | Dove la violiamo |
|---|---|---|
| [HomeKit](https://developer.apple.com/design/human-interface-guidelines/homekit) | Un interruttore collegato a una lampada va assegnato alla **stessa categoria** dell'accessorio | K08 |
| [HomeKit](https://developer.apple.com/design/human-interface-guidelines/homekit) | Evitare nomi che contengono il luogo («kitchen light»): la stanza va assegnata, non scritta nel nome | K09 |
| [HomeKit](https://developer.apple.com/design/human-interface-guidelines/homekit) | Nella vista di dettaglio mostrare le informazioni correlate, come la stanza | K12 |
| [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles) | *Preserve a person's context*: contenuti e controlli in posizioni coerenti e prevedibili | K06 |
| [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles) | Lo switch è per le righe di elenco; fuori da un elenco serve un bottone che fa da toggle | K11 |
| [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | iOS: default 17 pt, minimo 11 pt | K05 |
| [Designing for tvOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos) | Chi guarda da lontano (2–3 m) ha bisogno di testo più grande: default tvOS 29 pt | K05, §4.7 |
| [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) | Il layout dipende dallo spazio disponibile, non dall'orientamento, e si adatta alla rotazione | K04 |
| [Writing](https://developer.apple.com/design/human-interface-guidelines/writing) | Ogni schermata vuota indica il passo successivo | K02 |
| [Always On](https://developer.apple.com/design/human-interface-guidelines/always-on) | Nascondere i dati sensibili, attenuare il secondario, layout coerente, movimento che si ferma con grazia | §4.6 |
| [Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities) | Solo compiti con inizio e fine (≤ 8 h), informazione essenziale, testo grande | §4.9 |

### 2.3 Cosa non prendere

- **Branding Apple**, icone HomeKit e una copia dell'interfaccia di HomeView: prendiamo i pattern, non l'aspetto.
- **Foto come sfondo delle card o delle stanze**: resta valida la scelta di sole icone animate. La «Cornice» resta confinata al quadrante foto, che hai chiesto tu.
- **Assistente vocale stile Siri**: fuori perimetro. HOME AI CORE non comanda nulla per scelta (§4.5 di CLAUDE.md).
- **Un secondo colore brand**: l'accento resta uno solo.

---

## 3. Registro dei problemi

Priorità: **P0** = la casa non si vede o è inaffidabile · **P1** = uso o lettura compromessi · **P2** = prestazioni e igiene. *Evidenza*: V = verificato dal vivo, S = sorgente, M = misura.

### P0 — Funziona davvero sul muro?

**K01 · Tablet scollegato e regia cieca** · V/S
- *Evidenza:* `/api/kiosk/devices` vuoto e 0 client SSE sull'add-on, con il tablet acceso. Nel collaudo del 2 ottobre lo stesso tablet risultava online. [kiosk-fleet.ts:6](../backend/src/lib/kiosk-fleet.ts) dichiara «niente da persistere» perché i tablet dovrebbero ricomparire entro 60 s. Oggi non è successo e la regia non sa che un tablet manca.
- *Cosa fare tu:* guarda cosa mostra il tablet e controlla in Fully l'URL di avvio (`http://192.168.188.92:3001/kiosk`). Dopo un Ricarica, in Sistema → «Tablet a muro» deve comparire entro un minuto.
- *Cosa fare nel prodotto:* persistere i tablet conosciuti (`deviceId`, nome, ultimo contatto) in `/data`. Mostrare «Tablet Soggiorno offline da 30 h» in Stato → Attenzione. Facoltativo: guida all'attivazione del Remote Admin di Fully, solo LAN, con la password scelta da te.
- *Accettazione:* dopo un riavvio dell'add-on, un tablet che non si ricollega compare come offline con la sua età, non sparisce.

**K02 · Home vuota per configurazione** · V
- *Evidenza:* export reale con 0 `enabled`. I 14 override legacy (es. `light.soggiorno_cucina_doppio_soggiorno` con `type` e `areaId`, `vacuum.roborock_q7_l5`, `alarm_control_panel.sirolo_alarm`) risalgono a prima dell'opt-in del 31/08: il wizard li configurava senza la chiave `enabled`. Il kiosk non spiega il vuoto.
- *Fare:* (a) nella regia proporre una volta sola «Hai già configurato 11 dispositivi: attivali» con un tocco e con l'anteprima. Sono gli override legacy senza le 3 videocamere, che restano nella tendina. Non è un'attivazione automatica: l'opt-in resta una tua scelta. (b) Sul kiosk, se nulla è attivo, mostrare uno stato vuoto con il passo successivo («Scegli i dispositivi in Entità → Configura»). (c) In una release successiva, una proposta iniziale ragionata: dispositivi comandabili non nascosti in HA e con una stanza, da confermare. È coerente con la HIG Onboarding: buoni default, configurazione rinviabile.
- *Accettazione:* con 0 attivi il tablet dice cosa fare. Dopo la conferma, la home mostra i dispositivi scelti.

**K03 · Le card che si palesano ignorano i dispositivi nascosti e si duplicano** · V/S
- *Evidenza:* sul tablet reale, ora: `light.laterale_porta_sonoff_10021a5b24`, `light.soggiorno_cucina_sonoff_10021a5713`, `light.laterale_porta_centrale_soggiorno` e `light.laterale_porta_laterale_soggiorno` sono in `hiddenEntities`, eppure compaiono. Le prime due finiscono anche su tessera doppia in cima. L'esclusione in [useComposedHome.ts:93](../src/hooks/useComposedHome.ts) considera solo registry HA, P0, dominio e «Mai». Nello scenario B la stessa luce compare due volte (luce palesata + canale configurato).
- *Fare:* escludere sempre `hiddenEntities` e i dispositivi tolti nel wizard. Deduplicare per **nome uguale** a un dispositivo già in home. **Non** per `device_id`: il registry mostra che ogni Sonoff a 3 canali è *un* dispositivo con *tre* luci distinte, quindi la deduplica per dispositivo le fonderebbe per errore. Le card palesate vanno nella fascia **Adesso** (§4.2) a taglia normale, mai su tessera doppia (Fase 2).
- *Accettazione:* test in `bentoHome.test.ts`: nascosto acceso → non compare; luce di gruppo Sonoff e canale dello stesso dispositivo → una sola card.

**K04 · Verticale: quarta colonna fuori schermo** · V/M
- *Evidenza:* a 800×1280 la griglia di [LayeredHome.tsx:112](../src/components/home/LayeredHome.tsx) ha una sola colonna implicita da **1016,85 px**, allargata dal contenuto minimo della fila stanze (1021 px). Header, home e stanze diventano larghi 1017 px e le card arrivano fino a x = 1024. Il controllo di ottobre contava le barre di scorrimento, non il ritaglio.
- *Fare:* `grid-cols-[minmax(0,1fr)]` sul contenitore. Colonne della bento decise dalla larghezza disponibile (size class): 2 sotto ~900 px, 3–4 sopra.
- *Accettazione:* nessun elemento oltre `innerWidth` a 800×1280, 1280×800, 1024×600 e 390×844. Test DOM nella matrice.

### P1 — Si legge e si usa bene?

**K05 · Card grandi, testo piccolo** · M
- *Evidenza:* tessera 395×309 con nome a 13 px. Tessera 803×309 con nome a 15 px. Le righe da 120 px hanno sempre 13 px. Etichette «Esterna/Interna/Casa» a **9 px** e badge a 9 px ([StatusHeader.tsx:397](../src/components/home/layers/StatusHeader.tsx), 440). [WidgetCardBase.tsx](../src/components/widgets/WidgetCardBase.tsx) usa 13 px in quattro punti, 11 e 10 px negli altri.
- *Fare:* una scala tipografica legata alla tessera, non al componente. Valore e stato principale crescono con la taglia (S 17/22 px, M 20/28 px, L–XL 24/34 px). Nome mai sotto 15 px. Etichette mai sotto 12 px, in maiuscoletto solo se ≥ 12 px. È la base delle «due densità» (§4.7).
- *Accettazione:* misura automatica: nessun testo sotto 12 px sul kiosk, nessun valore principale sotto 17 px.

**K06 · Le card cambiano posto da sole** · S/D
- *Evidenza:* `rankBentoEntities` + `settleBentoOrder` ([bentoHome.ts](../src/lib/bentoHome.ts), [useComposedHome.ts:32](../src/hooks/useComposedHome.ts)) riordinano dopo 90 s senza tocchi, al massimo una volta al minuto. Le prime card prendono la tessera doppia. Le card palesate entrano nella stessa lista.
- *Perché è un problema:* su un pannello a muro il gesto diventa abitudine («il cancello è in basso a destra»). Uno spostamento, anche raro, costringe a cercare. HIG *Design principles*: tenere contenuti e controlli in posizioni coerenti e prevedibili.
- *Fare:* **Preferiti in posizioni fisse**, decise da te una volta (trascinamento sul kiosk o in regia). L'apprendimento **non sposta**: alimenta la fascia Adesso («Usi spesso alle 19: Luci cucina») e suggerisce in regia di promuovere un dispositivo a preferito. Nessuna tessera doppia automatica: la taglia la decidi tu.
- *Decisione tua (§7):* questo cambia una scelta fatta il 2026-10-08.

**K07 · 18 tessere senza struttura** · V
- *Evidenza:* scenario B, griglia piatta 4×5 senza titoli di stanza o categoria. Nomi lunghi e simili («Cucina Giardino Centrale Cucina», «Cucina Giardino Laterale Esterno»). Cancello, robot e rifiuti finiscono sotto la piega mentre in cima ci sono duplicati.
- *Fare:* preferiti raggruppati per stanza con un titolo leggero, come nelle sezioni di Casa. Chip categoria in alto (§4.1).

**K08 · La categoria scelta non cambia la card** · V/S
- *Evidenza:* [mapEntityToWidgetCard.ts:195](../src/components/widgets/utils/mapEntityToWidgetCard.ts) decide la famiglia solo dal dominio: un `switch` classificato «luce» resta una card power (verde, «Acceso», icona di accensione). Spazi conta «1 luce accesa» in Soggiorno mentre la chip dice 3 attivi. Il cancello (`switch.shelly…`, `type: lock`) è un toggle «Spento».
- *Fare:* per `switch` e `input_boolean`, la categoria decide presentazione e semantica: luce (ambra, «Accesa», conteggi «Luci», «Spegni le luci»), ventilatore, presa. **Cancello/portone a impulso** diventa un'azione momentanea «Apri» con pressione prolungata, mai un toggle. Il dominio HA resta quello reale per i servizi (G17 resta valido).
- *Accettazione:* test del mapper per ogni categoria. Il riepilogo luci e l'insight «Spegni tutte» contano anche i relè-luce.

**K09 · Nomi** · V
- *Evidenza:* luogo ripetuto («Soggiorno Cucina Doppio Soggiorno» dentro la stanza Soggiorno). Nome «A» per `climate.camera_angela`. Nome grezzo «cucina_soggiorno» per un clima non disponibile: [makeRoomEntity.ts:23](../src/components/home/layers/makeRoomEntity.ts) ripiega sull'object id senza passare da `entityName()`. Inglese nelle notifiche («Sensore movimento Tugurio Battery — batteria bassa»).
- *Fare:* un kernel puro `displayName(entity, registry, contesto)`: in una vista stanza toglie il nome della stanza, per le entità non disponibili usa il nome del registry, toglie i suffissi tecnici (Battery). In regia, una lista «Nomi da sistemare» propone etichette pulite da confermare (HIG HomeKit: rilevare i nomi con il luogo e aiutare a correggerli). Non scrive mai nel registry di HA senza un tuo gesto esplicito.

**K10 · Tema scuro: icone delle stanze invisibili** · V/M
- *Evidenza:* colore inline `rgba(29,29,31,0.55)` su fondo `#1c1c1e` ([RoomsRow.tsx:139](../src/components/home/layers/RoomsRow.tsx), [SpacesCatalog.tsx:154](../src/components/home/layers/SpacesCatalog.tsx)). Gli stili inline sfuggono al remap del tema.
- *Fare:* token semantici (`var(--ink-tertiary)`, `var(--fill-muted)`). Una regola lint o un test che vieti i neutri inline nei componenti kiosk.

**K11 · Toggle: tre colori per lo stesso gesto** · V
- *Evidenza:* sulla card una luce accesa è ambra in light e gialla in dark, un interruttore è verde, e la stessa luce nel pannello di dettaglio è **verde**. Nella card c'è uno switch iOS, che la HIG riserva alle righe di elenco.
- *Fare:* nella tessera, l'**icona-pulsante** è il toggle (anello e riempimento del colore della categoria), come in Casa. Lo switch resta solo nelle righe dei pannelli. Un solo colore per categoria in tutte le superfici.

**K12 · Dettaglio povero per i dispositivi on/off** · V
- *Evidenza:* il pannello di una luce on/off è un riquadro basso, circa 520×170 px su 1280×800, che ripete nome e stato con il genere sbagliato («Acceso» sotto il titolo, «Accesa» nella riga).
- *Fare:* il dettaglio diventa il posto del **contesto**. Un controllo grande (toggle a tutta larghezza o slider verticale per i dimmer), la stanza, «Accesa da 2 h», gli ultimi 5 eventi del dispositivo (dal logbook già filtrato) e «Modifica in regia». Larghezza 560–720 px in orizzontale.

**K13 · Il motivo della card esiste solo come tooltip** · S
- *Evidenza:* `title={slot.reason}` ([NowSection.tsx:44](../src/components/home/layers/NowSection.tsx)): «Appena acceso» non si vede col dito.
- *Fare:* per le card palesate, una piccola etichetta visibile («Accesa 2 min fa»). Per le altre nulla: il preferito non deve giustificarsi.

**K14 · Ripetizioni e testi** · V
- «Pronto · Nessuna riproduzione · Pronto» nella card media (stato ripetuto). Aria «Cucina, 1 dispositivi». «Oggi a casa» include eventi di ieri senza separatore di giorno. Il numero sulle chip stanza significa a volte «attivi» e a volte «totale», distinti solo dal colore.
- *Fare:* stato una volta sola. Plurali con una funzione unica. Timeline con «Oggi / Ieri». Sulle chip un riassunto parlante («2 luci · 21°») invece di un numero ambiguo.

**K15 · Vista stanza senza riepilogo né azioni di stanza** · V
- *Evidenza:* Soggiorno mostra 6 card in 2 colonne e un terzo dello schermo vuoto. Niente temperatura della stanza, niente «Spegni le luci del soggiorno», niente scene della stanza.
- *Fare:* intestazione di stanza con temperatura e umidità, luci accese con un'azione di gruppo, scene della stanza, poi le card raggruppate per categoria.

### P2 — Prestazioni, robustezza, igiene

**K16 · Ridisegni a ogni aggiornamento di HA** · S/M
- *Evidenza:* `LayeredHome`, `NowSection` e `StatusHeader` si abbonano all'intera mappa `entities`. `makeRoomEntity` crea oggetti nuovi, quindi tutte le card rifanno il mapping a ogni delta. Misurati circa **20 delta al minuto** in una sera tranquilla, di più con i sensori di potenza. In più `useComposedHome` ricalcola ogni secondo, rileggendo e parsando `localStorage` e facendo un `JSON.stringify` della vista. Sul Mac nessun long task e nessuna mutazione DOM in 15 s: il costo è CPU, non disegno.
- *Fare:* prima misurare sul tablet (Chrome remote debugging di Fully, React Profiler). Poi selettori per singola entità, card memoizzate per `entityId`, `cardUsage` in memoria con scrittura differita, ricalcolo a evento con il tick solo per le scadenze.
- *Accettazione:* commit React per delta ≤ 2 sul profilo del tablet. Nessun long task sopra 50 ms durante un minuto di delta.

**K17 · All'avvio si scarica la griglia legacy** · M
- *Evidenza:* `grid-*.js` (81 KB, 23 KB gzip) è in `modulepreload` e importato staticamente dal chunk principale, nonostante il commento in [TabletDashboard.tsx](../src/pages/TabletDashboard.tsx). Il `manualChunks` in [vite.config.ts:25](../vite.config.ts) ci fa finire dentro anche moduli condivisi. Resta anche l'avviso `INEFFECTIVE_DYNAMIC_IMPORT` su `kioskDevice.ts`.
- *Fare:* gruppi di chunk espliciti o `react-grid-layout` isolato. Verificare l'HTML generato in un test di build.

**K18 · Il layout si interroga ogni 6 secondi** · S/M
- *Evidenza:* `refetchInterval: 6000` anche in background ([useTabletLayout.ts:30](../src/hooks/useTabletLayout.ts)), mentre la config arriva già via SSE. Ogni risposta pesa 10,7 KB, di cui 8,7 KB di `hiddenEntities` che con l'opt-in non decidono più nulla (tranne K03).
- *Fare:* affidarsi all'SSE della config con un poll di sicurezza a 60 s, ETag/304, e un payload kiosk senza campi morti.

**K19 · ID dell'installazione scritti nel codice** · S
- *Evidenza:* `sensor.chargesplit_domus_wallbox_status`, consumo casa e potenza auto sono costanti in [StatusHeader.tsx:27](../src/components/home/layers/StatusHeader.tsx) e `statusBarEnergy.ts`.
- *Fare:* selezione in Funzioni → Energia, come già avviene per il fotovoltaico.

**K20 · La documentazione si contraddice** · S
- CLAUDE.md §7 dice ancora «nessuna ombra». Il contratto del 2 ottobre autorizza invece l'elevazione e AGENTS.md e DESIGN_SYSTEM.md sono già allineati. Va riallineato CLAUDE.md, che per regola vince sugli altri documenti.

---

## 4. La direzione: la «Home View» di S.I.M.I.

### 4.0 Schema (orizzontale 1280×800)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 19:08  ven 27 novembre                                   10° fuori · 17° │
│ [Clima 17°] [Luci · 3 accese] [Sicurezza · ok] [Energia 0,6 kW] [Video 5]│ ← categorie
├──────────────────────────────────────────────────────────────────────────┤
│ ADESSO  Soggiorno: 3 luci accese [Spegni] · Robot 40 % · Carta: oggi      │ ← una riga, scorre
├──────────────────────────────────────────────────────────────────────────┤
│ SOGGIORNO                                CUCINA                           │
│ [💡 Doppio] [💡 Laterale] [▶ Media]       [💡 Centrale] [💡 Laterali]      │ ← preferiti fissi
│ CAMERA DAVIDE                            INGRESSO                         │
│ [🌡 16 → 27°]                             [⟲ Cancello · tieni] [🛡 Allarme] │
├──────────────────────────────────────────────────────────────────────────┤
│ [⌂ Home] [Soggiorno] [Cucina] [Camera Davide] [Giardino] [Altro]         │ ← stanze
└──────────────────────────────────────────────────────────────────────────┘
```

In verticale le sezioni scorrono in una colonna sola e la barra categorie va a capo su due righe.

### 4.1 Barra delle categorie

Chip fisse in ordine stabile: **Clima · Luci · Sicurezza · Energia · Acqua · Videocamere**. Compaiono solo le categorie con almeno un dispositivo attivato. Ognuna mostra un riassunto vero («3 accese», «17–21°», «Porte chiuse», «0,6 kW») e al tocco apre la **vista categoria** (§4.4). Assorbe l'attuale cluster dell'header (temperatura, kW, allarme, videocamere). L'orologio resta a sinistra e i valori diventano leggibili (K05).

### 4.2 Preferiti stabili e fascia «Adesso»

- **Preferiti:** i dispositivi attivati nel wizard, raggruppati per stanza, in ordine e taglia decisi da te. Non si spostano mai da soli.
- **Adesso:** una riga separata, al massimo 4 elementi, che si aggiorna da sola. Contiene le card palesate (K03), i suggerimenti con azione (oggi nelle chip dell'header), le attività in corso (§4.9) e l'apprendimento («Di solito a quest'ora: Luci cucina»). È il posto giusto per tutto quello che oggi rimescola la griglia.
- **Sicurezza:** le P0 (fumo, gas, allarme scattato) restano sopra tutto, come oggi.

### 4.3 Anatomia della tessera (S, M, L)

- **Zona icona** = azione primaria (tap). L'icona-pulsante cambia riempimento e anello quando è attiva: niente switch iOS. Lucchetti, cancelli e sirene richiedono la pressione prolungata, come oggi.
- **Zona testo** = apre il dettaglio. Nome su due righe al massimo, già pulito dal luogo (K09). Stato in una riga («Accesa · 80 %»).
- **Taglie:** S = icona, nome e stato. M = in più un controllo in linea (slider luminosità, ± temperatura, play/pausa). L = controllo esteso. La taglia la decidi tu (K06). Tipografia secondo K05.
- **Stati:** acceso (riempimento categoria), spento (vetro neutro), in corso (anello animato, solo transform e opacity), non raggiungibile (testo esplicito, comando disattivato), errore (shake e messaggio, già presente).

### 4.4 Viste categoria e vista stanza

- **Luci:** tutte le luci divise per stanza con «Spegni tutte», più «Spegni le luci della stanza» in ogni sezione. È il gesto serale tipico.
- **Clima:** un riga per termostato con temperatura attuale, obiettivo e modalità. Tocco per il dettaglio con la ruota.
- **Sicurezza:** allarme, aperture, serrature e cancelli, videocamere (snapshot), ultimi eventi.
- **Energia:** il pannello attuale (consumo, wallbox, fotovoltaico).
- **Stanza:** intestazione con clima, luci e scene della stanza (K15), poi le card raggruppate per categoria.

### 4.5 Dettaglio dispositivo

Pannello centrato (560–720 px) con un **controllo grande**: toggle a tutta larghezza per gli on/off, slider verticale per luminosità e posizione, ruota per il clima. Sotto: stanza, «da quando», ultimi eventi, scorciatoia alla regia. Un solo colore per categoria (K11), genere grammaticale coerente.

### 4.6 Quadranti a schermo inattivo

Scelti in Funzioni → Kiosk, in rotazione o fissi:

| Quadrante | Contenuto | Note |
|---|---|---|
| **Orologio** | Ora grande, data, meteo | L'ambient di oggi |
| **Casa** | Modulo clima, luci accese, allarme, prossimo ritiro rifiuti, consumo | Il «Home Modular» di HomeView: niente comandi, un tocco sveglia la home |
| **Videocamere** | Griglia di snapshot (1/4/6/9) aggiornati ogni 10–30 s | Il live parte solo al tocco su una camera, una alla volta, per non pesare su Ring e GPU |
| **Cornice** | Foto (locale o Google Foto) | Esiste già: solo come quadrante, mai come sfondo delle card |
| **Meteo / Agenda** | Previsioni, eventi del giorno | Solo se c'è il dato; in modalità ospiti l'agenda non compare |

Regole dalla HIG Always On: niente dati personali in vista, secondario attenuato, layout costante fra un minuto e l'altro, movimento che si ferma con calma, anti burn-in come oggi. Il **primo tocco sveglia e basta**: non deve mai azionare la tessera sotto il dito.

### 4.7 Due densità: lontano e vicino

- **Lontano** (nessuno vicino da più di 30 s): solo la barra categorie ingrandita, l'ora e la fascia Adesso. Numeri a 28–34 px, niente controlli piccoli. È il pannello che si legge dal divano.
- **Vicino** (tocco, presenza dal sensore HA configurato, movimento della camera di Fully): la Home View completa.
- La transizione usa solo transform e opacity e mantiene le posizioni relative (HIG Always On: niente cambi di layout che distraggono). Si integra con il risveglio unico già presente (F58).

### 4.8 Modalità ospiti

Attivabile dalla regia, da un'entità HA (`input_boolean`) o da un pulsante protetto sul kiosk. I comandi restano. Spariscono timeline, calendario, nomi delle persone, volti conosciuti, Memoria e notifiche personali. Saluto neutro. Le azioni protette (sblocco, disinserimento) chiedono la pressione prolungata più una conferma. Chiude il §6.4 del piano correzioni.

### 4.9 Attività in corso

Una sola fascia (dentro Adesso) per i compiti con inizio e fine: robot in pulizia (percentuale e stanza), lavatrice e lavastoviglie (tempo rimanente, se HA lo espone), auto in carica (kW e kWh), timer. Testo grande, un'icona animata, niente dati inventati: se HA non dà la fine, si mostra solo «In corso da 25 min».

### 4.10 Campanello, cancello e videocamere

- Modale campanello: pulsante grande **«Apri cancello»** (pressione prolungata), dato che la scorciatoia è già configurata su entrambi i campanelli.
- Microfono solo se la camera supporta davvero l'audio bidirezionale (HIG HomeKit, sezione Cameras): oggi il talk-back non c'è e non va suggerito.
- Nessun testo sopra l'immagine oltre allo stretto necessario (HIG HomeKit: non coprire l'immagine della camera).
- La tendina Videocamere resta l'unico posto del live in home. Il quadrante Videocamere è un'estensione a schermo inattivo e non contraddice la regola.

---

## 5. Piano a fasi

Taglie: **S** ≤ 1 giorno · **M** 2–4 giorni · **L** 1–2 settimane. Ogni fase è rilasciabile da sola e chiude con i gate della DoD (lint, test, `build:all`, typecheck backend), screenshot light/dark a 1280×800, 800×1280 e 1024×600, e la prova sul tablet.

### Fase 0 — Il tablet torna affidabile (subito)

| # | Intervento | K | File principali | Taglia |
|---|---|---|---|---|
| 0.1 | Ricollegare il tablet (verifica tua dell'URL in Fully) | K01 | — | S |
| 0.2 | Tablet conosciuti persistiti + «offline da» in Stato → Attenzione | K01 | `backend/src/lib/kiosk-fleet.ts`, `routes/kiosk`, `src/lib/attention.ts` | M |
| 0.3 | Proposta «Attiva i dispositivi già configurati» + stato vuoto sul kiosk | K02 | `src/pages/EntitiesPage.tsx`, `DeviceSetupWizard.tsx`, `LayeredHome.tsx` | S |
| 0.4 | Le card palesate rispettano i nascosti e si deduplicano per nome | K03 | `src/lib/bentoHome.ts`, `src/hooks/useComposedHome.ts` + test | S |
| 0.5 | Fix della larghezza in verticale + colonne per larghezza | K04 | `LayeredHome.tsx`, `src/index.css` (`.kiosk-bento`) | S |
| 0.6 | Icone delle stanze in dark | K10 | `RoomsRow.tsx`, `SpacesCatalog.tsx` | S |

**Uscita:** il tablet compare in regia. La home mostra solo ciò che hai scelto, più le palesate legittime. Nessun ritaglio in nessun orientamento.

**Esito Fase 0 (27/11/2026, sera) — implementata, non ancora rilasciata:**
- 0.1 resta a te: controllare l'URL di avvio in Fully.
- 0.2 `kiosk-fleet-store.ts` ricorda id, nome e ultimo contatto dei tablet in `kiosk-devices.json` accanto a `db.json` (scrittura al massimo ogni 10 min o per un tablet nuovo, mai in sola lettura). Lo stato vivo (batteria, schermo…) non si ricorda di proposito. Stato → Attenzione mostra «Tablet … non risponde da …».
- 0.3 banner in Entità «N dispositivi configurati non sono ancora sul tablet» (`legacyConfiguredEntityIds`, esclusi videocamere, nascosti, «Mai» ed entità assenti) con «Attiva tutti» / «Non ora». Sul kiosk, con zero dispositivi scelti, compare lo stato vuoto con il passo successivo.
- 0.4 le palesate escludono i nascosti e i doppioni per nome. Con la configurazione reale spariscono 5 luci nascoste ma accese.
- 0.5 griglia home `grid-cols-[minmax(0,1fr)]` e massimo 2 colonne fra 600 e 899 px: a 800×1280 il contenuto termina a 776 px (prima 1024).
- 0.6 icone delle stanze e del catalogo Spazi su token del tema: visibili in scuro.
- Gate: lint OK · 898/898 test · build:all OK · typecheck backend OK. Provato dal vivo su copia isolata con HA reale a 800×1280 dark, 1280×800 light e 1024×600 dark. Nessuna scrittura sull'add-on.
- Visto durante la prova: il banner propone anche `remote.soggiorno` (tipo media), che dopo l'attivazione duplica la card di `media_player.soggiorno`. È una scelta di configurazione: va deselezionato nel wizard.

### Fase 1 — Leggibilità e semantica

| # | Intervento | K | Taglia |
|---|---|---|---|
| 1.1 | Scala tipografica per taglia; header senza testo sotto 12 px | K05 | M |
| 1.2 | La categoria decide la card per switch e input_boolean; cancello momentaneo con hold | K08 | M |
| 1.3 | `displayName` + nomi grezzi eliminati + «Nomi da sistemare» in regia | K09 | M |
| 1.4 | Icona-pulsante come toggle e un solo colore per categoria | K11 | M |
| 1.5 | Motivo visibile sulle palesate, plurali, «Oggi/Ieri», chip stanza parlanti | K13, K14 | S |

### Fase 2 — La struttura «Home View»

| # | Intervento | K | Taglia |
|---|---|---|---|
| 2.1 | Preferiti stabili raggruppati per stanza (ordine e taglia tuoi, editor sul kiosk) | K06, K07 | L |
| 2.2 | Fascia Adesso (palesate, suggerimenti, apprendimento, attività in corso) | K03, K06, §4.9 | M |
| 2.3 | Barra categorie + viste Luci, Clima, Sicurezza | §4.1, §4.4 | L |
| 2.4 | Vista stanza con intestazione e azioni di stanza | K15 | M |
| 2.5 | Dettaglio con controllo grande e contesto | K12 | M |

**Nota tecnica:** 2.1 non ricrea la griglia legacy. Usa il layout bento esistente con un ordine persistito (`config.kiosk.favorites: string[]` + taglia per entità già in `cardSizes`), scritto con la stessa disciplina di `configVersion`. Il kernel resta uno solo (CLAUDE.md §5) e la vecchia griglia può essere rimossa alla fine della fase.

### Fase 3 — Quadranti, prossimità, ospiti

| # | Intervento | Taglia |
|---|---|---|
| 3.1 | Quadranti Orologio, Casa, Cornice, Meteo, con rotazione e impostazioni in Funzioni | L |
| 3.2 | Quadrante Videocamere con snapshot e live su tocco, una camera alla volta | M |
| 3.3 | Due densità lontano/vicino integrate nel risveglio unico | M |
| 3.4 | Modalità ospiti | M |
| 3.5 | Modale campanello con «Apri cancello» grande | S |

### Fase 4 — Prestazioni e igiene (in parallelo alle altre)

| # | Intervento | K | Taglia |
|---|---|---|---|
| 4.1 | Profilo React sul tablet, poi selettori per entità e card memoizzate | K16 | M |
| 4.2 | Chunk della griglia fuori dall'avvio, avviso `kioskDevice` risolto | K17 | S |
| 4.3 | Layout via SSE + poll a 60 s + payload kiosk snello | K18 | S |
| 4.4 | Sensori energia e wallbox configurabili | K19 | S |
| 4.5 | CLAUDE.md e DESIGN_SYSTEM.md riallineati al nuovo contratto | K20 | S |

---

## 6. Collaudo sul tablet

Annotare prima modello, risoluzione CSS, scala del font Android, versioni di Fully e del WebView, e il profilo prestazioni scelto. Poi:

1. **Lettura da 2–3 m**, di giorno e di sera: ora, temperatura, luci accese e stato dell'allarme si leggono senza avvicinarsi.
2. **Memoria spaziale:** per una settimana nessuna card si sposta da sola. Il gesto «spegni le luci» trova sempre lo stesso posto.
3. **Rotazione:** orizzontale ↔ verticale con un pannello aperto, senza ritagli né salti.
4. **Primo tocco** a schermo inattivo: sveglia e basta, nessun comando.
5. **Prestazioni:** 10 minuti di delta reali con il profilo React registrato, frame time durante l'apertura dei pannelli, temperatura del tablet dopo un'ora.
6. **Campanello reale:** suonata, video, «Apri cancello» con hold, chiusura.
7. **Regia:** spegni il tablet → «offline da…» compare. Riaccendi → torna online.

---

## 7. Decisioni che spettano a te

1. **Ordine stabile o appreso?** Propongo preferiti fissi, con l'apprendimento che suggerisce senza spostare (K06). Cambia la scelta del 2026-10-08.
2. **Sezioni per stanza o griglia unica?** Propongo sezioni per stanza (K07, §4.2).
3. **Dispositivi già configurati:** li riattivo con un tocco dalla regia (K02) o preferisci rifare la scelta da zero nel wizard?
4. **Quadranti:** quali vuoi nella rotazione (§4.6)? Lo screensaver oggi è spento.
5. **Modalità ospiti:** come si attiva (regia, entità HA, pulsante sul kiosk) e cosa nasconde (§4.8).

---

## 8. Fonti

- HIG Apple, copia locale del 21/11/2026: HomeKit, Design principles, Toggles, Typography, Designing for tvOS, Layout, Writing, Always On, Live Activities, Onboarding (link ufficiali nelle tabelle del §2).
- Apple HomeView — [MacRumors, «Apple HomeView: Everything We Know»](https://www.macrumors.com/guide/apple-command-center/) (20/11/2026): quadranti, «Home Modular», «Home Camera» fino a 9 feed, prossimità, profili, ospiti, campanello + serratura. [Anteprima del 10/10/2026](https://www.macrumors.com/2026/10/10/apple-to-unveil-all-new-type-of-device/) per le indiscrezioni pre-lancio, che restano non confermate. Non è stata trovata una pagina Apple ufficiale: trattare i dettagli come riportati.
- App Casa — [MacRumors, riprogettazione di iOS 16](https://www.macrumors.com/2022/06/07/ios-16-entirely-overhauled-home-app/) (categorie in alto, stanze in un'unica pagina); [MacRumors, riorganizzare la vista Casa](https://www.macrumors.com/how-to/reorganize-home-view-home-app/) (sezioni, ordine, taglia delle tessere); [9to5Mac, Casa in iOS 27](https://9to5mac.com/2026/10/08/heres-everything-new-for-apples-home-app-in-ios-27/).
- Stato interno: [AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md](AUDIT_GRAFICO_KIOSK_TABLET_2026-10-02.md), [AUDIT_TECNICO_FIX_2026-10-01.md](AUDIT_TECNICO_FIX_2026-10-01.md), [piano_correzioni_ottimizzazioni_app_domotica.md](../piano_correzioni_ottimizzazioni_app_domotica.md), CLAUDE.md fino al rilascio 2.2.128.
