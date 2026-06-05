# MyHome — Dashboard UI kit

A pixel-faithful, interactive recreation of the MyHome domotica dashboard, built to the
written `DESIGN_SYSTEM.md` (light Apple "Liquid Glass"). All data is mock, shaped like
Home Assistant entities; actions update optimistically.

## Run
Open `index.html`. Needs network (React, Babel & Lucide from CDN).

## Layout
Three columns: **Rail** (68px icon nav) · **Main** (greeting + weather, scene row, bento
`SectionBand`s) · **Contextual panel** (320px, slides in when you open a climate or light
tile; shows weather by default). Collapses to rail + main under 1024px.

## Components
| File | Exports |
|---|---|
| `icon.jsx` | `Icon` (Lucide wrapper), `Chevron` |
| `rail.jsx` | `Rail`, `HomeHeader`, `SceneRow`, `PeopleCard` |
| `cards.jsx` | `SectionBand`, `Slider`, `Sparkline`, `LightCard`, `ClimateCard`, `SensorCard`, `LockCard`, `RobotCard`, `CameraCard`, `AlarmCard`, `SwitchCard`, `BlindCard` |
| `panel.jsx` | `ClimateDetail` (dial + mode + fan), `LightDetail` (brightness + presets), `WeatherPanel` |
| `overlays.jsx` | `DoorbellOverlay`, `AIAssistant`, `ConnectionLost` |
| `app.jsx` | `App` — device state, optimistic updates, panel/overlay routing |

## Try
- Toggle a light → tile glows amber; open it → brightness + presets in the panel.
- Open a climate tile → dial with mode (Riscalda/Raffredda/Spento) + fan in the panel.
- **Long-press** a lock (~0.9s) → progress ring fills, then unlocks.
- Tap a sensor's sparkline, arm/disarm the alarm, drag a blind/brightness slider.
- Floating blue bell (bottom-right) → fullscreen **doorbell** takeover.
- Rail ✦ → **AI assistant** sheet (Gemini, Italian, suggested actions).

## Known shortcuts
Mock state only (no real HA WebSocket); camera feeds are placeholders ("Immagine non
disponibile" / Offline, per the real build); responsive mobile bottom-sheet not built
(documented in the root README).
