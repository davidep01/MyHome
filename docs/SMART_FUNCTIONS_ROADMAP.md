# MyHome — Smart Functions Roadmap (deploy-later schema)

Status legend: ✅ done · 🟡 scaffolded (hook/config present, needs wiring) · 🔜 to deploy

## 1. Doorbell → fullscreen video alert ✅
- **Done:** `useDoorbell` (rising-edge detection on a binary_sensor/event) + `DoorbellAlert` fullscreen overlay with live MJPEG stream (`/api/ha/camera-stream/:id`) and snapshot fallback.
- **Config:** `src/config/doorbell.ts` → set `doorbellEntityId` + `cameraEntityId`.
- **🔜 Next:** two-way audio (WebRTC/go2rtc), inline "Apri porta" calling `lock.unlock`, push notification when app backgrounded.

## 2. AI recognition in video streams ✅ (Gemini Vision + volti di riferimento, 2026-06-11)
Goal: when the doorbell rings, recognize the person and announce "C'è **X** alla porta".
- **Done:** `/api/ai/recognize` (Gemini Vision sullo snapshot via proxy HA, funziona anche dal kiosk) con **volti di riferimento**: le foto dei familiari si caricano in **Funzioni → Campanelli → "Volti conosciuti"** (max 3 a persona, ridotte client-side a ~512px JPEG, salvate in `config.ai.faces`, mai proiettate al kiosk). Al ring il backend le allega alla richiesta multimodale e Gemini risponde col nome esatto → `{ name, known: true }` → pill verde "X riconosciuto" nel `DoorbellAlert`. Fallback: descrizione generica ("un corriere") → avviso generico. Toggle on/off in Funzioni.
- **Scartato (scelta deliberata, 2026-06-11):** Frigate + CompreFace + Double-Take on-prem — era stato implementato (auto-discovery dei sensori `double_take_*`) e poi rimosso su richiesta: troppa infrastruttura per il valore; Gemini con foto di riferimento copre il caso d'uso senza container aggiuntivi.
- **Privacy:** le foto di riferimento e lo snapshot passano a Gemini (cloud) solo al momento della suonata e solo se `doorbellVision` è attivo.

## 3. AI engine for proactive automations ✅ (core) → 🔜 (write-back)
- **Done:** `/api/ai/chat` + `/api/ai/suggest` (Gemini, grounded on live entity context); `AIAssistant` UI.
- **🔜 Next:** let the AI **create** HA automations — add `/api/ai/automation` returning a validated HA automation YAML/JSON; preview in UI; on confirm, POST to HA `config/automation/config`. Add a nightly "proactive digest" (cron → `suggest` → notification).

## 4. Auto-configuring dedicated dashboards 🟡 → 🔜
- **Done:** home auto-discovers entities from the live HA stream grouped by domain (`useDiscoveredEntities`).
- **🔜 Next:** **per-area views** (Piscina, Locale Termico, …) generated from the HA **area registry**:
  - Fetch areas via WS (`config/area_registry/list`) + entity↔area map (`config/entity_registry/list`).
  - Build a view per area, auto-laying out its entities; expose as dynamic routes/tabs.
  - Specialized templates by area name keyword (pool → temp/pump/ph; technical room → boiler/UPS/power).

## 5. Sensor-driven UX (Android wall tablet) ✅ / 🔜
- **Done:** night mode via **AmbientLightSensor** (`useAmbientNightMode`) with clock fallback + dimming scrim.
- **🔜 Next:** presence wake (proximity/camera motion → wake screen, raise brightness), accelerometer to detect tablet pickup, battery/charging awareness, keep-awake via Wake Lock API.

## 6. Modular widgets ✅ / 🔜
- **Done:** UPS battery (sparkline), weather, people, sensors.
- **🔜 Next:** user-customizable widget grid (drag-reorder, persisted to backend), more widget types (energy live, network, calendar).

## 7. Resilience & PWA ✅
- **Done:** HA-down fullscreen overlay auto-dismissing on reconnect (`ConnectionOverlay`); WS auto-reconnect with backoff; installable PWA (manifest + icons + service worker, offline shell).
- **🔜 Next:** offline cache of last-known states; background push (Web Push) for doorbell/alarms when app closed.

## Deployment checklist
- [x] Volti di riferimento per il campanello (Funzioni → Campanelli → Volti conosciuti)
- [ ] `doorbell.ts` pointed at real doorbell + camera entities
- [ ] AI automation write-back endpoint + confirmation UI
- [ ] Area-registry fetch → dynamic area dashboards
- [ ] Web Push (VAPID) for background alerts
- [ ] HTTPS + stable hostname for the tablet (PWA install + camera autoplay)
