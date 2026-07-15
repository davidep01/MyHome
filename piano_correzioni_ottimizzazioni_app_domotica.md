# Piano di correzione e ottimizzazione dell’app domotica esistente

## 1. Obiettivo dell’intervento

L’applicazione esistente non deve essere ricostruita da zero.

L’intervento deve concentrarsi su:

- correzione dei problemi attuali;
- semplificazione del backend;
- miglioramento dell’esperienza kiosk;
- estensione dei widget già presenti;
- ottimizzazione delle integrazioni Home Assistant;
- utilizzo più completo di Fully Kiosk Browser;
- introduzione progressiva di nuove funzioni;
- mantenimento dell’architettura esistente quando tecnicamente valida.

Prima di modificare un modulo, verificare:

1. componenti già disponibili;
2. logica riutilizzabile;
3. dipendenze esistenti;
4. configurazioni salvate;
5. compatibilità con le dashboard già create;
6. rischio di regressioni.

Le modifiche devono essere incrementali, retrocompatibili e rilasciabili per singolo modulo.

---

## 2. Principi di intervento

### 2.1 Non sostituire ciò che funziona

- Riutilizzare componenti, store, API e configurazioni esistenti.
- Evitare duplicazioni.
- Non cambiare struttura dati senza migrazione automatica.
- Non rimuovere funzioni esistenti senza una sostituzione equivalente.
- Conservare compatibilità con i widget già configurati.

### 2.2 Separare correzioni e nuove funzioni

Classificare ogni intervento come:

- bug fix;
- refactoring;
- miglioramento UX;
- ottimizzazione prestazioni;
- nuova funzione;
- miglioramento Home Assistant;
- miglioramento Fully Kiosk;
- sicurezza;
- diagnostica.

### 2.3 Feature flag

Le nuove funzioni devono poter essere attivate singolarmente tramite feature flag, in particolare:

- nuovo sistema widget;
- modalità campanello;
- nuova gestione clima;
- screensaver cornice;
- dark mode automatica;
- modalità allarme;
- riconoscimento volti;
- cache multimediale;
- nuovi controlli Fully Kiosk.

---

## 3. Accesso e sicurezza

### Correzione richiesta

Rimuovere il PIN dalla schermata kiosk e rendere l’accesso immediato.

### Implementazione

- Eliminare il PIN solo dalla modalità kiosk.
- Mantenere protetto il backend amministrativo.
- Usare un utente Home Assistant dedicato al kiosk.
- Non utilizzare credenziali amministrative nel frontend.
- Non mostrare token, URL interni o dati sensibili.
- Conservare le sessioni in modo sicuro.
- Prevedere logout e scadenza sessione nel backend.

### Azioni critiche

Per:

- apertura cancello;
- apertura serratura;
- disarmo;
- spegnimento generale;
- azioni di sicurezza;

utilizzare:

- pressione prolungata;
- conferma;
- feedback visivo;
- blocco dei doppi comandi;
- timeout dell’azione;
- log amministrativo.

---

## 4. Backend gestionale

## 4.1 Semplificazione del sistema esistente

Migliorare il sistema attuale di modifica e aggiunta widget senza sostituirlo integralmente.

Interventi:

- ridurre il numero di passaggi;
- rendere più chiara la selezione delle entità;
- raggruppare i dispositivi per stanza e tipologia;
- mostrare anteprima reale del widget;
- suggerire automaticamente la card più adatta;
- separare impostazioni essenziali e avanzate;
- inserire ricerca e filtri;
- permettere duplicazione e copia;
- migliorare drag and drop;
- aggiungere undo e redo;
- salvare automaticamente le modifiche;
- evidenziare modifiche non pubblicate;
- permettere rollback.

## 4.2 Modifica widget

Ogni widget deve poter essere modificato tramite un pannello unico con:

- nome pubblico;
- icona;
- stanza;
- dimensione;
- stile;
- entità collegate;
- azione principale;
- azioni rapide;
- regole di visibilità;
- animazioni;
- colori;
- priorità;
- fallback;
- comportamento offline.

## 4.3 Aggiunta widget

Il flusso deve essere:

1. selezione stanza o categoria;
2. selezione dispositivo;
3. analisi automatica delle funzioni disponibili;
4. proposta delle card compatibili;
5. anteprima;
6. configurazione essenziale;
7. salvataggio;
8. pubblicazione.

