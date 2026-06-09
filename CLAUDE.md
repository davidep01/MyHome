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
| **Desktop / Admin** | Browser desktop | `DesktopShell` | Configurazione, gestione entità, AI, impostazioni |

La home si **auto-configura** dallo stream live di HA (entità raggruppate per dominio/area). Zero setup manuale per l'utente finale.

**Funzioni distintive:** campanello → alert video fullscreen, night mode da sensore di luce ambientale, AI (Gemini) grounded sulle entità reali, widget home riordinabili e persistiti, resilienza HA-down con overlay e reconnect.

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
**Variabili dev** principali: `VITE_HA_URL`, `VITE_BACKEND_URL`. Backend: `HA_URL`/`HA_TOKEN`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `OPENWEATHER_API_KEY`, `GEMINI_API_KEY`, `MYHOME_DB_PATH`, `MYHOME_READ_ONLY`.

---

## 4. Architettura attuale (mappa)

### 4.1 Shell e routing
`AppShell` (`src/components/layout/AppShell.tsx`) sceglie la shell dal **pathname**:
- `/kiosk`, `/tablet`, `/dashboard` **oppure** non-desktop → `KioskShell` (→ `TabletDashboard`).
- `/backend`, `/admin`, `/settings` su desktop → `DesktopShell`.
- Dentro `DesktopShell` la vista attiva (`useUIStore().activeView`) è **sincronizzata bidirezionalmente con l'URL** (`useViewRouting` in `AppShell.tsx` + `VIEW_PATHS`/`viewFromPath` in `src/store/ui.ts`): deep-link (`/lights`, `/climate`, …), back/forward e refresh funzionano. Nessun router library (scelta deliberata).

> ✅ **Risolto (P6, 2026-06-09):** routing ibrido chiuso con il sync URL↔store di cui sopra. Le viste desktop sono inoltre **lazy** (un chunk per pagina) e `hls.js` è caricato on-demand solo quando parte uno stream.

### 4.2 Connessione a Home Assistant (`src/api/ha-websocket.ts`)
Due percorsi distinti:
- **WebSocket diretto** (`connectHA`) — desktop. Token long-lived recuperato dal backend (`/api/config/ha-credentials`) e usato in browser. Real-time via `subscribeEntities`. Reconnect con backoff (max 30s). Fallback REST su `callService` in errore.
- **REST polling proxy** (`connectHAProxy`) — kiosk. Poll ogni **4s** (`/api/ha/states`), nessun real-time. `callService` instrada via backend.

Stato entità in `useEntityStore` (Zustand). Update ottimistici via `setOptimisticState` / `patchEntity`.

> ✅ **Risolto (Fase 5):** il kiosk usa ora il **backend HA stream** (`GET /api/ha/stream`, SSE, token server-side) con **fallback automatico** al poll REST. Il blocco qui sotto resta valido: il poll proxy è ora il fallback, non il percorso primario. Vedi §5 P3–P4 e *Stato implementazione*.

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

**Residui noti (non bloccanti):** migrazione del *desktop* allo stream backend (P4 lato admin) — opzionale; split di `SettingsPage` (1.053 righe) in file per sezione (A2); modalità ambient su idle kiosk (B4).

---

## 6. Struttura cartelle

```
src/
  api/            # client HTTP/WS: backend.ts, ha-websocket.ts, ha-rest.ts, ha-registry.ts, weather, news, ai
  components/
    layout/       # AppShell, Sidebar, BottomTabBar, StatusBar, RightPanel  (chrome)
    home/         # home desktop + home/widgets/* (widget home, picker, catalog)
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
  pages/          # viste desktop: Areas, Lights, Climate, Security, Energy, Cameras, Media, System, Settings, …
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

### Griglia — DUE griglie legittime, UN kernel (vedi §5.bis)
Esistono **due griglie legittime e distinte**; la terza (CSS premium S/M/L) è solo un *trattamento visivo*, non una griglia:

1. **Home widget grid (canonica):** modello di `backend/src/lib/home-layout.ts` — **8 colonne**, riga **64px**, taglie `sm 2×2 · md 4×2 · lg 4×4 · wide 8×2`. È ciò che viene **persistito ed editato** (react-grid-layout). È l'unica sorgente per posizioni/taglie dei widget home.
2. **Bento device sections:** card entità auto-scoperte per dominio — `repeat(auto-fill, minmax(150px,1fr))`, riga **112px**, `grid-auto-flow: row dense`. Footprint per tipo in `docs/DESIGN_SYSTEM.md`.
3. **"Premium widget card" (CSS, `.widget-card-shell`):** **solo estetica** (gradienti/gloss/glow/animazioni). Le sue taglie `S/M/L` **devono mappare** su `sm/md/lg/wide`, non introdurre una terza geometria. → da allineare in Fase 2.

> Regola: quando aggiungi/modifichi un widget home, le **dimensioni** vengono da `HOME_SIZE_WH` (home-layout.ts). Il CSS premium può cambiare *aspetto* ma non *footprint*.

### Card per dominio (sintesi — dettaglio in DESIGN_SYSTEM.md)
Luce (tap=toggle ottimistico, tint ambra, slider inline se accesa) · Clima (tint rosso/blu per heat/cool, dial radiale nel pannello, MODE+FAN) · Sensore temp (rosso ≥24°C, blu ≤18°C, sparkline 6h) · Serratura (**press-and-hold 900ms**, mai toggle) · Robot · Camera (snapshot→MJPEG→WebRTC, push-to-talk) · Media · Allarme · Switch/Scena (tap immediato, `scale` on press).

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
- Token HA mascherato (`***`) in `/api/config`. Obiettivo target (P6/Fase 6): **non** consegnare il token al browser neanche sul percorso desktop — instradare tutto via proxy backend.
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

Vedi `docs/SMART_FUNCTIONS_ROADMAP.md`: campanello (✅, two-way audio 🔜), riconoscimento volti via Frigate/Double-Take on-prem (🟡), AI write-back automazioni (🔜), dashboard per-area dal registry HA (🟡), presence wake / sensori tablet (🔜), widget utente riordinabili (✅, più tipi 🔜), Web Push per alert in background (🔜).

---

*Quando aggiorni l'architettura o il design, aggiorna QUESTO file per primo, poi `docs/DESIGN_SYSTEM.md`. È la fonte di verità della ristrutturazione.*
