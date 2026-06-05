# MyHome — Smart Functions Roadmap (deploy-later schema)

Status legend: ✅ done · 🟡 scaffolded (hook/config present, needs wiring) · 🔜 to deploy

## 1. Doorbell → fullscreen video alert ✅
- **Done:** `useDoorbell` (rising-edge detection on a binary_sensor/event) + `DoorbellAlert` fullscreen overlay with live MJPEG stream (`/api/ha/camera-stream/:id`) and snapshot fallback.
- **Config:** `src/config/doorbell.ts` → set `doorbellEntityId` + `cameraEntityId`.
- **🔜 Next:** two-way audio (WebRTC/go2rtc), inline "Apri porta" calling `lock.unlock`, push notification when app backgrounded.

## 2. AI recognition in video streams 🟡 → 🔜
Goal: when the doorbell rings, recognize the person and announce "C'è **X** alla porta".
- **Recommended architecture (HA-native, on-prem):**
  - Run **Frigate** (or **CompreFace**/**Double Take**) as an HA add-on for object + face detection on the camera RTSP feed.
  - Train faces in Double Take/CompreFace (upload labelled photos of family members).
  - Frigate publishes events → HA creates `sensor.frigate_<camera>_person` / `image.*` + an event with the recognized `sub_label` (name).
  - MyHome listens (already on the WS stream) to that entity; `DoorbellAlert` shows the name instead of the "in arrivo" placeholder.
- **Frontend hook (to add):** `useFaceRecognition(cameraEntityId)` → reads the Frigate/Double-Take entity attributes (`sub_label`, `score`) and returns `{ name, confidence }`.
- **Cloud alternative:** capture a snapshot on ring → POST to a vision model (Gemini supports image input) → "chi è questa persona tra {famiglia}?". Lower accuracy, no training; usable as fallback.
- **Privacy:** keep recognition on-prem (Frigate) by default; never send family faces to the cloud without explicit opt-in.

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
- [ ] Frigate/Double-Take add-on + labelled face training
- [ ] `doorbell.ts` pointed at real doorbell + camera entities
- [ ] AI automation write-back endpoint + confirmation UI
- [ ] Area-registry fetch → dynamic area dashboards
- [ ] Web Push (VAPID) for background alerts
- [ ] HTTPS + stable hostname for the tablet (PWA install + camera autoplay)