## 4.4 Versioning

Aggiungere al sistema esistente:

- bozza;
- pubblicazione;
- storico versioni;
- autore modifica;
- data modifica;
- ripristino versione precedente;
- confronto tra versioni.

## 4.5 Gestione multi-kiosk

Per ogni dispositivo mostrare:

- nome;
- stanza;
- dashboard assegnata;
- stato online;
- batteria;
- alimentazione;
- luminosità;
- volume;
- pagina attiva;
- ultimo aggiornamento;
- memoria disponibile;
- spazio disponibile;
- versione configurazione;
- ultimo errore.

Azioni amministrative:

- aggiorna configurazione;
- ricarica pagina;
- riavvia kiosk;
- accendi schermo;
- spegni schermo;
- modifica luminosità;
- modifica volume;
- avvia screensaver;
- acquisisci screenshot;
- attiva modalità manutenzione.

---

## 5. Gestione Home Assistant

## 5.1 Nascondere i nomi interni

Non mostrare mai:

- `entity_id`;
- `device_id`;
- domini;
- nomi integrazione;
- `unknown`;
- `unavailable`;
- errori grezzi;
- attributi tecnici.

Creare un livello di mapping:

```text
entità Home Assistant
→ nome pubblico
→ stanza
→ tipologia
→ icona
→ stato leggibile
→ azioni disponibili
→ widget suggerito
```

## 5.2 Analisi automatica dei dispositivi

Integrare nel sistema esistente un resolver che analizzi:

- dominio;
- `device_class`;
- stato;
- attributi;
- `supported_features`;
- stanza;
- integrazione;
- dispositivi correlati;
- servizi disponibili.

Il resolver non deve sostituire la configurazione manuale, ma proporre automaticamente:

- widget compatibili;
- controlli rapidi;
- colori;
- animazioni;
- stato pubblico;
- fallback.

## 5.3 Connessione real-time

Verificare il sistema attuale e, se necessario:

- centralizzare la connessione WebSocket;
- evitare una connessione per widget;
- evitare polling inutili;
- sottoscrivere solo le entità usate;
- aggiornare solo gli attributi modificati;
- introdurre riconnessione automatica;
- applicare backoff;
- impedire accodamento di comandi critici offline.

---

## 6. Dashboard kiosk

## 6.1 Touch-first

Correggere l’interfaccia esistente affinché sia completamente utilizzabile da touch.

Requisiti:

- target touch minimo ampio;
- nessuna funzione essenziale su hover;
- spaziatura corretta;
- pressione lunga per comandi critici;
- feedback immediato;
- blocco tocchi multipli;
- indicatori di caricamento;
- pannelli dettagliati tramite bottom sheet;
- navigazione semplice e coerente.

## 6.2 Schermata principale

La schermata principale deve essere prioritaria e sempre pronta.

Ottimizzare:

- tempo di caricamento;
- leggibilità;
- gerarchia;
- numero di widget visibili;
- accesso ai comandi principali;
- stato della casa;
- feedback degli eventi;
- passaggio alle modalità contestuali.

Inserire riepiloghi dinamici per:

- luci accese;
- clima;
- porte e finestre;
- sicurezza;
- consumi;
- dispositivi offline;
- batterie scariche;
- presenza;
- alert.

## 6.3 Preferiti intelligenti

Integrare al sistema esistente:

- preferiti manuali;
- preferiti per stanza;
- dispositivi usati frequentemente;
- dispositivi attivi;
- suggerimenti in base all’orario;
- scene contestuali;
- ultimi dispositivi utilizzati;
- anomalie.

## 6.4 Modalità contestuali

Prevedere:

- normale;
- notte;
- ospiti;
- fuori casa;
- campanello;
- allarme;
- manutenzione;
- offline;
- pulizie;
- screensaver.

Ordine di priorità:

1. allarme;
2. emergenza;
3. campanello;
4. alert critico;
5. manutenzione;
6. normale;
7. screensaver.

---

## 7. Design stile Apple HIG

L’interfaccia esistente deve essere rifinita, non sostituita.

Interventi:

