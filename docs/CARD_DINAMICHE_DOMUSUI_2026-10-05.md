# S.I.M.I. — card dinamiche, gesti e adattamento tablet

Passaggio avviato il 5 ottobre e verificato il 6 ottobre 2026. **Distribuito e installato in LAN nella 2.2.121**, con il lavoro della 2.2.120 conservato. Rilascio e riscontro LAN nel §32 di [AUDIT_TECNICO_FIX_2026-10-01.md](AUDIT_TECNICO_FIX_2026-10-01.md).

## Riferimento e confini

Studiati la [demo DomusUI](https://domusui.pages.dev), il renderer delle 14 famiglie, il cursore valori, la serratura a scorrimento, le raccolte e la dashboard stanze del repository [Mattia2399/DomusUI](https://github.com/Mattia2399/DomusUI). Il 6 ottobre `git ls-remote` conferma ancora HEAD `d5e6bb57ecbcd66e9df33ede0c13b2c54bdf9702`, versione 1.4.0. La demo è una presentazione di componenti e interazioni, non prova di esecuzione HA. La pagina dichiara GPL-3.0: questi interventi adattano i comportamenti con implementazioni proprie nel renderer S.I.M.I., senza importare codice, runtime o branding esterni.

Le telecamere restano **nella tendina Telecamere**, secondo la scelta esplicita dell'utente. Nessuna nuova card camera viene aggiunta alla home; il video parte dal percorso previsto su richiesta. Non si modifica la selezione dei dispositivi o il layout esistente durante l'aggiornamento.

## Uso nella home

1. Per la disposizione manuale scegliere **Funzioni → Kiosk → Home del tablet → Personalizzabile**. La modalità Auto-composta mantiene il composer e le sue priorità; non viene convertita automaticamente dal rilascio.
2. Nella home scegliere **Personalizza → Aggiungi**. Le card dispositivo usano le entità selezionate nel sistema; la disponibilità dei comandi deriva dalle capacità reali HA.
3. Per un insieme sfogliabile scegliere **Crea raccolta**, assegnare un nome e 2–24 dispositivi. Camere e raccolte ricorsive sono escluse. **Modifica raccolta** cambia i membri nella stessa bozza dell'editor.
4. La raccolta si sfoglia orizzontalmente con il dito, con drag mouse o con le frecce. L'indice mostra il membro corrente; il pulsante inventario apre tutti i membri visibili nel foglio filtrabile.
5. Taglie S/M/XL: anteprima compatta del dispositivo e accesso ai dettagli. Taglia L: controlli estesi del renderer. Il footer occupa 44px, senza aumentare la footprint o ridurre i target touch.
6. Trascinare le card nell'editor, usare Annulla/Ripeti, quindi Salva. La visualizzazione stretta non pubblica posizioni diverse; un errore di salvataggio conserva la bozza.

## Gesti e protezioni

### Raccolte

`CardPager` monta una sola pagina dispositivo. Il componente conserva l'ID selezionato; se il membro viene rimosso, torna al primo disponibile. Stato, metadata e comandi rimangono nel renderer live condiviso. Nessuna pagina avvia una connessione HA aggiuntiva.

Il gesto parte soltanto da una superficie libera o dal pulsante superficie/dettagli. Slider, select, link e controlli espliciti sono esclusi. Dopo 12px il movimento orizzontale cattura il puntatore; il verticale dominante lascia scorrere la home e sopprime il click conclusivo. La soglia di cambio pagina è proporzionale alla larghezza, limitata a 36–80px. Non c'è avvolgimento automatico tra ultima e prima pagina. Frecce da 44×44px, focus e indice annunciato permettono di navigare senza swipe.

Pointer cancel/lost capture ripristinano il riposo. Il cambio pagina usa transform/opacity per 160ms; `perf-lite` e `prefers-reduced-motion` eliminano la transizione. La pagina ritagliata non aggiunge blur annidati.

### Serratura

M/L/XL bloccate espongono **Scorri per sbloccare**. Occorre arrivare alla fine del binario e rilasciare: tap, drag incompleto, cancel e perdita focus non sbloccano. Il puntatore secondario e il tasto mouse destro vengono ignorati. Un comando in corso o un'entità non disponibile disabilitano l'azione.

La tastiera mantiene un hold di 900ms su Invio/Spazio, annullato dal rilascio anticipato, dal blur o dallo smontaggio. XS/S mantengono il hold preesistente. Una serratura già sbloccata conserva il controllo di blocco. M/XL dedicano una riga intera al binario, così il testo non compete con il nome.

## Famiglie della demo e adattamento operativo

| Famiglia DomusUI | Comportamento S.I.M.I. |
| --- | --- |
| Light | Toggle e luminosità live; L aggiunge selettore colore se supportato e temperatura Kelvin/mired nei limiti HA. |
| Switch | Toggle esplicito, valore/stato reale e dettagli; può essere un membro sfogliabile. |
| Fan | Velocità e passo reali, preset/direzione/oscillazione supportati; controlli separati dalla navigazione. |
| Humidifier | Target e modalità reali; min/max/passo condivisi con la plancia. |
| Climate | Ruota/stepper esistenti conservati; L aggiunge fan, preset, swing verticale/orizzontale, target minimo/massimo e umidità quando dichiarati. Il footer fan rispetta anch'esso la feature HA. |
| Camera | Tendina esplicita; nessuna camera home o apertura video provocata da swipe. |
| Sensor | Valore/unità e storico reale L, dati mancanti/errore distinti; nessun grafico artificiale. |
| Media | Artwork live preservato, play/pausa e controlli precedenti; L aggiunge shuffle, repeat e seek compatibili. Posizione media ottimistica con timestamp e rollback. |
| Alarm | Stato/severità e pannello protetto esistenti; nessuna disattivazione tramite gesto di navigazione. |
| Vacuum | Avvio/base e comandi già supportati; L aggiunge potenza da `fan_speed_list`. |
| Lock | Scorrimento protetto M/L/XL, hold XS/S e tastiera; errore/rollback condivisi. |
| Cover | Posizione e apri/chiudi/stop; L aggiunge inclinazione se supportata. “Aperta” con posizione parziale può ancora ricevere Apri; il tilt non simula una variazione di apertura. |
| Calendar | Agenda sette giorni/dettaglio evento esistenti; striscia giorni scorrevole. Nessun CRUD calendario inventato. |
| Members | Persone live con avatar/fallback e dettagli esistenti, anche senza coordinate. |

Orologio, meteo, scene, gruppi, notizie, sicurezza, statistiche, timer, scaldacqua, valvole, tagliaerba e controlli number/select conservano le implementazioni condivise della 2.2.120. Lo slider annuncia ora l'unità corretta: percentuale, gradi, Kelvin/mired, secondi o unità HA; le opzioni standard nuove sono tradotte in italiano, mantenendo i valori originali nel servizio.

## Modello responsive e persistenza

Geometria persistita invariata: schema 3, tre colonne, righe 38px, gap 14px; XS 90px, S/M/XL 142px, L 298px. In visualizzazione `HomeGridCanvas` sceglie una o due colonne quando lo slot avrebbe larghezza inferiore a circa 170px. Clampa solo la larghezza della footprint, conserva altezza e ordine di lettura canonico. Nessun `fitScale` o font ridotto.

La proiezione usa una modalità ordinata dello stesso packing `homeLayout`: non riusa coordinate di righe più larghe e non anticipa una card per riempire un buco. La compattazione automatica della libreria viene disabilitata soltanto in questa vista stretta. In editing torna la geometria canonica; `positionsFromLayout` conserva le dimensioni del catalogo e Salva invia la versione catturata all'apertura, senza sovrascrivere aggiornamenti remoti.

## Backend e percorso comandi

I sette servizi aggiunti alla allowlist kiosk sono `media_player.media_seek`, `shuffle_set`, `repeat_set`, `cover.set_cover_tilt_position`, `vacuum.set_fan_speed`, `climate.set_swing_horizontal_mode`, `set_humidity`. Il target entità resta obbligatorio. Nessun servizio robot arbitrario viene aperto.

Card e plance riusano `performEntityAction`: prenotazione per entità, pending, stato ottimistico, errore visibile e rollback soltanto se lo stato ottimistico è ancora corrente. Token e connessione HA restano nel backend; nessun nuovo percorso dati browser o segreto frontend.

## Verifica del 6 ottobre

- Lint, **673 test / 126 file**, build:all, typecheck backend e `git diff --check`: PASS. Audit runtime frontend/backend: zero vulnerabilità. Avviso preesistente `kioskDevice` static/dynamic import presente in build, senza errore di compilazione.
- Matrice browser isolata: **392 combinazioni, 1.856 layout nelle taglie selezionabili**, 49 selezioni × Light/Dark × 390/600/768/1024px. Rettangoli dei controlli >=44px (tolleranza di misura <43px) e contenimento orizzontale: nessun problema rilevato. Le strisce scorrevoli accessibili sono ammesse; i rendering XS esclusi dal catalogo non contano come taglie operative. Geometria misurata in perf-lite per non confondere i 160ms di ingresso col contenimento a riposo. Non è un audit WCAG completo.
- Swipe orizzontale, drag mouse, gesto verticale, frecce e slider interno alla raccolta: navigazione distinta dai dettagli e dai comandi. Il cambio pagina non ha prodotto richieste servizio. Le transizioni normali sono state provate separatamente.
- Serratura: drag incompleto e Invio breve non inviano comandi; un drag completo ha prodotto esattamente un unlock fittizio. HTTP 503 ha ripristinato lo stato bloccato con errore visibile. Cancel/hold completo Android restano da collaudare fisicamente.
- Payload e rollback HTTP 503 verificati per Kelvin, fan clima, range temperatura, umidità, repeat/seek media, tilt e potenza robot. Una luce on/off senza capacità colore non mostra slider o selettore colore. Il selettore colore nativo va provato nella WebView Fully del tablet.
- Griglia reale `KioskWidgetHome`: ordine preservato a 390px (una colonna) e 600px (due colonne), compreso un widget piccolo successivo a card larghe. A 1024px il drag mantiene tre colonne. Undo/redo funzionano; dopo un aggiornamento cache alla versione 5, Salva invia ancora la versione iniziale 4. Il rifiuto conserva la bozza.
- Fixture e screenshot in [card-gestures-2026-10-05](card-gestures-2026-10-05/README.md). Tutte le entità e immagini sono sintetiche; le richieste sono intercettate localmente. Nessun nuovo stream Ring o comando ai dispositivi della casa è stato usato per questi collaudi.

## Collaudo davanti al tablet

Provare swipe e scroll verticale nella raccolta, slider senza cambio pagina, drag dall'editor, annulla/ripeti/salva, serratura incompleta/completa/cancel e selettore colore nativo. Verificare che le azioni realmente supportate arrivino a HA e che il rollback sia leggibile dopo un rifiuto. Queste prove richiedono una persona davanti a Fully: browser e heartbeat non attestano touch/multitouch Android, audio udibile, accensione fisica, wake o streaming continuativo.

I servizi backend DomusUI ancora elencati nella matrice generale — calendario CRUD, gestione persone/account/mappe, scheduler irrigazione e assistente — non sono dichiarati implementati da questo passaggio sulle card.

## Rilascio verificato — 6 ottobre

Commit `a6ffd31`, manifest automatico `520ec8a`; workflow [37421854332](https://github.com/davidep01/MyHome/actions/runs/37421854332) SUCCESS, inclusi quality gate, smoke amd64/arm64, pubblicazione e promozione latest. Home Assistant ha avviato l'installazione automaticamente; nessuna richiesta update.install aggiuntiva.

Alle 06:10–06:11 UTC: installed/latest 2.2.121, in_progress false; health OK, storage scrivibile, bridge WS con 260 entità e zero disconnessioni rilevate dal nuovo avvio. `/kiosk` HTTP 200, bundle `/assets/index-BHefdm76.js` con versione 2.2.121, chunk `KioskWidgetHome-BG3YerJf.js` con il carosello e CSS con le nuove interazioni.

Export portatili pre/post senza segreti e protetti localmente. Durante il lavoro la configurazione live è passata da home `composer` a `grid` e configVersion 6→7; questo flusso di rilascio non ha inviato scritture configurazione. Conservata la scelta live: **tutti gli altri campi dello store sono identici**, compreso il layout. Non dichiarare identico l'intero export o ripristinare il backup sopra questa modifica concorrente. Riepilogo privo di dati della casa in `release-verification.json`; backup in `/tmp/myhome-dynamic-release-2026-10-06/` con permessi 0600.
