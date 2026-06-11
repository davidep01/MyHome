# CLAUDE.md — MyHome

> Documento sorgente unico (grafico + tecnico) per lo sviluppo e la **ristrutturazione** di MyHome.
> Versione doc: 2.0 · Allineato a app `2.2.x` · Aggiornato: 2026-06-08 · Lingua: italiano (identificatori in inglese).
>
> Questo file ha **precedenza** sulle assunzioni generiche. `docs/DESIGN_SYSTEM.md` resta il riferimento grafico esteso; questo file lo riassume e ne risolve le incongruenze. Quando i due divergono, **vince questo file** e va aggiornato `docs/DESIGN_SYSTEM.md` di conseguenza.

---

## 0. Istruzioni operative per Claude

- **Refactor evolutivo, non rewrite.** Lo stack è sano (vedi §5). Non riscrivere l'app da zero; consolida i layer divergenti.
- **Prima leggi, poi tocca.** Prima di modificare un'area, leggi i "file chiave" della sezione corrispondente. Non duplicare logica già esistente.
- **Una sola fonte di verità per ogni cosa.** Token in `src/design/tokens.ts` + `src/index.css`. Griglia home nel modello di `backend/src/lib/home-layout.ts`. Tipi condivisi in `backend/src/db/types.ts`.
- **Niente segreti nel bundle frontend.** Chiavi (`GEMINI_API_KEY`, `OPENWEATHER_API_KEY`, Supabase service role) **solo** lato backend, senza prefisso `VITE_`.
- **Italiano nell'UI**, sempre. Tono conciso.
- **Ottimismo obbligatorio** per ogni azione verso HA: UI aggiorna subito, rollback se HA fallisce.
- **Target primario = tablet a muro** (Fully Kiosk, Android). Ogni scelta UX si valuta prima lì: touch ≥ 44×44px, niente hover-only, performance su GPU mid-range.
- **Verifica prima di dire "fatto".** `npm run build && npm run build:backend` devono passare. Non dichiarare completato senza output di verifica.

---

## 1. Cos'è MyHome

Dashboard domotica personale per **Home Assistant**, estetica **Apple "Liquid Glass"** (vetro smerigliato su parchment `#f5f5f7`, zero ombre decorative, un solo accento blu). Due contesti d'uso:

| Contesto | Dispositivo | Shell | Scopo |
|---|---|---|---|
| **Kiosk** | Tablet Android a muro (Fully Kiosk) | `KioskShell` | Controllo quotidiano, sempre acceso, touch |
| **Desktop / Regia** | Browser desktop | `DesktopShell` | Regia in 4 viste: Stato, Entità, Funzioni, Sistema |

La home si **auto-configura** dallo stream live di HA (entità raggruppate per dominio/area). Zero setup manuale per l'utente finale.

**Funzioni distintive:** home kiosk **auto-composta per rilevanza** (composer deterministico + isteresi — niente tile da gestire), ambient mode su idle con presence-wake, timeline di casa, suggerimenti azionabili ("luci accese e casa vuota → Spegni tutte"), campanello → alert video fullscreen, night mode da sensore di luce, AI (Gemini) grounded sulle entità reali, resilienza HA-down con overlay e reconnect. La griglia manuale sopravvive solo come fallback legacy (`localStorage['myhome.home']='grid'`).

---

## 2. Stack tecnologico

**Frontend** — React 19 · Vite 8 · TypeScript 6 · Tailwind 4 (`@tailwindcss/vite`, niente `tailwind.config`, token in `@theme`) · Zustand 5 (stato) · TanStack Query 5 (fetch/cache) · Framer Motion 12 · `home-assistant-js-websocket` · `react-grid-layout` (layout editabile) · `hls.js` (camere) · `lucide-react` (icone) · `vite-plugin-pwa` (attualmente **selfDestroying**, vedi §4.4).

**Backend** — Hono 4 su `@hono/node-server` · TypeScript 5 · `tsup` (build) / `tsx` (dev) · `@supabase/supabase-js` (persistenza opzionale) · `rss-parser` (news). Serve **sia** l'API JSON **sia** la SPA buildata.