- ridurre elementi visivi superflui;
- uniformare raggi, ombre e spaziature;
- migliorare tipografia;
- definire un sistema colori coerente;
- rendere le tile leggibili a distanza;
- usare materiali traslucidi solo per overlay e pannelli;
- evitare blur continuo su tutte le card;
- rendere le animazioni funzionali;
- introdurre una modalità “riduci movimento”;
- mantenere contrasto sufficiente;
- non utilizzare solo il colore per comunicare lo stato.

### Colori principali

- rosso: riscaldamento o allarme;
- blu: raffrescamento;
- arancione: dispositivo acceso o comando in corso;
- azzurro/viola: deumidificazione;
- verde: stato normale o risparmio;
- grigio: spento o inattivo.

Ogni colore deve essere accompagnato da:

- icona;
- testo;
- stato;
- eventuale animazione.

---

## 8. Sistema widget

## 8.1 Struttura comune

Adeguare i widget esistenti a una struttura comune:

- icona;
- nome pubblico;
- stato;
- dato secondario;
- colore semantico;
- azione principale;
- massimo tre shortcut;
- stato pending;
- stato offline;
- apertura dettaglio.

## 8.2 Stati standard

Normalizzare gli stati:

- idle;
- pending;
- active;
- inactive;
- warning;
- critical;
- offline;
- error;
- disabled.

## 8.3 Feedback ottimistico

Al comando:

1. aggiornamento visuale immediato;
2. stato pending;
3. invio a Home Assistant;
4. attesa conferma;
5. conferma stato reale;
6. rollback in caso di errore;
7. messaggio leggibile.

---

## 9. Widget da correggere o ampliare

## 9.1 Luci

Aggiungere o migliorare:

- on/off;
- luminosità;
- temperatura colore;
- RGB;
- consumo;
- scene;
- controllo stanza;
- alone leggero;
- colore derivato dalla luce;
- feedback durante il comando.

## 9.2 Tapparelle e tende

Aggiungere:

- posizione reale;
- apertura;
- stop;
- chiusura;
- stato movimento;
- riempimento verticale;
- blocco comandi duplicati;
- slider solo nel dettaglio.

## 9.3 Clima

Riorganizzare la card attuale mostrando:

- temperatura corrente;
- temperatura target;
- umidità;
- modalità;
- stato reale di erogazione;
- ventola;
- swing;
- preset;
- timer;
- finestra aperta;
- consumo, se disponibile.

Stati cromatici:

- rosso: caldo;
- blu: freddo;
- arancione: acceso ma non in erogazione;
- azzurro o viola: deumidificazione;
- grigio: spento.

Animazioni:

- flusso aria leggero;
- ventola;
- cambio colore controllato;
- nessuna animazione pesante continua.

## 9.4 Media player e Apple TV

Correggere la gestione dei dati recuperati.

Mostrare, quando disponibili:

- copertina;
- titolo;
- artista;
- album;
- applicazione attiva;
- sorgente;
- durata;
- posizione;
- volume;
- gruppo;
- stato riproduzione.

Aggiungere:

- play;
- pausa;
- stop;
- avanti;
- indietro;
- volume;
- cambio sorgente;
- telecomando contestuale;
- avvio app Apple TV;
- fallback con icona applicazione;
- colore dominante della copertina;
- sfondo sfocato leggero;
- cache immagini.

## 9.5 Sensori

Migliorare:

- valore principale;
- unità;
- variazione;
- soglie;
- stato normale, attenzione o critico;
- micrografico solo se utile;
- ultimo aggiornamento;
- qualità del dato.

## 9.6 Cancelli e serrature

Aggiungere:

- stato reale;
- comando in corso;
- pressione prolungata;
- conferma;
- batteria;
- ultimo utilizzo;
- videocamera associata;
- timeout;
- prevenzione doppi comandi.

## 9.7 Energia

Integrare:

- consumo istantaneo;
- produzione;
- prelievo;
- immissione;
- carichi principali;
- costo stimato;
- consumi anomali;
- batterie;
- confronto temporale.

---

## 10. Campanello

## 10.1 Correzione video Ring

Verificare il flusso attuale e correggere:

- autorizzazione;
- URL stream;
- scadenza URL;
- compatibilità codec;
- WebRTC;
- fallback HLS;
- fallback snapshot;
- timeout;
- riconnessione;
- caricamento on demand;
- sospensione quando il pannello è chiuso.

Il flusso deve tentare:

1. WebRTC;
2. stream alternativo;
3. snapshot.

## 10.2 Modalità campanello

Quando suona:

1. interrompere screensaver;
2. accendere il display;
3. impostare volume configurato;
4. mostrare overlay;
5. avviare video;
6. mostrare snapshot in fallback;
7. mostrare eventuale identificazione volto;
8. mostrare shortcut;
9. chiudere dopo timeout;
10. tornare alla dashboard principale.

## 10.3 Shortcut per singolo campanello

Configurabili dal backend:

- apri cancello;
- accendi luce ingresso;
- apri porta;
- attiva audio;
- silenzia;
- altra telecamera;
- avvia scena;
- ignora.

Ogni shortcut deve avere:

- ordine;
- icona;
- nome pubblico;
- comando;
- eventuale conferma;
- visibilità;
- timeout.

## 10.4 Riconoscimento volto

Aggiungere solo come funzione separata:

- soglia di confidenza;
- stato sconosciuto;
- nome pubblico;
- disattivazione;
- gestione volti;
- nessuna apertura automatica basata esclusivamente sul volto.

---

## 11. Modalità allarme

La modalità allarme deve includere:

- schermata rossa intermittente;
- luminosità massima;
- volume massimo;
- suono di alert;
- indicazione sensore o zona;
- blocco funzioni non rilevanti;
- pulsanti emergenza configurabili;
- chiusura al disarmo.

### Foto dal tablet

La fotocamera del tablet deve:

- scattare una sola fotografia;
- acquisirla all’attivazione dell’allarme;
- non registrare video;
- non acquisire immagini continue;
- salvare data e ora;
- salvare il kiosk;
- salvare l’evento associato;
- caricare successivamente il file sul cloud;
- mantenere una coda locale se il cloud non è disponibile.

Le ulteriori telecamere saranno integrate separatamente tramite dispositivi dedicati.

---

## 12. Fully Kiosk Browser

Integrare meglio le funzioni già disponibili.

Utilizzare:

- sensore movimento;
- sensore luminosità;
- stato batteria;
- alimentazione;
- volume;
- luminosità;
- wake screen;
- sleep screen;
- screenshot;
- pagina corrente;
- riavvio;
- vibrazione;
- TTS;
- cache;
- informazioni dispositivo;
- fotocamera per la singola foto allarme.

Non duplicare nel frontend funzioni già gestibili correttamente tramite Fully Kiosk.

---

## 13. Dark mode automatica

La modalità scura deve utilizzare il sensore di luminosità del tablet.

Correzioni tecniche:

- non cambiare tema su una singola lettura;
- applicare media mobile;
- usare isteresi;
- usare soglia di entrata e uscita differente;
- introdurre ritardo;
- permettere override manuale;
- configurare soglie per singolo kiosk;
- separare tema e luminosità display.

---

## 14. Screensaver “Cornice”

## 14.1 Integrazione nell’app esistente

Lo screensaver deve essere integrato nella dashboard esistente e non realizzato come applicazione separata.

Deve:

- attivarsi dopo inattività;
- interrompersi al tocco;
- interrompersi con movimento;
- interrompersi per campanello;
- interrompersi per allarme;
- interrompersi per alert critico;
- tornare alla dashboard principale dopo l’interruzione.

## 14.2 Google Foto

Prevedere:

- inserimento di link pubblico Google Foto;
- associazione sorgente al singolo kiosk;
- anteprima album;
- possibilità di sostituire la sorgente;
- supporto futuro a integrazione Google Photos dedicata;
- gestione del link non valido o revocato;
- nessuna esposizione di credenziali nel frontend.

Poiché i link pubblici Google Foto non sono feed stabili, il sistema deve prevedere un adapter sorgente sostituibile.

Struttura consigliata:

```text
PhotoSourceAdapter
- Google Photos public link
- Google Photos API/Ambient
- cartella locale
- URL JSON
- cloud storage futuro
```

## 14.3 Modalità di visualizzazione

- riempimento;
- adattamento;
- ritaglio intelligente;
- sfondo sfocato per foto verticali;
- cornice;
- passe-partout;
- galleria;
- ordine casuale;
- ordine cronologico;
- foto recenti;
- esclusione ripetizioni.

## 14.4 Overlay

Opzionali:

- ora;
- data;
- meteo;
- temperatura;
- album;
- località;
- anno;
- messaggio domestico.

Il colore del testo deve adattarsi alla luminosità della foto.

