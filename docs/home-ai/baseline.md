# Baseline — progetto esistente e mappa della casa

Data: 2026-10-08. Fonte: lettura del repository `davidep01/MyHome` (S.I.M.I. 2.2.x) e di `CLAUDE.md`. Nessun accesso alla casa reale in questa consegna.

## Cosa esisteva già (e viene riusato)

| Area | Esistente | Uso nel core |
|---|---|---|
| Connessione HA | Il backend Hono tiene **l'unica** connessione autenticata (WS nativo + fallback poll) e la distribuisce via SSE (`lib/ha-ws.ts`, `lib/ha-stream.ts`) | Il core si iscrive come **lettore** (`subscribeHaStream`) tramite `adapters/ha-feed.ts`. Nessun secondo canale |
| Token HA | Solo backend (`lib/ha-config.ts`), mai nel browser | Il gateway di lettura lo riceve in una chiusura; agenti/miner/simulatore non lo vedono |
| Comandi manuali | `callService` → proxy `/api/ha/services/...` con allowlist | **Invariato.** Si aggiunge solo un header `X-MyHome-Operation` per correlare l'esito (telemetria fire-and-forget) |
| Ruoli | `lib/security.ts`: `admin` (regia) / `kiosk` (tablet), login opt-in | Le API del core usano gli stessi ruoli; dati personali e configurazione solo `admin` |
| Persistenza | Documento JSON unico (`db.json`) per la dashboard | Il core usa un archivio **separato** (`home-ai.sqlite`) accanto: un guasto del core non tocca la dashboard |
| Meteo | `routes/weather.ts` con OpenWeather (chiave lato backend, cache 10 min) | Adapter `myhome_openweather` del core, solo con `external_network_enabled: true` dichiarato |
| Dispositivi attivati | `config.deviceOverrides[id].enabled` (wizard) | Scorciatoia per la selezione opt-in delle entità da osservare |
| Regia desktop | Viste Stato / Entità / Funzioni / Sistema | Nuova vista **Memoria** (`/memoria`), lazy |

## Modifiche al codice esistente (additive e circoscritte)

- `backend/src/app.ts`: monta `homeAiRouter` su `/api/home-ai/v1`.
- `backend/src/index.ts`: avvia il core dopo il server (errore isolato).
- `backend/src/routes/ha.ts`: dopo la risposta del proxy servizi, `recordManualResultFromProxy(header, res)` — non ritarda, non ripete, non altera il comando.
- `backend/src/routes/weather.ts`: esporta `readForecastForCore()` (lettura previsioni già esistente; nessuna nuova chiamata se l'adapter è spento).
- `src/api/ha-websocket.ts`, `src/api/backend.ts`, `src/lib/manualTelemetry.ts`: intenzione del gesto registrata **in parallelo** al comando; un guasto della telemetria non blocca il comando.
- Regia: `src/pages/MemoryPage.tsx`, `src/components/memory/*`, voce di navigazione e route `/memoria`.

## Mappa della casa

Non inventata. L'inventario reale si costruisce in **Memoria → Impostazioni e privacy** dalle entità lette (sola lettura) e selezionate esplicitamente. La demo usa entità sintetiche dichiarate in `fixtures/demo-home.ts` (`light.demo_ingresso`, `light.demo_soggiorno`, `climate.demo_soggiorno`, `binary_sensor.demo_finestra_studio`, `binary_sensor.demo_porta_ingresso`, …), mai mescolate ai dati reali.

## Canali di osservazione e copertura

| Canale | Copertura dichiarata |
|---|---|
| Click della dashboard S.I.M.I. | Coperti: intenzione + esito + effetto correlato via `context.id` |
| Altre app/interfacce HA | Solo indizi (`user_id`/contesto): mai azione manuale certa |
| Pulsanti fisici, app dei produttori | Non attribuibili: origine incerta |
| Azioni senza cambio di stato da altri client | Non osservabili |
| Automazioni esistenti | Riconosciute solo se HA riporta il contesto padre |
