# S.I.M.I. — implementazione UI/UX delle card da DomusUI

4 ottobre 2026. Implementazione distribuita in LAN con la versione **2.2.120**; esito nel §30 dell’audit tecnico. Riferimento studiato: DomusUI 1.4.0, commit `d5e6bb57ecbcd66e9df33ede0c13b2c54bdf9702`. Questo documento completa la passata sulle card e sull'editor descritta in [INTEGRAZIONE_DOMUSUI_2026-10-04.md](INTEGRAZIONE_DOMUSUI_2026-10-04.md). Non dichiara parità con tutti i servizi backend di DomusUI.

Aggiornamento 5–6 ottobre: raccolte sfogliabili, serratura a scorrimento, controlli L estesi e proiezione responsive ordinata sono descritti in [CARD_DINAMICHE_DOMUSUI_2026-10-05.md](CARD_DINAMICHE_DOMUSUI_2026-10-05.md). Le descrizioni delle raccolte qui sotto documentano il comportamento della 2.2.120, superato per la presentazione interna dal nuovo carosello; schema/editor/visibilità restano validi.

## Contratto comune applicato

- Superficie della card e nome aprono i dettagli. Accensione, pausa e altri comandi hanno controlli espliciti. Il tocco su slider e select non apre accidentalmente il pannello.
- Pulsanti e controlli touch di almeno 44×44px, nomi accessibili, focus visibile, stato pressed per selezioni e toggle. Il comando in corso è segnalato; gli errori sono visibili e annunciati.
- Stato ottimistico immediato e rollback dopo rifiuto. La prenotazione per entità è condivisa fra card, dettagli e azioni collettive: un secondo comando concorrente viene rifiutato. Il rollback non sovrascrive un aggiornamento HA arrivato nel frattempo.
- Cambiando entità associata, pending ed errori locali non passano al dispositivo successivo. Le entità assenti, unknown e unavailable non ricevono comandi; restano consultabili quando il percorso lo consente.
- Light/Dark usano gli stessi token semantici, superfici Liquid Glass neutre, bordi e ombre condivisi. Artwork, fotografie e colori funzionali mantengono la propria resa.
- Rimane un unico renderer di dominio. I dettagli esistenti sono riutilizzati e caricati al bisogno con recupero confinato degli errori. Le azioni sensibili di serrature/allarme mantengono le interazioni protette dei pannelli.

## Dimensioni e gerarchia

Schema 3 invariato: tre colonne, righe da 38px, gap 14px. XS occupa 1×2 celle (90px), S 1×3 (142px), M 2×3 (142px), L 3×6 (298px), XL 3×3 (142px). Ogni tipo mantiene le taglie consentite dal catalogo; le prove di robustezza includono anche rendering compatti non selezionabili dall'editor.

XS presenta identità e azione essenziale; l'icona decorativa cede spazio al comando nei contenitori stretti. S conserva nome/stato e controllo principale. M e XL usano lo spazio orizzontale per valori e media. L aggiunge controlli secondari e dati reali, con scorrimento interno quando necessario. Un comando non modifica automaticamente footprint o posizione.

## Famiglie e comportamento finale

