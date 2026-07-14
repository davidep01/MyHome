# MyHome

Dashboard privata per **Home Assistant**, progettata per un tablet a muro (Fully Kiosk / Android) e una regia desktop. L'applicazione viene servita da un unico processo Hono: SPA e API hanno la stessa origine e restano nella rete locale.

> Il solo target di produzione supportato è **LAN-only**: add-on Home Assistant oppure container Docker. L'interfaccia non va pubblicata fuori dalla rete locale.

## Cosa include

- Home kiosk touch-first, sempre accesa e adattiva
- Stato Home Assistant in tempo reale tramite bridge backend WebSocket → SSE
- Controlli ottimistici con rollback quando una chiamata HA fallisce
- Regia amministrativa per stato, entità, funzioni, sistema e backup
- Sessioni locali separate per amministratore e kiosk
- Persistenza atomica su `/data/db.json`

## Architettura di sicurezza

Il browser non comunica direttamente con Home Assistant e non riceve il relativo long-lived token. Stati, registry, media e chiamate ai servizi passano tutti dal backend MyHome, che applica autenticazione, ruoli e allowlist delle azioni.

- **Codice amministratore**: accesso completo alla regia e alla configurazione.
- **Codice kiosk**: accesso limitato al pannello `/kiosk`.
- La sessione è salvata in un cookie firmato `HttpOnly` e `SameSite=Strict`.
- In produzione l'autenticazione è obbligatoria e il servizio non risulta sano se manca il codice amministratore.

LAN-only non significa “senza autenticazione”: il pannello può comandare serrature, allarme e altri dispositivi sensibili. Non inoltrare la porta `3001` sul router e non esporla a Internet.

## Installazione come add-on Home Assistant

1. In Home Assistant apri **Impostazioni → Componenti aggiuntivi → Store → Repository**.
2. Aggiungi `https://github.com/davidep01/MyHome`.
3. Installa **MyHome Dashboard**.
4. Nella configurazione indica almeno `ha_url` e `ha_token`. Il token deve essere un long-lived access token di Home Assistant.
5. Imposta due codici diversi in `admin_token` e `kiosk_token`, quindi avvia l'add-on.
6. Usa **Apri interfaccia web** oppure visita `http://<IP_HOME_ASSISTANT>:3001/`. Sul tablet usa `http://<IP_HOME_ASSISTANT>:3001/kiosk`.

Se i due codici vengono lasciati vuoti, al primo avvio MyHome ne genera di casuali, li mostra una sola volta nel log dell'add-on e li conserva in `/data/myhome-admin-token` e `/data/myhome-kiosk-token`. Se il log non è più disponibile, inserisci nuovi codici nelle opzioni e riavvia.

Il database e i codici generati restano nel volume persistente `/data` anche dopo un aggiornamento dell'immagine.

Per la cornice digitale copia immagini JPEG, PNG, WebP o AVIF nella cartella persistente `/data/screensaver`; la pagina **Funzioni → Kiosk** mostra quante foto sono disponibili e permette di scegliere inattività, intervallo e luminosità.

## Installazione come container LAN

Per il deploy standalone è disponibile [docker-compose.yml](docker-compose.yml):

```bash
cp .env.example .env
# Modifica .env: HA_URL, HA_TOKEN e i codici di accesso
docker compose up -d
```

Apri quindi:

- regia admin: `http://<IP_DEL_SERVER>:3001/`
- kiosk: `http://<IP_DEL_SERVER>:3001/kiosk`
- healthcheck: `http://<IP_DEL_SERVER>:3001/api/health`

Per Home Assistant usa preferibilmente un IP privato stabile nel file `.env` (per esempio `http://192.168.1.20:8123`): la risoluzione mDNS dei nomi `.local` non è garantita in ogni rete Docker.

Se `MYHOME_ADMIN_TOKEN` e `MYHOME_KIOSK_TOKEN` sono vuoti o assenti, anche il container genera codici casuali al primo avvio. Recuperali con `docker compose logs myhome`; il volume `myhome-data` li conserva ai riavvii.

Aggiornamento:

```bash
docker compose pull
docker compose up -d
```

## Configurazione Fully Kiosk Browser