## 14.5 Prestazioni

- precaricare le prossime due immagini;
- non caricare tutto l’album;
- ridimensionare le immagini;
- usare cache locale;
- pulire la cache;
- sospendere animazioni a schermo spento;
- usare fallback offline;
- evitare bande nere;
- ridurre consumo memoria.

---

## 15. Prestazioni

L’obiettivo è massimizzare la fluidità, senza garantire 120 fps su hardware non compatibile.

### Requisiti

- 60 fps stabili come base;
- 90/120 fps quando supportati;
- animazioni tramite `transform` e `opacity`;
- evitare layout thrashing;
- sospendere widget non visibili;
- caricare media on demand;
- ridurre blur e ombre sui dispositivi lenti;
- disabilitare animazioni a schermo spento;
- adattare automaticamente la qualità.

### Profilo prestazioni

Prevedere tre profili:

- alta qualità;
- bilanciato;
- risparmio.

Configurabili per singolo kiosk.

---

## 16. Cache e media

Centralizzare:

- copertine;
- snapshot;
- icone;
- immagini;
- screensaver;
- media temporanei.

Aggiungere:

- proxy backend;
- cache;
- scadenza;
- fallback;
- ridimensionamento;
- pulizia automatica;
- diagnostica;
- limite spazio;
- gestione LRU.

---

## 17. Gestione offline

Correggere il comportamento in caso di perdita connessione.

Mostrare:

- stato offline leggibile;
- ultimo stato noto;
- ora ultimo aggiornamento;
- riconnessione automatica.

Non fare:

- accodamento di apertura cancello;
- accodamento apertura porta;
- accodamento disarmo;
- invio successivo di comandi critici.

Lo screensaver deve poter continuare con la cache locale.

---

## 18. Diagnostica

Integrare nel backend esistente:

- errori frontend;
- errori Home Assistant;
- errori Fully Kiosk;
- latenza comandi;
- tempo apertura video;
- stato WebSocket;
- riconnessioni;
- memoria;
- frame rate;
- spazio cache;
- dispositivi offline;
- entità non disponibili;
- configurazioni invalide;
- log modifiche;
- ultimo aggiornamento kiosk.

---

## 19. Ordine degli interventi

### Priorità 0 — Correzioni

1. rimozione PIN kiosk;
2. protezione backend;
3. correzione video Ring;
4. rimozione nomi tecnici Home Assistant;
5. gestione offline;
6. centralizzazione stato e WebSocket;
7. correzione comandi duplicati;
8. stabilità della schermata principale.

### Priorità 1 — Miglioramento UX

1. semplificazione modifica widget;
2. selezione dispositivo per stanza;
3. anteprima widget;
4. touch UX;
5. stati cromatici;
6. gestione clima;
7. gestione media;
8. bottom sheet;
9. dark mode automatica.

### Priorità 2 — Funzioni contestuali

1. modalità campanello;
2. shortcut campanello;
3. modalità allarme con singola foto;
4. screensaver cornice;
5. preferiti intelligenti;
6. modalità notte, ospiti e pulizie.

### Priorità 3 — Ottimizzazioni evolute

1. capability resolver;
2. cache multimediale;
3. profili prestazioni;
4. versioning backend;
5. diagnostica avanzata;
6. adapter Google Foto;
7. riconoscimento volti;
8. gestione completa multi-kiosk.

---

## 20. Criteri di accettazione

Una modifica è completata solo quando:

- non rompe i widget esistenti;
- mantiene le configurazioni salvate;
- funziona su touch;
- non mostra dati tecnici;
- gestisce stato offline;
- presenta feedback immediato;
- registra errori;
- è disattivabile tramite feature flag;
- è testata su Fully Kiosk;
- è testata con Home Assistant;
- è testata in light e dark mode;
- non introduce regressioni prestazionali;
- dispone di rollback.

---

## 21. Regola finale di sviluppo

Ogni attività deve seguire questo ordine:

1. analisi del codice esistente;
2. identificazione del componente da correggere;
3. riutilizzo della logica disponibile;
4. modifica minima necessaria;
5. test isolato;
6. test integrato;
7. verifica prestazioni;
8. verifica kiosk;
9. migrazione configurazioni;
10. rilascio progressivo.

Non ricostruire moduli completi quando è sufficiente correggere, estendere o rifattorizzare quelli già presenti.