| Famiglia | Interazione e contenuto |
| --- | --- |
| Luci | Superficie → dettagli; toggle separato anche in XS. Slider luminosità soltanto se la modalità colore lo consente. L offre temperatura colore quando supportata, con intervalli Kelvin/mired reali. |
| Interruttori | Toggle esplicito, stato italiano, pannello per informazioni. |
| Clima | Ruota e regolazione condividono unità, limiti e passo. Target mancante o capability dichiarata assente disabilitano la regolazione. Comandi protetti anche dalla plancia. |
| Scaldacqua | Target con min/max effettivi, senza applicare il vecchio intervallo del termostato; modalità da operation_list. |
| Ventilatori | Velocità/passo effettivi; preset, oscillazione e direzione Avanti/Indietro soltanto se supportati. L espone i controlli secondari. |
| Umidificatori | Target nei limiti dell'integrazione, modalità compatibili, nessun intervallo diverso fra slider e dettaglio. |
| Tapparelle | Apri/chiudi/stop con capability ed estremi rispettati; L posizione percentuale quando disponibile. |
| Valvole | Comando principale e dettagli esistenti; nessun programma irrigazione inventato. |
| Serrature e allarme | Stato e severità; pannelli esistenti con protezioni per i comandi sensibili. |
| Aspirapolvere | Avvio/base secondo feature; L pausa/stop/localizzazione solo se supportati. Batteria quando fornita. |
| Tagliaerba | Azioni principali e dettaglio universale esistenti; nessuna nuova pianificazione autonoma. |
| Media | Copertina live/fallback esistente preservato. Play/pausa compatibile con il dispositivo. L aggiunge traccia precedente/successiva, mute, volume e sorgente quando supportati. Comandi su area propria; metadata e copertina non vengono schiacciati. |
| Scene | Tutte raggiungibili tramite scorrimento, senza taglio silenzioso; esecuzione protetta e feedback. |
| Automazioni, script e pulsanti | Comando esplicito già previsto dal renderer, pannello e stato; nessun builder fittizio. |
| Timer | Countdown dalla scadenza HA, remaining durante pausa, avvio/pausa espliciti e annullamento in L. La UI non simula eventi di fine timer. |
| Select e number | Opzioni effettive; valore numerico nei limiti e nel passo dichiarati, rollback sul rifiuto. |
| Sensori numerici | Valore/unità; L storico reale delle ultime 24 ore, min/max, caricamento, retry e stato senza dati. I buchi unavailable interrompono la linea del grafico. |
| Sensori binari | Stato e severità tradotti; niente andamento numerico artificiale. |
| Persone | Elenco anche senza coordinate, avatar con fallback iniziali, stato presenza. Tutti i membri raggiungibili; L elenco scorrevole. Tocco → dettaglio persona. |
| Calendario | Agenda in sola lettura; L selettore dei prossimi sette giorni e eventi del giorno. Dettaglio evento con calendario, orario/fine e luogo se fornito. Retry distinto dalla configurazione assente. |
| Meteo e notizie | Caricamento/errori recuperabili, testi leggibili e collegamenti touch; errore rete distinto da integrazione non configurata. |
| Orologio | Tocco → timeline della casa esistente. |
| Stato, sicurezza, insight | Gerarchia e token coerenti, informazioni e azioni reali esistenti. La configurazione audio indica Abilitato, senza dichiarare che il suono sia fisicamente udibile. |
| Statistiche rapide | Spegni tutte prenota soltanto le luci effettivamente accese e disponibili; ottimismo, pending, errore e rollback individuale protetto. |
| Gruppi omogenei | Apertura dettagli separata dal comando collettivo; membri raggiungibili anche in L. Prenotazione atomica del gruppo e rollback individuale senza perdere aggiornamenti live. |
| Raccolte miste | Nuovo stack con titolo e 2–24 entità uniche, taglie S/M/L/XL. Conteggio attivi/non disponibili, elenco L e inventario filtrabile al tocco. Nessun comando collettivo implicito. |
| Telecamere | Restano nel percorso esplicito drawer/monitoraggio. Nessuna nuova card home o sessione video automatica introdotta dal passaggio. |

## Raccolte e editor

Il picker offre **Crea raccolta**; l'overlay offre **Modifica raccolta**. Titolo da 1 a 80 caratteri, selezione cercabile, massimo 24 membri; i membri rimossi da HA restano riconoscibili e rimovibili. Le camere sono escluse e gli stack sono piatti: nessuna ricorsione.

Validazione allineata fra frontend, backend e decoder della bozza: ID validi/unici, cardinalità, titolo, taglie e divieto camere. I membri rispettano visibilità opt-in e hiddenEntities; una raccolta senza membri visibili non viene resa nel percorso content-aware. Tipi API, catalogo, renderer, revisioni e snapshot sono aggiornati insieme. Copie delle liste impediscono mutazioni della cronologia.