**Deploy** — Add-on Home Assistant (immagine Docker `ghcr.io/davidep01/myhome`, persistenza su `/data`) **e** Vercel (`api/index.ts` riusa l'app Hono, persistenza Supabase o read-only).

---

## 3. Comandi

```bash
# Sviluppo (frontend + backend insieme)
npm run dev:all          # concurrently: backend :3001 + vite :5173
npm run dev              # solo frontend
npm --prefix backend run dev   # solo backend

# Build
npm run build            # tsc -b + vite build  → dist/
npm run build:backend    # tsup                 → backend/dist/
npm run build:all        # entrambi (usare questo prima di considerare "fatto")

# Qualità
npm run lint             # eslint
```

**Proxy dev** (`vite.config.ts`): `/ha` → istanza HA, `/api` → backend `:3001`.
**Variabili dev** principali: `VITE_HA_URL`, `VITE_BACKEND_URL`. Backend: `HA_URL`/`HA_TOKEN`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `OPENWEATHER_API_KEY`, `GEMINI_API_KEY`, `MYHOME_DB_PATH`, `MYHOME_READ_ONLY`, `MYHOME_HA_POLL_MS` (poll fallback, default 1500), `MYHOME_HA_STREAM=poll` (disabilita il bridge WS).

---

## 4. Architettura attuale (mappa)

### 4.1 Shell e routing
`AppShell` (`src/components/layout/AppShell.tsx`) sceglie la shell dal **pathname**:
- `/kiosk`, `/tablet`, `/dashboard` **oppure** non-desktop → `KioskShell` (→ `TabletDashboard` → `LayeredHome`, o grid legacy via flag).
- Resto su desktop → `DesktopShell` = **la regia, 4 viste**: Stato (`/`), Entità (`/entities`), Funzioni (`/functions`), Sistema (`/system`); alias legacy `/settings`→Sistema. Il controllo della casa da desktop è il kiosk stesso (`/kiosk`, linkato in sidebar).
- La vista attiva (`useUIStore().activeView`) è **sincronizzata bidirezionalmente con l'URL** (`useViewRouting` in `AppShell.tsx` + `VIEW_PATHS`/`viewFromPath` in `src/store/ui.ts`): deep-link, back/forward e refresh funzionano. Nessun router library (scelta deliberata).

> ✅ **Risolto (P6, 2026-06-09):** routing ibrido chiuso con il sync URL↔store di cui sopra. Le viste desktop sono inoltre **lazy** (un chunk per pagina) e `hls.js` è caricato on-demand solo quando parte uno stream.

### 4.2 Connessione a Home Assistant (`src/api/ha-websocket.ts`)
**Un solo percorso dati per tutti i client (M0/DOMINICA, 2026-06-10).** Il backend tiene **l'unica** connessione autenticata a HA e fa fan-out via SSE:
- **Bridge backend** (`backend/src/lib/ha-ws.ts` + `ha-stream.ts`): WebSocket nativo Node (zero dipendenze) con `subscribe_entities` (delta push compressi; codec puro testato in `ha-ws-codec.ts`); heartbeat ping 30s, reconnect con backoff; **downgrade automatico al poll** `/api/states` (`MYHOME_HA_POLL_MS`, default 1500ms) quando il WS è giù; `MYHOME_HA_STREAM=poll` forza il solo poll.
- **Client** (`connectHAStream` — kiosk **e** desktop): SSE `GET /api/ha/stream` con resume `Last-Event-ID` (ring buffer server-side, niente full snapshot su micro-disconnessioni); fallback automatico a `connectHAProxy` (poll REST 4s). `localStorage['myhome.haStream']='off'` forza il poll in diagnostica.
- **Azioni**: `callService` passa **sempre** dal proxy backend (`/api/ha/services/...`, allowlist per il tablet). Il token **non arriva mai** nel browser; `/api/config/ha-credentials` è stato **rimosso**. Registry HA proxato: `GET /api/ha/registry` (cache 60s, ora disponibile anche sul kiosk). HLS camere firmato dal backend: `GET /api/ha/camera-hls-url/:id` (WebRTC/talk-back rimossi insieme al WS in browser; torneranno con un signaling proxy backend).

Stato entità in `useEntityStore` (Zustand): i delta sono **coalescenti** (finestra 50ms, un solo set per batch, riferimenti stabili per le entità non toccate → `useHAEntity` non ridisegna ciò che non cambia). Update ottimistici via `setOptimisticState` / `patchEntity`.

### 4.3 Backend (`backend/src/`)
Hono con route montate in `app.ts`: `config`, `layout`, `rooms`, `entities`, `weather`, `news`, `ha`, `ai` + `/api/health`. `index.ts` serve la SPA da `dist/` con cache-control studiata per il kiosk (entry-point `no-store`, asset hashati `immutable`), e fa SPA fallback **escludendo** `/api/*`.

**Persistenza** (`backend/src/db/client.ts`): un unico documento `DbStore` (`{ config, rooms, entities }`) con tre modalità auto-rilevate:
- `supabase` (se `SUPABASE_URL` + service role) → riga unica in tabella `myhome_config`.
- `file` → `data/db.json` (add-on HA, `/data`).
- `read-only` → nessuna scrittura (Vercel senza Supabase).

Ogni `write` fa read-modify-write dell'intero blob. La route `layout` usa **concorrenza ottimistica** (`layoutVersion`). Config live propagata a tutti i client via **SSE** (`/api/config/stream`, `useConfigSync`).

**Credenziali HA** (`backend/src/lib/ha-config.ts`): precedenza `env` > `db` > default; se da env sono **locked** (non sovrascrivibili da UI). Token mai restituito in chiaro da `/api/config` (mascherato `***`), ma disponibile su `/api/config/ha-credentials`.

### 4.4 Deployment
- **Add-on HA** — `Dockerfile` (artefatti pre-buildati in CI), `run.sh` legge `/data/options.json` (Supervisor) → env, avvia backend. `ha-addon/config.yaml` versionato (`2.2.x`).
- **Vercel** — `api/index.ts` esporta l'app Hono; `vercel.json` riscrive `/api/*` → funzione, resto → SPA.
- **PWA / Service Worker**: attualmente `VitePWA({ selfDestroying: true })` — il SW si **auto-disinstalla**. Il caching SW causava shell stale sul kiosk; ora la freschezza è gestita via header cache-control nel backend.

---

## 5. Valutazione architettura + target (LA RISTRUTTURAZIONE)

### Verdetto
**Lo stack non va cambiato.** React + Vite + Tailwind + Zustand + TanStack Query + Hono + HA-WS è la combinazione giusta per questo prodotto. I problemi reali sono **incongruenze strutturali e duplicazioni**, non scelte di framework. → **Refactor evolutivo in fasi**, non rewrite.

### Problemi strutturali (corretti dopo lettura del codice)

> Rispetto alla prima stesura due affermazioni sono **ritrattate** (vedi §5.bis): `HomeWidgetView` è *già* il renderer condiviso e le tre "griglie" in realtà **concordano** sulla geometria. Il problema vero è la **duplicazione del kernel di layout** e il **doppio percorso di scrittura**, non un conflitto di griglie.

**P1 — Kernel di layout triplicato (DRY rotto sul confine FE/BE).** Lo stesso bin-packing (`buildLayout`/`cellsFor`/`fits`/`occupy`/`firstFreeSlot`) è copiato **tre volte**: [WidgetHome.tsx](src/components/home/widgets/WidgetHome.tsx), [KioskWidgetHome.tsx](src/components/home/widgets/KioskWidgetHome.tsx), [home-layout.ts](backend/src/lib/home-layout.ts). E `SIZE_WH` è duplicato in [widgetCatalog.ts](src/components/home/widgets/widgetCatalog.ts) **e** `home-layout.ts`. Se le copie divergono, il layout si corrompe. Il backend ha già la versione migliore (validazione, normalizzazione, `lastValidPositions`).

**P2 — Doppio percorso di scrittura con clobber di concorrenza.** Il desktop salva la home via `PUT /api/config` (`useUpdateConfig`, **nessun** controllo di versione); il kiosk via `PUT /api/layout/home` (`useSaveTabletLayout`, controllo `layoutVersion` con 409). Entrambi mutano `config.home`: un salvataggio desktop può **sovrascrivere silenziosamente** una disposizione del kiosk (last-writer-wins), e la versione è gestita client-side sul desktop ma server-side sul kiosk. Bug reale, non solo duplicazione.

**P3 — Ridondanza di polling sul tablet a muro.** Girano insieme: SSE config (`/api/config/stream`) **+** poll config 4s (`useDashboardConfig`) **+** poll layout 6s (`useTabletLayout`) **+** poll stati HA 4s (`connectHAProxy`). Il re-poll stati a 4s è anche la causa dell'optimistic che "sfarfalla" (sovrascrive lo stato ottimistico locale).

**P4 — Token HA nel browser + niente realtime sul kiosk = stesso fix.** Il desktop apre il WS a HA con il long-lived token **in browser** (smell di sicurezza); il kiosk evita il token ma per questo è ridotto a REST polling 4s (no realtime). **Una sola soluzione risolve entrambi:** il backend tiene **un** WS autenticato verso HA e fa fan-out degli stati ai client via SSE (l'infra SSE esiste già in `configEvents`). Token mai nel browser, realtime per tutti, via il poll 4s. È **l'unico vero cambio architetturale** che conviene fare.

**P5 — Due componenti home quasi gemelli (~350 righe ciascuno).** `WidgetHome` e `KioskWidgetHome` condividono `MeasuredGridLayout`, `HomeWidgetView` e il kernel di packing; differiscono solo per *capability* (desktop: aggiungi/rimuovi/ridimensiona widget; kiosk: solo riordino) e *chrome* (header/toolbar). Vanno collassati in **un** `<HomeGrid>` + due adapter sottili.

**P6 — Routing ibrido** (URL decide la shell, Zustand `activeView` decide la pagina). Non linkabile, non refresh-safe, niente history. Priorità minore (app monoutente) ma è la causa della confusione desktop/kiosk.

**P7 — Igiene.** `README.md` è ancora il template Vite; `process.env` iniettato via Vite `define` come oggetto congelato; lint type-aware spento; nessun test (almeno il kernel `home-layout.ts`, logica pura, andrebbe testato).

### §5.bis — Cosa ho ritrattato (onestà tecnica)

- ❌ ~~"Tre griglie in conflitto"~~ → **le griglie concordano**. Home-widget `8col×64px` (sm/md/lg/wide) e bento device `112px` sono *due griglie diverse per due scopi diversi*, entrambe legittime; la mappa estetica `widgetVisualSizeFromHomeSize` (sm→S, lg→L, else M) **esiste già** in `getWidgetSizeConfig.ts`. Il residuo è solo cosmetico (minHeight S/M/L) e trascurabile perché le card usano `h-full` dentro il grid.
- ❌ ~~"Doppia implementazione / renderer duplicato"~~ → **`HomeWidgetView` è già condiviso** da desktop e kiosk. A essere duplicato è il *kernel di layout* e il *guscio* del componente, non il rendering dei widget.
- ✅ **De-escalato (non sono problemi):** persistenza a documento JSON singolo (perfetta per una sola casa) e read-modify-write dell'intero blob (irrilevante a questa scala). Da **non** toccare.

### Architettura target

```
┌──────────────────────────────────────────────────────────────┐
│  UNA shell, UN router                                         │
│  Router URL-based → /, /aree, /clima, … , /admin/*           │
│  Variante kiosk = stessa shell con chrome ridotto + wakelock  │
├──────────────────────────────────────────────────────────────┤
│  UN layer dati HA                                             │
│  Realtime per tutti i client (WS diretto dove possibile,      │
│  altrimenti bridge SSE/WS dal backend — niente polling 4s)    │
│  useEntityStore resta l'unica fonte di stato entità           │
├──────────────────────────────────────────────────────────────┤
│  UN kernel di layout condiviso                                │
│  home-layout.ts (8col×64px, sm/md/lg/wide) = unica sorgente   │
│  di packing + SIZE_WH; copie in WidgetHome/KioskWidgetHome    │
│  eliminate. Un solo <HomeGrid> + adapter desktop/kiosk        │
│  Un solo percorso di scrittura (/api/layout con layoutVersion)│
├──────────────────────────────────────────────────────────────┤
│  Backend Hono invariato (route + SSE config) +                │
│  persistenza a documento singolo (ok per single-home)         │
│  Segreti solo backend. Token HA mai necessario in browser.    │
└──────────────────────────────────────────────────────────────┘
```

### Piano a fasi (riordinato per leva × rischio; ogni fase è rilasciabile)

1. ✅ **Fase 1 — Doc + igiene.** CLAUDE.md con diagnosi corretta + README reale.
2. ✅ **Fase 2 — Kernel di layout unico (P1).** [src/lib/homeLayout.ts](src/lib/homeLayout.ts) è l'unica sorgente FE di packing + `SIZE_WH` (allineata al backend); rimosse le due copie in `WidgetHome`/`KioskWidgetHome`; `widgetCatalog` riesporta `SIZE_WH` dal kernel.
3. ✅ **Fase 3 — Concorrenza condivisa (P2).** Guard `layoutVersion` aggiunto anche a `PUT /api/config` (stesso contatore del layout route → niente clobber, 409 su scrittura stale). L'optimistic update FE allinea la versione per evitare 409 spuri su edit rapidi. *(Endpoint non ancora unificati: scelta deliberata, basso valore per app monoutente.)*
4. ✅ **Fase 4 — Canvas home condiviso (P5).** [HomeGridCanvas](src/components/home/widgets/HomeGridCanvas.tsx) centralizza il plumbing react-grid-layout + il render del widget; `WidgetHome`/`KioskWidgetHome` mantengono solo toolbar/header/persistenza.
5. ✅ **Fase 5 — Backend HA stream via SSE (P4, chiude anche P3).** [backend/src/lib/ha-stream.ts](backend/src/lib/ha-stream.ts) tiene **un** poll server-side verso HA e fa fan-out dei *delta* via SSE (`GET /api/ha/stream`); il token resta lato server. Il kiosk usa [connectHAStream](src/api/ha-websocket.ts) con **fallback automatico** al poll REST. `useEntityStore` invariato a valle. *(Implementato come poll-centralizzato+SSE, non WS HA grezzo: più sicuro/verificabile; il desktop resta su WS diretto.)*
6. ✅/◻ **Fase 6 — README + test + lint (P7).** README reale ✅, test del kernel con vitest ✅ (`npm test`), lint verde ✅. **◻ Rimandato:** routing URL-based (P6) — basso valore/alto rischio per app monoutente; migrazione del *desktop* allo stream (P4 lato admin) — opzionale.

> **De-escalato (non toccare):** persistenza a blob singolo, RMW dell'intero documento; niente router pesante.

### Stato implementazione (2026-06-08)

Fasi 2–5 + igiene applicate. Verifiche: `npm run build:all` ✅ · `npm run lint` ✅ · `npm test` ✅ (10/10 sul kernel).

**Da verificare sul tablet reale** (non testabile qui senza HA live): lo stream `GET /api/ha/stream` sul kiosk. Default = stream con fallback; per forzare il vecchio poll in diagnostica → `localStorage['myhome.haStream'] = 'off'`. Intervallo poll server-side: env `MYHOME_HA_POLL_MS` (default 1500ms).

**Risolti (2026-06-09):**
- **P6 routing** — sync URL↔`activeView` (`useViewRouting`): deep-link, back/forward e refresh funzionano su desktop. Kiosk invariato.
- **Type-error backend** — `backend/src` ora passa `tsc --noEmit` pulito (narrowing in `home-layout.ts`, guard `roomId` in `entities.ts`).
- **Bundle FE** — code-splitting: main chunk 1.65MB → ~680KB (gzip 480→181KB). Viste desktop lazy per pagina; `hls.js` (~509KB) dynamic-import al primo stream; vendor (`react`, `framer-motion`, `react-grid-layout`) in chunk separati cache-abili (`manualChunks` in `vite.config.ts`).
- **Card widget (kiosk)** — touch target ≥44px via utility `.tap-target` (hit-area estesa senza alterare la grafica) su LightCard/FanCard/VacuumCard/MediaCard e `.widget-card-toggle`; rimossi i `backdrop-filter` annidati in `WidgetCardRing`/`WidgetCardDial`; animazioni `filter`-based convertite a transform/opacity (`widget-breathing`, `widget-heat`, `widget-anim-energyFlow`); animazioni loop congelate in `perf-lite`; `contain: layout style paint` su `.widget-card-shell`; lo slider inline non propaga più click/pointer alla card.

**Risolti (2026-06-10) — admin + polish kiosk:**
- **Admin onesto** — le "Sezioni operative" di `BackendHomePage` ora navigano alle 4 sezioni reali di `SettingsPage`; sezione deep-linkabile e refresh-safe via `/settings?section=…`.
- **Backup/Ripristino** — `GET /api/config/export` (download JSON dell'intero `DbStore`) e `POST /api/config/import` (restore con re-normalizzazione del layout via `mergeHomeConfig`, rispetta read-only); UI in `BackendHomePage` (`configApi.exportBackup/importBackup`).
- **Coreografia d'ingresso** — le card della home entrano con stagger 35ms (`.card-enter` in `index.css`, applicata in `HomeGridCanvas`); transform/opacity only, disattivata in perf-lite/reduced-motion.
- **Zoom card→pannello** — il `GlassSheet` centrato nasce dal punto di tocco e ci ritorna alla chiusura (cattura `pointerdown` globale, nessun cambio ai call-site); fallback fade+scale in perf-lite.
- **Feedback fisico sul rollback** — `useActionFeedback` (shake `widget-anim-errorShake` + haptic heavy). *(Correzione 2026-06-10: inizialmente collegato alle card standalone, poi scoperte morte — ora è nel `WidgetCardFactory`, il percorso vivo.)*

**Risolti (2026-06-10) — sistema card unico e completo:**
- **Eliminato il doppio sistema card.** Le 17 card di dominio standalone (`LightCard`, `SwitchCard`, `FanCard`, …) erano **codice morto a zero importer**: il percorso vivo è `WidgetCardFactory` + `mapEntityToWidgetCard` + `WidgetCardBase`. Cancellate; restano vivi `GroupCard`, `CameraStream`, `WidgetCardBase/Factory/Preview/Grid`.
- **Stati HA tradotti** — `utils/stateLabel.ts`: mappa italiana completa (aperture, serrature, clima, robot, allarme, presenza, meteo, sole); fallback `snake_case → parole`. Tipografia corretta: `°C` (non "C"), "Luminosità/Velocità/Qualità" accentate, serratura "Aperta/Chiusa".
- **Nuovi domini pronti** — `humidifier` (toggle + slider umidità target, tono water), `lawn_mower` (famiglia `mower`, start/dock, icona Bot), `air_quality`, `update` (badge warning se disponibile; **escluso dalla discovery** di proposito, è rumore quasi-diagnostico). `valve` ora azionabile (apri/chiudi). Aggiunti a `DOMAIN_TYPE`/`DOMAIN_META` (riusano EntityType affini: niente cambi al backend).
- **Animazioni sobrie** — sparkle solo su automazioni *attive* (prima loopava anche a riposo); rimossi `successPop`/`lockSnap` persistenti; ogni azione del factory passa da `act()` → rollback + shake + haptic su errore (prima clima/cover/lock/vacuum/media fallivano in silenzio).

**Risolti (2026-06-10) — M0 DOMINICA (fondazioni dati; piano completo in `docs/DOMINICA.md`):**
- **HA Bridge v2 (P4 chiuso del tutto)** — il backend apre **un** WebSocket nativo Node verso HA (`ha-ws.ts`, zero dipendenze: auth, comandi id-correlati, `subscribe_entities` compresso, ping 30s) e fa fan-out via SSE; il poll è retrocesso a **fallback automatico** (grace 3s, ritorno al WS appena risale). Latenza dati: da ~750ms media a <100ms.
- **Token fuori dal browser anche su desktop** — `connectHA`/`getConnection` eliminati; `/api/config/ha-credentials` rimosso; desktop sullo stesso `connectHAStream` del kiosk; `callService` sempre via proxy.
- **Resume SSE** — eventi con id monotono + ring buffer server-side: una riconnessione EventSource riprende dai delta persi (`Last-Event-ID`) senza full snapshot.
- **Coalescing client** — i delta si accumulano 50ms e fanno **un** set Zustand per batch (`applyEntityDelta`), riferimenti stabili per le entità non toccate.
- **Registry per tutti** — `GET /api/ha/registry` (cache 60s): il kiosk ora filtra le entità nascoste in HA (prima il filtro falliva in silenzio senza WS); `ha-registry.ts` non usa più la connessione browser.
- **Camere senza WS** — catena HLS (URL firmato dal backend via `GET /api/ha/camera-hls-url/:id`) → MJPEG → snapshot; il **kiosk guadagna l'HLS** (prima solo MJPEG). WebRTC/talk-back rimossi (richiedevano il WS in browser; sul kiosk non hanno mai funzionato) — torneranno con un signaling proxy. Il campanello usa `preferLive` (MJPEG diretto, latenza ~live).
- **Bugfix allowlist** — `humidifier` e `lawn_mower` mancavano dall'allowlist servizi del tablet: le card nuove 403-avano dal kiosk.
- **Cache meteo server-side 10min** — N client non diventano più N chiamate OpenWeather.
- **Igiene store UI** — rimossi 4 campi morti (`theme`, `activeRoom`, `dashboardView`, `rightPanelOpen`).
- Test: 18/18 (kernel layout 10 + codec compresso `subscribe_entities` 8).

**Risolti (2026-06-10) — DOMINICA M1–M8 (il redesign; piano in `docs/DOMINICA.md`):**
- **M1 Kiosk a strati** — `LayeredHome`: StatusHeader (ora/presenza/meteo/chip-anomalia) + "Adesso" (card scelte dal **composer** `src/lib/composer.ts`: puro, deterministico, priorità sicurezza>media>clima>robot>luci-per-area, isteresi dwell 45s / max 1 swap/30s / P0 immediato — 13 test) + chip Stanze dalle aree HA + sheet inventario. Quiete = Momenti+meteo+energia. Grid legacy dietro flag, lazy.
- **M2 Regia Stato+Sistema** — `GET /api/system/status` (latenza HA, modalità bridge, client SSE, storage, chiavi boolean); `StatusPage` landing ("Cosa non va", attività, backup); `SystemPage` con form connessione e diagnostica **vera** via `entity_category` dal registry.
- **M3 Workbench Entità** — tabella unica con filtri/ricerca/bulk/rinomina inline, dettaglio con **anteprima live della card**, gruppi; aree in sola lettura dal registry HA (mai più entity_id a mano).
- **M4 Funzioni + Timeline** — `FunctionsPage` (identità, tema/night, campanelli, suoni, kiosk, semaforo integrazioni); `GET /api/ha/logbook` filtrato + `TimelineSheet` ("Oggi a casa", tap sull'orologio).
- **M5 Energia onesta** — capability-gated, sensore più attivo vs la SUA media 24h; niente somme arbitrarie, niente "ML".
- **M6 Suggerimenti** — `src/lib/insights.ts` (6 test): regole locali leggibili con bottone-azione (il tap è la conferma); mai auto-esecuzione.
- **M7 Ambient + presenza** — `AmbientLayer` (idle 180s, orologio 112px su #070709, drift anti-burn-in transform-only, mai sopra un danger), presence-wake da `config.kiosk.wakeEntityId`, `DuskLayer` (velo caldo ≤6% da sun.sun).
- **M8 Demolizioni** — via le 9 pagine controllo desktop, `SettingsPage` (e il PIN finto), `WidgetHome`/`WidgetPicker`, `EntityCollectionPage`, `HomeHeader`; AppView a 4; sidebar 4+kiosk-link. Main chunk 689→646KB.

**Risolti (2026-06-10, sera) — feedback dal tablet reale:**
- **Gestione "tile"** — override per entità `DeviceOverride.hero: 'always'|'never'` (workbench → dettaglio → "Nello strato Adesso": Auto/Sempre/Mai); il composer garantisce i pinned (mai sopra la P0) ed esclude i banned anche dai gruppi-luce. La visibilità generale resta nascondi/mostra in Entità.
- **Gemini Vision campanello: non aveva mai funzionato** — il client AI non mandava `X-MyHome-Client` (403 su desktop) e il kiosk saltava il riconoscimento di proposito. Ora `/api/ai/recognize` + `/health` sono accessibili dal tablet (chat/suggest/automation restano desktop-only), il kiosk esegue il riconoscimento, toggle `config.ai.doorbellVision` in Funzioni→Campanelli (propagato via `/api/layout`), **fallback generico** ("C'è qualcuno alla porta!") quando l'AI è spenta/assente/fallisce.
- **Controlli universali** — `GenericDetail` nel pannello contestuale: plancia per OGNI dominio (fan/cover/valve/lock con **hold 900ms**/vacuum/mower/humidifier/scene/script/button/select/number/water_heater/siren/camera live) + stato tradotto e attributi; sparito "Controlli avanzati non ancora disponibili".
- **Grafica card de-ridondata** — il `primary` vive nel ring O nella colonna valore, mai in entrambi; i toggleabili spenti mostrano icona + "Spenta/Spento" una volta sola (niente più anello 0% + "0%" + "Off" arancio + "Spenta"); `secondary` in inchiostro muto, non accento; titolo su 2 righe (`line-clamp-2`).

**Risolti (2026-06-11) — icone animate + catalogo Spazi:**
- **Sistema di icone animate** — `src/components/icons/animated.tsx`: 23 icone SVG multi-parte in stile lucide (rotore del ventilatore che gira, raggi+alone della lampadina, fiamma che guizza, equalizer che danza, gancio della serratura che si apre, vapore che sale, stecche della tapparella in movimento, eco dello scudo, REC della camera, occhi del robot che sbattono…). Le parti (`.ai-part`) si animano via CSS **solo** dentro un contesto attivo (`.widget-card-icon-active` sul puck delle card, `.ai-active` altrove); transform/opacity-only, spente in perf-lite/reduced-motion; i sensori passivi (termometro & co.) restano statici di proposito. Drop-in al posto di lucide in `mapEntityToWidgetCard`.
- **Bug card rotante/lampeggiante** — i preset (`widget-anim-fanSpin`, `alarmPulse`…) erano applicati **anche alla shell** della card: un ventilatore attivo ruotava l'intera card di 360°, una serratura sbloccata lampeggiava tutta. Ora i preset vivono solo nel motion-layer; fixato anche il motion-layer (position:absolute dichiarato dopo i preset — quelli con `position:relative` lo collassavano a misura zero e `energyFlow`/`ripple` erano invisibili).
- **Catalogo "Spazi" (zoom-out)** — `SpacesCatalog`: panoramica fullscreen in stile rivista (titolo 44px light, card stanza glass con icona-attività animata, badge temperatura, fatti vivi "3 luci accese · …", strip delle attività in corso, automazioni attive con sparkle se scattate da <1h). Trigger "Spazi" nell'header di RoomsRow; chiusura con X o drag-down elastico dall'header; il tap su una stanza apre l'EntitySheet **sopra** il catalogo (drill-down, non swap).
- **Chip Stanze vive** — `useRoomsOverview` è l'unica fonte per chip e catalogo (aggregati per area: attivi, luci, clima/azione, media in riproduzione, temperatura, attività dominante); le chip mostrano il glifo della stanza (`roomGlyph` in `src/lib/roomIcon.ts`: nome area → Sofa/Bed/CookingPot…) che lascia il posto all'icona animata dell'attività dominante con un pop spring (`ACTIVITY_META` in `roomActivity.ts`).
- **GroupCard luce** — lampadina animata (raggi accesi) quando il gruppo è acceso e non c'è icona custom.
- Verifica: build:all ✅ · lint ✅ · test 40/40 ✅ · smoke test Playwright su kiosk live (chip animata, catalogo, drill-down sheet, geometria delle 23 icone screenshotata) ✅. **Da provare sul tablet reale**: fluidità dei loop su GPU mid-range (perf-lite li spegne già).

**Risolti (2026-06-11, sera) — editor drag&drop first-class + volti conosciuti via Gemini:**
- **Griglia drag&drop senza più localStorage** — `config.kiosk.homeMode: 'composer' | 'grid'` (default composer): selettore in **Funzioni → Kiosk** ("Home del tablet: Auto-composta / Griglia drag & drop"), propagato live al tablet via `GET /api/layout` (la proiezione `tabletHomeLayout` include già `kiosk`). `TabletDashboard` legge dalla config; `localStorage['myhome.home']` resta come override di diagnostica per-dispositivo. L'editor è il `KioskWidgetHome` esistente ("Modifica disposizione" → drag + salva con `layoutVersion`).
- **Clobber del campo `kiosk`/`ai` evitato** — `PUT /api/config` sostituisce gli oggetti per intero: i call-site di Funzioni ora fanno spread (`{ ...config.kiosk, homeMode }`) così wake-sensor e homeMode non si cancellano a vicenda (stesso fix sul toggle `doorbellVision`).
- **Volti conosciuti per Gemini Vision (decisione: NIENTE Frigate/Double-Take)** — l'integrazione on-prem era stata costruita e poi **scartata su richiesta dell'utente** (troppa infrastruttura): rimossi `doubleTake.ts`, la logica nel `DoorbellAlert`, i semafori e la guida. Al loro posto: foto dei familiari caricate in **Funzioni → Campanelli → "Volti conosciuti"** (`config.ai.faces` con tipo condiviso `KnownFace`, max 3 foto a persona, ridotte client-side a ~512px JPEG via `src/lib/faceImage.ts`, **mai proiettate al kiosk** — `tabletHomeLayout` espone solo `doorbellVision`); `/api/ai/recognize` le allega come riferimento multimodale allo snapshot e risponde `{ name, known }`; su match → "C'è Davide alla porta" con pill verde "Davide riconosciuto".
- Verifica: build:all ✅ · lint ✅ · test 40/40 ✅ · smoke Playwright (Funzioni col selettore home e i Volti conosciuti; kiosk in modalità griglia con editor) ✅. **Da provare con HA live:** una suonata vera con una foto caricata.

**Residui noti (non bloccanti):** WebRTC/talk-back via signaling proxy backend; rimozione definitiva della grid legacy (+ kernel + react-grid-layout + `/api/layout` solo-posizioni) dopo validazione del composer sul tablet reale; AI write-back automazioni (roadmap).

---

## 6. Struttura cartelle

```
src/
  api/            # client HTTP/WS: backend.ts, ha-websocket.ts, ha-rest.ts, ha-registry.ts, weather, news, ai
  components/
    layout/       # AppShell, Sidebar, BottomTabBar, StatusBar, RightPanel  (chrome)
    home/         # LayeredHome (kiosk a strati) + layers/* (StatusHeader, NowSection, RoomsRow,
                  # SpacesCatalog, EntitySheet, TimelineSheet, EnergyCard, AmbientLayer, DuskLayer)
                  # + widgets/* (grid legacy)
    icons/        # animated.tsx — icone SVG animate multi-parte (CSS: sez. "Animated icons" in index.css)
    widgets/      # CARD ENTITÀ: WidgetCardFactory (dispatch) + WidgetCardBase (shell/primitive)
                  # + utils/mapEntityToWidgetCard (design per famiglia) + utils/stateLabel (stati in italiano)
    contextual/   # pannello on-demand (ClimateDetail, LightDetail, MediaDetail, AlarmDetail)
    glass/        # primitive vetro: GlassCard, GlassSheet, RadialDial, DragSlider
    system/       # ConnectionOverlay (HA-down), DoorbellAlert (campanello fullscreen)
    anim/ charts/ ai/ live/ news/ weather/ notifications/ ui/ entities/
  hooks/          # useDiscoveredEntities, useAreas, useConfigSync, useAutoTheme, useAmbientNightMode,
                  # useWakeLock, usePerfMode, useHAService, useTabletLayout, …
  store/          # Zustand: entities.ts (stato HA), ui.ts (vista/selezione), theme.ts, doorbellEvents.ts
  design/         # tokens.ts (colore/raggio/spring), typography.ts (scala tipografica)
  config/         # rooms.ts, doorbell.ts
  lib/            # utils puri: alarm, climate, rooms, time, units, sound/SoundManager, lucide
  pages/          # regia desktop: StatusPage, EntitiesPage, FunctionsPage, SystemPage + TabletDashboard (kiosk)
  index.css       # token CSS + glass + griglia + animazioni + dark/kiosk
backend/src/
  app.ts          # montaggio route Hono
  index.ts        # server + static SPA + cache-control
  routes/         # config, layout, rooms, entities, weather, news, ha, ai
  lib/            # home-layout.ts (griglia canonica), ha-config.ts, configEvents.ts (SSE), security.ts
  db/             # client.ts (file/supabase/read-only), types.ts (TIPI CONDIVISI)
api/index.ts      # entrypoint Vercel (riusa app Hono)
docs/             # DESIGN_SYSTEM.md (canon grafico esteso), SMART_FUNCTIONS_ROADMAP.md
ha-addon/         # config.yaml add-on
```

---

## 7. Design system — grafica (canon condensato)

> Esteso e autorevole: `docs/DESIGN_SYSTEM.md`. Qui l'essenziale + le decisioni di consolidamento.

### Filosofia
Il design deve **sparire**: l'interfaccia serve i dispositivi. Vetro chiaro su parchment piatto, tipografia pulita, interazioni fisiche. Ispirazione: Apple Liquid Glass.

### Token (fonte: `src/design/tokens.ts` + `src/index.css`)
- **Canvas:** pagina `#f5f5f7`; card `rgba(255,255,255,0.72)` + `blur(20px) saturate(180%)`; hairline `rgba(0,0,0,0.08)`.
- **Testo (ink ladder):** primario `#1d1d1f` · secondario `rgba(29,29,31,.60)` · terziario `rgba(29,29,31,.42)`.
- **Accento unico interattivo:** Action Blue `#0066cc` (su scuro `#2997ff`). Gradiente AI `#0066cc→#7c3aed` **solo** per il bottone AI.
- **Colori funzionali (solo stato dispositivo):** caldo `#dc2626` · freddo `#0066cc` · ok `#15803d` · alert `#c2410c` · pericolo `#dc2626` · offline `#b45309`.
- **Raggi:** card 18px · inner 11px · sm 8px · pill 999px.
- **Motion:** spring `cubic-bezier(0.32,0.72,0,1)`; durate 140/240/380ms; framer spring stiffness 400 / damping 30.
- **Elevazione:** **nessuna ombra** su card/bottoni. L'elevazione nasce dal vetro su parchment. Glow funzionale solo per clima attivo.

### Tipografia (fonte: `src/design/typography.ts`)
Font: `-apple-system, "SF Pro Display/Text", Inter, system-ui`. Body **17px** (mai 16), line-height 1.47, tracking negativo. Pesi **300/400/600** — il **500 non esiste**.

### Griglia — il composer è la home canonica; la griglia widget è legacy

> **DOMINICA (2026-06-10):** la home kiosk si **auto-compone** (`src/lib/composer.ts`); posizioni e taglie non si persistono più. La "home widget grid" qui sotto resta SOLO come fallback legacy dietro flag, finché non viene rimossa del tutto.

### Griglia — DUE griglie legittime, UN kernel (vedi §5.bis)
Esistono **due griglie legittime e distinte**; la terza (CSS premium S/M/L) è solo un *trattamento visivo*, non una griglia:

1. **Home widget grid (canonica):** modello di `backend/src/lib/home-layout.ts` — **8 colonne**, riga **64px**, taglie `sm 2×2 · md 4×2 · lg 4×4 · wide 8×2`. È ciò che viene **persistito ed editato** (react-grid-layout). È l'unica sorgente per posizioni/taglie dei widget home.
2. **Bento device sections:** card entità auto-scoperte per dominio — `repeat(auto-fill, minmax(150px,1fr))`, riga **112px**, `grid-auto-flow: row dense`. Footprint per tipo in `docs/DESIGN_SYSTEM.md`.
3. **"Premium widget card" (CSS, `.widget-card-shell`):** **solo estetica** (gradienti/gloss/glow/animazioni). Le sue taglie `S/M/L` **devono mappare** su `sm/md/lg/wide`, non introdurre una terza geometria. → da allineare in Fase 2.

> Regola: quando aggiungi/modifichi un widget home, le **dimensioni** vengono da `HOME_SIZE_WH` (home-layout.ts). Il CSS premium può cambiare *aspetto* ma non *footprint*.

### Card per dominio (sintesi — dettaglio in DESIGN_SYSTEM.md)
Luce (tap=toggle ottimistico, tint ambra, slider inline se accesa) · Clima (tint rosso/blu per heat/cool, dial radiale nel pannello, MODE+FAN) · Sensore temp (rosso ≥24°C, blu ≤18°C, sparkline 6h) · Serratura (**press-and-hold 900ms**, mai toggle) · Robot · Camera (snapshot→MJPEG→WebRTC, push-to-talk) · Media · Allarme · Switch/Scena (tap immediato, `scale` on press).

**Icone animate (2026-06-11):** ogni famiglia usa l'icona SVG multi-parte di `src/components/icons/animated.tsx`. Regole: le parti si muovono **solo** quando il dispositivo *fa* qualcosa (rotore se il fan gira, equalizer se la musica suona, gancio aperto se sbloccata); **mai loop sui sensori passivi**; transform/opacity-only; tutto spento in perf-lite/reduced-motion. Il contesto di attivazione è la classe (`.widget-card-icon-active`/`.ai-active`), mai prop drilling.

### Pannello contestuale, overlay, modalità
- **Pannello contestuale** aperto **on-demand** (chevron/click su card): controlli specifici per tipo. Su desktop pannello dx (spring `x:16→0`); su mobile/kiosk → `GlassSheet` centrato/bottom.
- **HA-down** (`ConnectionOverlay`): overlay frosted, `WifiOff` pulse, "Riprova adesso", grace **2s**, auto-chiusura su reconnect.
- **Campanello** (`DoorbellAlert`): fullscreen nero, stream WebRTC→MJPEG, auto-dismiss 60s, talk-back se disponibile.
- **Night mode** (`useAmbientNightMode`): `AmbientLightSensor` (lux<10 notte / >25 giorno, isteresi), fallback orologio 21:00–07:00; scrim `rgba(8,6,20,.46)` `mix-blend-mode: multiply` (abbassa luminosità, non inverte).
- **Kiosk:** idle dimming dopo 180s, anti-burn-in (`kiosk-burnin-shift`), niente pinch-zoom, wake lock.
- **Perf mode** (`perf-lite`): su GPU deboli / `prefers-reduced-transparency` disattiva blur e animazioni ambient (sostituite da superficie frosted solida).

### Interazioni
Tap = azione primaria · Press = `scale(0.985–0.95)` · Long-press = sblocco serrature · Click card clima/luce = pannello contestuale. **Tutte** le azioni HA sono **ottimistiche** con rollback.

### Regole "DA NON FARE"
❌ Gradienti decorativi di sfondo (solo parchment `#f5f5f7`) · ❌ Ombre su card/bottoni (solo glow funzionale clima) · ❌ Secondo colore brand · ❌ Peso 500 · ❌ Toggle per serrature · ❌ Entità diagnostica/sistema in dashboard (gestione via override admin) · ❌ Chiavi API nel bundle frontend · ❌ Introdurre una quarta geometria di griglia.

---

## 8. Convenzioni tecniche (codice)

- **TypeScript ovunque.** Tipi di dominio condivisi in `backend/src/db/types.ts` (riusati lato frontend dove serve). Niente `any` non giustificato.
- **Componenti**: funzionali, named export, un componente per file (eccetto piccoli helper colocati). Aderire allo stile dei file vicini (densità commenti, naming, idiomi).
- **Stato**: Zustand per stato globale (`entities`, `ui`, `theme`); TanStack Query per dati remoti backend (config, layout, weather, news). Non duplicare lo stato entità HA fuori da `useEntityStore`.
- **Azioni HA**: passare sempre da `callService` (`src/api/ha-websocket.ts`) — gestisce WS/proxy + fallback REST. Applicare `setOptimisticState` prima della chiamata.
- **Hooks**: un hook per responsabilità (`useDiscoveredEntities`, `useAreas`, `useTabletLayout`, `useConfigSync`…). Niente fetch diretti nei componenti se esiste un hook.
- **Styling**: utility Tailwind + classi semantiche in `index.css` (`.glass`, `.lg-slider`, `.widget-card-shell`…). Colori e raggi **solo** dai token, mai hex hard-coded in JSX (eccetto i pochi già normati nel design system).
- **Animazioni**: solo `transform`/`opacity`. Mai animare un elemento con `backdrop-filter` (re-render del blur per frame). Rispettare `prefers-reduced-motion` e `perf-lite`.
- **Error boundaries**: i widget montano dentro `WidgetErrorBoundary` — un widget rotto non deve far cadere la dashboard.
- **Lazy load** delle viste pesanti (es. `SettingsPage`).
- **Niente nuove dipendenze** senza necessità reale; preferire ciò che è già nel `package.json`.

---

## 9. Flusso dati

```
Home Assistant ──WS subscribeEntities──▶ useEntityStore ──▶ componenti (selettori)
       ▲                                      ▲
       │  callService (ottimistico)           │ setOptimisticState → rollback se errore
       └───────────────  azioni utente ───────┘

Backend (config/layout) ──SSE /api/config/stream──▶ useConfigSync ──▶ refetch (TanStack Query)
   un edit su un device propaga a TUTTI i client in tempo reale
```

- **Optimistic update**: `setOptimisticState(entityId, state, attrs)` immediato; se `callService` fallisce, lo stato reale di HA riallinea al prossimo evento (o si forza rollback).
- **Config globale**: ogni modifica admin chiama `emitConfigChange()` → SSE → ogni client refetcha. Niente polling.
- **Layout home**: salvataggi con `layoutVersion` (concorrenza ottimistica); conflitto → 409 con lo stato corrente.

---

## 10. Sicurezza

- Segreti **solo backend**, senza `VITE_`. Il bundle frontend non deve contenere chiavi.
- Token HA mascherato (`***`) in `/api/config`. ✅ **Chiuso (M0, 2026-06-10):** il token non viene consegnato al browser su **nessun** percorso — desktop e kiosk passano dal bridge backend (SSE + proxy servizi); `/api/config/ha-credentials` non esiste più (resta solo nell'export/backup, desktop-only).
- Route admin/config protette da `desktopOnly` (`backend/src/lib/security.ts`); il pannello backend è raggiungibile solo da desktop.
- Credenziali da env sono **locked** e non sovrascrivibili dall'UI (`ha-config.ts`).
- CORS backend su `/api/*` limitato ai metodi/headers necessari (`X-MyHome-Client`).

---

## 11. Definition of Done (checklist)

- [ ] `npm run build:all` verde (frontend + backend).
- [ ] `npm run lint` senza nuovi errori.
- [ ] Provato su **kiosk** (touch, ≥44px, no hover-only) **e** desktop.
- [ ] Azioni HA ottimistiche con rollback verificato.
- [ ] Nessun hex/raggio hard-coded fuori dai token; nessuna quarta griglia.
- [ ] Nessun segreto nel bundle frontend.
- [ ] Animazioni solo `transform`/`opacity`; rispettano reduced-motion / perf-lite.
- [ ] Se cambia la griglia/widget: aggiornato `home-layout.ts` **e** `docs/DESIGN_SYSTEM.md` **e** questo file.

---

## 12. Roadmap funzioni smart

Vedi `docs/SMART_FUNCTIONS_ROADMAP.md`: campanello (✅, two-way audio 🔜 via signaling proxy), riconoscimento per nome via Gemini Vision + volti di riferimento (✅ — foto in Funzioni→Campanelli→Volti conosciuti; Frigate/Double-Take scartato deliberatamente), AI write-back automazioni (🔜), dashboard per-area dal registry HA (✅ chip Stanze, DOMINICA M1), presence wake (✅ M7), home auto-composta (✅ M1 — sostituisce i widget riordinabili), timeline di casa (✅ M4), suggerimenti azionabili (✅ M6), energia onesta (✅ M5), Web Push per alert in background (🔜).

---

*Quando aggiorni l'architettura o il design, aggiorna QUESTO file per primo, poi `docs/DESIGN_SYSTEM.md`. È la fonte di verità della ristrutturazione.*