MyHome funziona anche in un browser Android normale. Su Fully Kiosk aggiunge progressivamente luminosità adattiva, riduzione della luminosità durante lo screensaver e riattivazione quando la fotocamera rileva movimento. Usa esclusivamente l'interfaccia JavaScript locale `window.fully`: non chiama la Remote Admin REST API e non richiede né salva la password di Fully.

Sul tablet:

1. Imposta come Start URL l'indirizzo LAN completo, per esempio `http://192.168.1.20:3001/kiosk`.
2. In **Advanced Web Settings** abilita **JavaScript Interface**.
3. Nella **JavaScript Interface URL Whitelist** inserisci soltanto l'origine di MyHome, con schema, IP e porta esatti (per esempio `http://192.168.1.20:3001/*`). Non usare `*` e non autorizzare siti esterni.
4. Concedi a Fully il permesso fotocamera se vuoi il wake-on-approach. MyHome usa `getAverageLuma()` quando disponibile e ripiega sul sensore luce Android; in assenza di entrambi il kiosk continua a funzionare con luminosità invariata.

Non è necessario abilitare **Remote Admin**. L'interfaccia JavaScript di Fully è privilegiata e va limitata a pagine fidate, come raccomandato nella [documentazione ufficiale di Fully Kiosk Browser](https://www.fully-kiosk.com/en/). MyHome la ignora inoltre se la pagina non è caricata da un indirizzo riconoscibile come locale (IP privato, host LAN a etichetta singola, `.local`, `.lan` o `.home.arpa`).

### Privacy di Gemini Vision

Gemini Vision è disattivato per impostazione predefinita e richiede un consenso esplicito nella pagina **Funzioni**. Quando è attivo, soltanto dopo una suonata reale verificata dal backend vengono inviati a Google Gemini lo snapshot del videocitofono e le eventuali foto dei volti conosciuti. Una suonata di prova non invia immagini. Le richieste duplicate provenienti da più pannelli vengono accorpate per singolo evento.

Disattivando il toggle, videocitofono, popup fullscreen e comandi porta continuano a funzionare interamente nella LAN, senza riconoscimento cloud.

## Backup e ripristino

Dalla pagina **Stato** un amministratore può esportare e ripristinare la configurazione. Il backup portatile:

- non include il token Home Assistant né le chiavi delle integrazioni;
- non sovrascrive URL e credenziali locali durante il ripristino;
- può contenere configurazione personale e riferimenti ai volti conosciuti: conservalo comunque in modo riservato.

Il backup Home Assistant dell'add-on include invece il volume persistente `/data`, come previsto dal Supervisor.

## Diagnostica

`GET /api/health` non richiede login e restituisce `200` solo quando autenticazione e storage sono correttamente configurati. Docker e il watchdog dell'add-on usano lo stesso endpoint.

Esempio:

```bash
curl -fsS http://<IP_DEL_SERVER>:3001/api/health
```

Lo stato Home Assistant e delle integrazioni opzionali è disponibile, dopo il login admin, in **Sistema**.

## Sviluppo

Requisiti: Node.js 22+ e npm.

```bash
npm ci
npm ci --prefix backend
cp .env.example .env.local
# In .env.local imposta i codici oppure usa MYHOME_AUTH_MODE=disabled solo in dev

npm run dev:all       # backend :3001 + frontend :5173
npm run build:all
npm run lint
npm test
```

Vite inoltra soltanto `/api` al backend locale (default `http://localhost:3001`). Non esiste un proxy frontend verso Home Assistant. `VITE_BACKEND_URL` può cambiare il target del proxy esclusivamente in sviluppo; non è una credenziale e non viene usato nel container di produzione.

Le chiavi `HA_TOKEN`, `OPENWEATHER_API_KEY` e `GEMINI_API_KEY` appartengono esclusivamente al backend e non devono mai avere prefisso `VITE_`.

## Stack

- **Frontend**: React 19, Vite 8, TypeScript, Tailwind 4, Zustand, TanStack Query, Framer Motion
- **Backend**: Hono su Node.js, bridge Home Assistant e persistenza locale atomica su `/data`
- **Release**: immagine multi-arch `ghcr.io/davidep01/myhome`, add-on Home Assistant e Docker Compose in LAN

Le regole UI/UX e le convenzioni di sviluppo sono raccolte in [CLAUDE.md](CLAUDE.md) e [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).
