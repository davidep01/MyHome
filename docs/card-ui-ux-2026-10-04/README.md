# Laboratorio card isolato

Dati sintetici; API bloccate con HTTP 503, salvo artwork SVG sintetico. Nessuna credenziale o comando della casa.

`matrix.json`: 294 combinazioni, appearance rilevata dalla classe `html.dark`, cinque rendering per selezione. Controllati i rettangoli di button, range, select e link rispetto a 44px (tolleranza di misura <43px) e al contenimento; scorrimento interno intenzionale ammesso. Non è un audit WCAG completo.

Per riprodurre localmente, con dipendenze già presenti:

1. Copiare `fixture.tsx.txt` nella root come `.card-ui-audit.tsx` e `fixture.html.txt` come `.card-ui-audit.html`.
2. Copiare `server.mjs.txt` in un file temporaneo `.mjs`, adattare il percorso assoluto se il repository è altrove, quindi eseguirlo con Node.
3. Aprire esclusivamente `http://127.0.0.1:5198/.card-ui-audit.html`; cambiare famiglia, tema e viewport. Il testo del pulsante Tema indica il tema corrente; verificarlo anche con la classe `html.dark`.
4. Terminare il processo isolato e rimuovere i due file temporanei della root prima dei quality gate. Non avviare il backend LAN per queste prove.

I pulsanti di laboratorio non appartengono all'interfaccia del prodotto. I dati cache possono scadere e mostrare il retry 503 previsto: ricaricare la fixture per ripartire dai dati fittizi iniziali.
