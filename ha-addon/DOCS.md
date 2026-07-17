# S.I.M.I. Dashboard

S.I.M.I. — Sistema Integrato di Monitoraggio Intelligente — serve una dashboard privata per Home Assistant sulla porta LAN `3001`. Include una home touch per tablet e una regia amministrativa desktop.

## Configurazione

La connessione a Home Assistant è zero-config: lasciando vuoti `ha_url` e
`ha_token`, MyHome usa il proxy API interno del Supervisor e il token di accesso
fornito automaticamente all'app.

`ha_url` e `ha_token` servono soltanto per collegare un'istanza Home Assistant
diversa da quella che ospita l'app. In quel caso valorizzali **entrambi**:

- `ha_url`: URL raggiungibile dalla LAN, per esempio `http://192.168.1.20:8123`;
- `ha_token`: long-lived access token creato dal profilo dell'istanza remota.

Non configurare uno solo dei due campi.

- `admin_token`: codice per l'accesso completo alla regia.
- `kiosk_token`: codice distinto, limitato al pannello kiosk.
- `openweather_key`, `gemini_key`: integrazioni opzionali.

Gemini Vision è inoltre **opt-in** nella pagina Funzioni. Se lo attivi, a una
suonata reale verificata MyHome invia a Google Gemini lo snapshot della camera
e le eventuali foto dei volti conosciuti per il confronto. Le prove non inviano
immagini e, con il toggle spento, il videocitofono resta interamente locale.

Imposta codici admin e kiosk diversi. Se li lasci vuoti, MyHome genera due codici casuali al primo avvio, li mostra una sola volta nel log e li conserva nel volume persistente `/data`. Per sostituirli basta valorizzare le opzioni e riavviare.

## Apertura

Dopo l'avvio seleziona **Apri interfaccia web** oppure visita:

- `http://<IP_HOME_ASSISTANT>:3001/` per la regia amministrativa;
- `http://<IP_HOME_ASSISTANT>:3001/kiosk` sul tablet.

Questa applicazione è progettata esclusivamente per la LAN. Non pubblicare la porta `3001` su Internet.

## Persistenza e backup

Database, foto della cornice digitale e codici generati sono salvati in `/data` e sopravvivono agli aggiornamenti. Copia le immagini JPEG, PNG, WebP o AVIF in `/data/screensaver`. I backup portatili creati dalla pagina **Stato** non includono il token Home Assistant o le chiavi delle integrazioni e non sostituiscono le credenziali locali durante il ripristino.

## Diagnostica

Il Supervisor controlla `GET /api/health`. L'endpoint restituisce uno stato sano
soltanto se autenticazione e storage sono configurati correttamente. Per problemi
di connessione, verifica prima l'accesso al proxy API del Supervisor; se hai
impostato un override, controlla che `ha_url` e `ha_token` siano entrambi presenti
e che l'host remoto sia raggiungibile dalla LAN.
