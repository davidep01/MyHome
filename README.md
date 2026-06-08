# MyHome

Dashboard domotica personale per **Home Assistant**, estetica Apple "Liquid Glass".
Pensata per un **tablet a muro** (Fully Kiosk / Android) con un pannello **desktop** di amministrazione. La home si auto-configura dallo stream live di HA.

> 📐 Linee guida grafiche e tecniche complete: **[CLAUDE.md](CLAUDE.md)** (sorgente di verità) e **[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)** (design system esteso).

## Stack

- **Frontend** — React 19 · Vite 8 · TypeScript · Tailwind 4 · Zustand · TanStack Query · Framer Motion · react-grid-layout · `home-assistant-js-websocket`
- **Backend** — Hono (Node) · serve l'API JSON **e** la SPA buildata · persistenza file / Supabase / read-only
- **Deploy** — Add-on Home Assistant (Docker) **e** Vercel

## Sviluppo

```bash
npm install
npm install --prefix backend

npm run dev:all     # backend :3001 + frontend :5173 insieme
# oppure separati:
npm run dev                     # solo frontend
npm --prefix backend run dev    # solo backend
```

Il dev server proxa `/ha` → istanza Home Assistant e `/api` → backend (`vite.config.ts`).

### Variabili d'ambiente

Frontend (dev): `VITE_HA_URL`, `VITE_BACKEND_URL`.
Backend: `HA_URL` / `HA_TOKEN`, `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, `OPENWEATHER_API_KEY`, `GEMINI_API_KEY`, `MYHOME_DB_PATH`, `MYHOME_READ_ONLY`, `MYHOME_HA_POLL_MS`.

> ⚠️ Le chiavi (Gemini, OpenWeather, Supabase service role, token HA) vivono **solo** lato backend — mai con prefisso `VITE_`, mai nel bundle frontend.

## Build

```bash
npm run build:all     # frontend (tsc -b + vite) → dist/  e  backend (tsup) → backend/dist/
npm run lint
```

## Architettura in breve

- **Due shell** — `KioskShell` (tablet, sempre acceso) e `DesktopShell` (admin), scelte in [src/components/layout/AppShell.tsx](src/components/layout/AppShell.tsx).
- **Stato HA** — `useEntityStore` (Zustand). Il desktop apre il WebSocket diretto a HA; il **kiosk** usa il **backend HA stream** (SSE, token lato server) con fallback automatico al polling REST.
- **Home a widget** — kernel di layout unico in [src/lib/homeLayout.ts](src/lib/homeLayout.ts) (allineato a `backend/src/lib/home-layout.ts`); rendering condiviso via [HomeGridCanvas](src/components/home/widgets/HomeGridCanvas.tsx). Posizioni persistite con concorrenza ottimistica (`layoutVersion`).
- **Config live** — modifiche admin propagate a tutti i client via SSE (`/api/config/stream`).

### Flag utili (kiosk)

- `localStorage['myhome.haStream'] = 'off'` → forza il polling REST invece dello stream SSE (diagnostica).

## Deploy

- **Add-on HA** — immagine `ghcr.io/davidep01/myhome`; il Supervisor passa le opzioni via `/data/options.json` (vedi `run.sh`, `ha-addon/config.yaml`). Persistenza su `/data`.
- **Vercel** — `api/index.ts` riusa l'app Hono; `vercel.json` instrada `/api/*` alla funzione e il resto alla SPA. Persistenza via Supabase (o read-only).
