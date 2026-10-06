# Toggle ovale e simmetrico — 6 ottobre 2026

La pista delle card era alta 44px, quanto il bersaglio touch; appariva troppo tonda. Il toggle dei gruppi/dettagli usava dimensioni iniziali diverse e veniva ingrandito senza aggiornare inset e corsa, lasciando margini disuguali.

## Correzione

- Pista ovale **56×32px**, centrata nel pulsante **56×44px**.
- Cursore **26×26px**, margine sulla pista **3px** sopra/sotto e sul lato esterno. Corsa derivata **24px**.
- Spento: sinistra 3px, destra 27px. Acceso: sinistra 27px, destra 3px.
- Una geometria CSS condivisa da `WidgetCardToggle` e `.lg-toggle`; dimensioni tramite token in `src/index.css` e `src/design/tokens.ts`.
- Light/Dark identici nella geometria; colore funzionale della pista e cursore bianco conservati. Eventi, pending e rollback non cambiano.

## Prove browser isolate

[geometry.json](geometry.json): 6 selezioni (luce accesa/spenta, switch, fan, humidifier, gruppo) × Light/Dark × 390/600/768/1024px = **48 combinazioni / 240 toggle**. Misurate tutte e cinque le taglie grezze della fixture, inclusa XS del gruppo a scopo di robustezza: non equivale a renderle tutte selezionabili nel catalogo. Tutte rispettano le dimensioni e i margini sopra descritti.

Verificato anche il toggle del pannello luce reale (`LightDetail`): pulsante 56×44px, pista 56×32px, margini estremi 27/3px. Una pressione della card invia soltanto `light.turn_off` nel laboratorio; HTTP 503 causa rollback ad acceso e messaggio di errore, senza aprire dettagli. [isolated-calls.jsonl](isolated-calls.jsonl) contiene la sola richiesta sintetica.

Screenshot delle card M con dati fittizi, accese/spente e Light/Dark:

- [Light acceso](card-light-on.png), [Light spento](card-light-off.png).
- [Dark acceso](card-dark-on.png), [Dark spento](card-dark-off.png).

Il laboratorio riusa la fixture archiviata in `../card-gestures-2026-10-05/fixture.tsx.txt` e `fixture.html.txt`. [server.mjs.txt](server.mjs.txt) archivia il server dedicato: nessun backend reale, tutte le API bloccate o sintetiche, envDir vuota. I file temporanei in radice e il server sono stati rimossi/chiusi dopo la prova.

Non sono stati eseguiti comandi sull'impianto o prove video/audio/wake. Le misure browser non certificano il touch o il rendering sul tablet fisico.

## Gate locali

Lint, 673 test / 126 file, build:all, typecheck backend e diff check PASS. Audit runtime frontend/backend: zero vulnerabilità. La prima esecuzione parallela ha avuto timeout in cinque file; la ripetizione integrale senza altri gate simultanei passa 673/673 in 3,06s. Nessuna modifica ai test o ai loro timeout.