Creazione, rinomina e membri partecipano a undo/redo, recupero bozza e Salva con layoutVersion. Il conflitto remoto non viene aggirato: una bozza stale resta recuperabile dopo rifiuto. L'editing rende inerte il contenuto delle card e blocca i comandi domestici.

**Anteprima tablet** permette larghezze locale/600/768/1024/1280 durante la modifica. Cambia il contenitore di anteprima, senza alterare scala globale, schema o configurazione persistita per quel semplice cambio. La geometria continua a provenire dal kernel condiviso.

## Bug corretti durante questo passaggio

1. Token `--accent` inesistente nei comandi dell'editor: sostituito con `--action-blue`; Aggiungi e Salva sono nuovamente leggibili.
2. Stato errore conservato passando a un'altra entità: contenuto della factory rimontato per identità effettiva del dispositivo.
3. Controlli media L compressi/tagliati: metadata non comprimibili, area secondaria scorrevole e pulsanti icona con nomi accessibili.
4. Intervallo termostato applicato allo scaldacqua: usati i limiti reali del dispositivo.
5. Toggle luce implicito sull'intera superficie: dettagli e comando separati.
6. Brightness o target obsoleti potevano rendere azionabili funzioni dichiarate assenti: feature/modalità autorevoli.
7. Rollback collettivi potevano cancellare uno stato HA più recente: ripristino solo dei riferimenti ottimistici ancora correnti.
8. Elenco scene/persone troncato: accesso a tutti gli elementi tramite scorrimento.
9. Pending/errore e neutralità dei widget informativi non uniformi: segnali e token allineati.

## Evidenza e verifica

Laboratorio locale con dati sintetici, API bloccate e nessun collegamento operativo alla casa. Artefatti in [card-ui-ux-2026-10-04](card-ui-ux-2026-10-04/); fixture e server archiviati come testo per riproducibilità.

- Matrice finale: 49 selezioni × 2 temi × 3 larghezze (600/768/1024) = **294 combinazioni e 1.470 layout**, senza violazioni rilevate di target o contenimento dei controlli. Le aree intenzionalmente scorrevoli sono escluse dal controllo di overflow.
- Prove browser: dettagli luce separati dal toggle, rollback dopo HTTP 503, sorgente media ripristinata con artwork conservato, umidità Home/End nei limiti, reset errore al cambio entità, apertura raccolta e agenda/dettaglio, modifica raccolta/undo/redo e bozza conservata dopo salvataggio fallito.
- Screenshot Light/Dark di media, luci, clima, aria, calendario, persone, gruppi, raccolte, sensori e anteprima editor. Non sono immagini del tablet installato.
- Quality gate: **668 test / 125 file**, lint, build:all e typecheck backend PASS; audit runtime frontend/backend **0 vulnerabilità**. Dettagli nel §29 dell'audit tecnico.

Non è una certificazione completa WCAG né prova di multitouch, wake, audio, Ring continuativo o stabilità fisica Fully Kiosk. Nessun comando HA/Fully, cambiamento della casa o deploy eseguito in questo passaggio. Calendario CRUD, amministrazione account/foto persone, mappe, scheduler irrigazione e drawer assistente restano ambiti separati della matrice generale.

## Fonti tecniche

Adattamento dei pattern UX di [DomusUI al commit studiato](https://github.com/Mattia2399/DomusUI/tree/d5e6bb57ecbcd66e9df33ede0c13b2c54bdf9702), conservando architettura e design S.I.M.I.; nessun runtime Domus Core installato. Le capability dei controlli sono confrontate con le definizioni primarie Home Assistant: [media](https://github.com/home-assistant/core/blob/dev/homeassistant/components/media_player/const.py), [cover](https://github.com/home-assistant/core/blob/dev/homeassistant/components/cover/const.py), [vacuum](https://github.com/home-assistant/core/blob/dev/homeassistant/components/vacuum/const.py), [climate](https://github.com/home-assistant/core/blob/dev/homeassistant/components/climate/const.py), [fan](https://developers.home-assistant.io/docs/core/entity/fan/), [humidifier](https://developers.home-assistant.io/docs/core/entity/humidifier/).
