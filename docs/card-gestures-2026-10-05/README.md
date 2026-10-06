# Laboratorio isolato — card dinamiche

Verificato il 5–6 ottobre 2026. Solo dati sintetici; nessuna credenziale o connessione al backend della casa. I servizi HA e il salvataggio layout vengono registrati localmente e rifiutati con HTTP 503. GET layout/auth usano fixture; artwork usa SVG sintetici.

`matrix.json`: 392 combinazioni / 1.856 layout selezionabili, 49 selezioni × 2 appearance × 4 viewport. Misura >=44px con tolleranza <43px; solo contenimento orizzontale, scorrimento interno ammesso. La geometria è misurata in perf-lite; le transizioni e i gesti sono verificati separatamente. XS non consentite dal catalogo sono marcate `catalogSupported:false`. Non è un audit WCAG completo.

`calls.fixture.jsonl` contiene 10 comandi sintetici e un salvataggio layout, inclusi i due casi della prima prova del 5 ottobre. I payload non sono comandi eseguiti su HA. L'unico unlock corrisponde al drag completo; gli swipe, il drag incompleto e Invio breve non aggiungono richieste. Il PUT layout usa versione 4 anche dopo la cache aggiornata a 5; posizioni a tre colonne.

Screenshot `collection-light.png` / `collection-dark.png`: ritaglio della raccolta M con membro fan e indice 2/3. `home-390-light.png` è una cattura della viewport browser emulata, utile solo come contesto: usare i rettangoli DOM e la prova della griglia descritti nel report per le misure.

Per riprodurre con le dipendenze del repository:

1. Copiare `fixture.tsx.txt` e `fixture.html.txt` nella root come `.card-ui-audit.tsx` / `.card-ui-audit.html`.
2. Copiare `config.fixture.json` in `/tmp/myhome-gesture-config.json`.
3. Copiare `server.mjs.txt` in un `.mjs` temporaneo. Adattare il percorso assoluto del repository se necessario; `configFile:false` e `envDir` vuoto impediscono di caricare configurazione/credenziali locali.
4. Eseguire il server con Node e aprire soltanto `http://127.0.0.1:5198/.card-ui-audit.html`. Selezionare famiglia, appearance e viewport; verificare anche la classe `html.dark`. Usare Griglia manuale per il canvas effettivo.
5. Esaminare `/tmp/myhome-gesture-calls.jsonl`; i comandi sono sempre bloccati. Un secondo run può aggiungere righe al registro: distinguerle dalle evidenze archiviate.
6. Terminare il processo, chiudere la scheda e rimuovere i due file temporanei della root prima dei quality gate.

Gli elementi della toolbar del laboratorio non appartengono al prodotto. Avvisi HMR o errori 503 previsti non sono evidenze del server LAN. Il collaudo fisico Fully resta separato.
