# MyHome — Design System

**MyHome** is a **domotica (smart-home) dashboard** built on top of **Home Assistant**.
It runs as a PWA on phones, tablets and — its signature surface — an always-on **wall
tablet**. The whole UI **auto-configures** from the live Home Assistant WebSocket stream:
it discovers entities, groups them by domain/area, and lays them out as a bento grid of
glass cards. Zero manual setup. The interface language is **Italian**.

> **Design philosophy (from the spec):** *"Il design deve sparire: l'interfaccia serve i
> dispositivi, non si mette in mostra."* — the design must disappear; the interface
> serves the devices, it doesn't show off. Primary inspiration: **Apple "Liquid Glass"**
> — clear surfaces, clean typography, physical interactions.

---

## ⚠️ Read this first — light vs. dark (open question for the owner)

There is a **conflict between the two source materials** the owner provided, and it
decides the whole look of the system:

- **`DESIGN_SYSTEM.md` (the written spec, v1.0)** describes a **LIGHT "Liquid Glass"**
  system: parchment canvas `#f5f5f7`, **white** frosted-glass cards, and it *explicitly
  forbids* "gradienti decorativi come sfondo (solo parchment piatto `#f5f5f7`)".
- **`a.jpg` (the screenshot)** shows a **DARK**, gradient-background dashboard with
  translucent dark-glass cards.

This design system is built to the **written spec (light Liquid Glass)**, because the
spec is the authoritative, versioned source and my brief is to encode the *design system*,
not a single screenshot — but the screenshot's **layout, components, Italian copy and
device set are treated as ground truth** (rail → bento → contextual panel, the exact
scenes, rooms and devices all come from it).

> **❓ Owner: which is correct — the light spec, or the dark screenshot?** If the dark
> theme is the real target, this is a fast change (it's the same components on inverted
> surfaces + a glow palette), but I need you to confirm before I invert everything. See
> the closing note.

---

## Sources

**Provided by the owner (authoritative):**
- `DESIGN_SYSTEM.md` — the full written design system (palette, type, spacing, radii,
  layout, per-device card specs, overlays, interactions, AI, PWA). *Source of truth for
  tokens & rules.*
- `SMART_FUNCTIONS_ROADMAP.md` — feature roadmap (doorbell→fullscreen, Frigate face
  recognition, Gemini AI automations, per-area dashboards, sensor-driven UX). *Source of
  truth for product scope.*
- `a.jpg` — screenshot of the running dashboard. *Source of truth for layout & content.*
- Codebase references named in the spec (not provided here, but cited): `src/design/tokens.ts`,
  `src/components/home/SectionBand.tsx`, `src/components/widgets/*`,
  `src/components/contextual/ClimateDetail.tsx`, etc.

**Design lineage (reference analyses, for deeper context):**
- **Apple** — `https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/apple`
  → the **primary** lineage. MyHome's tokens are nearly identical: Action Blue `#0066cc`,
  parchment `#f5f5f7`, ink `#1d1d1f`, the single product-shadow `rgba(0,0,0,0.22) 3px 5px
  30px`, body at 17px, the 300/400/600 weight ladder, negative "Apple-tight" tracking.
- **Lovable** — `https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/lovable`
  → secondary: the *physical / tactile* feel of glass and press states.
- **Tesla** — `https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/tesla`
  → secondary: radical subtraction, one accent, content carries the weight.

> Open the three repos above to design even more faithfully against the lineage MyHome
> draws from — Apple in particular.

---

## CONTENT FUNDAMENTALS — how MyHome writes

The UI is **in Italian**, in a calm, factual, functional register. The words get out of
the way so the devices and their state are what you read.

**Language & person**
- **Italian, always.** Greetings, labels, statuses, AI replies. ("Buon pomeriggio,
  Mattia!", "Speaker in pausa", "Tieni premuto per aprire".)
- **Status-first, present tense.** Lead with the device state, then the control:
  `Cucina · Accesa · 40%`, `Finestra · Aperta 70%`, `Robot · In Carica`. The *state* is
  the headline; the verb is the option.
- **No personality / no "io".** MyHome is infrastructure, not an assistant persona. The
  AI (Gemini) is the one place it "speaks" — and even there: *conciso e pratico*, only
  about entities that actually exist, never inventing devices.

**Casing & mechanics**
- **Sentence case** for everything readable. Device & scene names use the **Home
  Assistant friendly_name verbatim** ("Termostufa Integrata", "Luce Camera Mattia",
  "Angolo Giardino") — never re-styled.
- **Tiny ALL-CAPS labels** are allowed *only* for the contextual-panel section eyebrows
  (`MODE`, `FAN MODE`) and forecast day chips (`OGGI`, `SAB`, `DOM`, `LUN`).
- **Real units, tight.** `24°`, `67.0 °C`, `100% Batt.`, `45 m²`, `32 min`, `Pioggia 100%`.
- **Time is human.** "Just now" style relatives where possible; forecast uses day
  abbreviations.

**Scene & device naming (from the screenshot)**
- Scenes read like life, not config: **Music, Going out, Night, Movie, Morning, Arrive**
  (the running build mixes English scene names with Italian chrome — keep whatever the HA
  scene is actually named).
- Sections are domains/areas: **Cucina, Videocamere, Serrature, Preferiti** (and area
  views like *Piscina*, *Locale Termico*).
- Press-and-hold locks always say **"Tieni premuto per aprire"**. Offline cameras show
  **"Immagine non disponibile"** + an **Offline** badge.

**Don'ts**
- ❌ No emoji in the UI. (The spec uses emoji only as *documentation* markers.)
- ❌ No vanity metrics. Show a number only if it's a real device value the person can act
  on or feel.
- ❌ Don't rename HA entities for style — fidelity to the home's own vocabulary matters.

---

## VISUAL FOUNDATIONS

Full token set: **`colors_and_type.css`**. This section is the *why*.

### Surfaces & light ("Liquid Glass")
- **Parchment canvas, never pure white.** `--canvas-page #f5f5f7` is the ground for the
  whole app. Flat — **no decorative gradient** (the one exception is the rail's AI button).
- **Every card is frosted glass.** `--canvas-card` = `rgba(255,255,255,0.72)` +
  `backdrop-filter: saturate(180%) blur(20px)` + a `1px` hairline `rgba(0,0,0,0.08)`.
  Hover lifts opacity to `0.88`. Use the `.glass` helper.
- **Elevation comes from the glass, not shadows.** **No box-shadows on cards or buttons.**
  Depth is the glass-over-parchment contrast + the blur. Exactly **two** shadow-like
  effects exist: the single **product-shadow** (`3px 5px 30px rgba(0,0,0,0.22)`) reserved
  for product images / video stills, and functional **glows** on *active* climate/light
  tiles.

### Color
- **One interactive accent: Action Blue `#0066cc`.** Every CTA, focus ring, link, and the
  AI feature use it. There is **no second brand color**. On dark overlays it brightens to
  `#2997ff`.
- **Functional colors are for device STATE only** — never decoration:
  `--hot-red #dc2626` (heating / ≥24°), `--cold-blue #0066cc` (cooling / ≤18°),
  `--ok-green #15803d` (OK, lock open, stable), `--alert-orange #c2410c` (low battery,
  non-critical), `--danger-red #dc2626` (alarm, critical). Each has a soft **tint** for
  active-card backgrounds (e.g. heating tile → 12% red tint + red glow).
- **Lights** that are on tint **amber** `rgba(234,179,8,0.10)` with a yellow glow.

### Type
- **SF Pro** on Apple platforms (system-resolved), **Inter** as the documented fallback.
- **Body is 17px** (not 16) at line-height **1.47** — the Apple "reading pace".
- **Weights 300 / 400 / 600 only — 500 does not exist** in the system. Titles 600, body
  400, the rare large read-out 300.
- **Negative tracking on titles** (−0.224 → −0.374px) for the "Apple-tight" cadence.
- **Read-outs are tabular.** Temperatures, %, kW, m² use `font-variant-numeric:
  tabular-nums` so values don't jitter as they update.

### Shape & space
- **8px grid.** Card padding 16–24px; `--section-gap 20px` between bands.
- **Radii:** card **18px** (`--radius-card`), inner elements **11px**, utility/chip 8px,
  pill 999px (CTAs, search, badges, toggles).

### Motion (Apple-physical)
- **Press = `scale(0.95)`** — the universal micro-interaction (`.press` helper).
- **Spring/settle easing** `cubic-bezier(0.32,0.72,0,1)`; durations 140 / 240 / 380ms.
- **Optimistic state:** every action to HA updates the UI instantly and rolls back if HA
  errors. Contextual panel enters with `x:16→0, opacity:0→1`.
- **Long-press to unlock** locks (900ms) with an animated SVG progress ring — never a
  toggle.

### Layout — three columns
```
┌──────┬──────────────────────────────────┬──────────┐
│ RAIL │  Header: greeting + 4-day weather │ CONTEXT  │
│ 68px │  SceneRow (6 circular scenes)     │ PANEL    │
│ icons│  ── bento grid ──────────────────  │ 320px    │
│ only │  SectionBands by domain / area    │ on-demand│
└──────┴──────────────────────────────────┴──────────┘
```
- **Bento grid:** `grid-template-columns: repeat(auto-fill, minmax(150px,1fr));
  grid-auto-rows: 112px; grid-auto-flow: row dense;` — `dense` packs tiles with no holes.
- **Footprints by device:** Camera 2×3 · Media 2×2 · Climate 2×2 · Alarm 2×1 ·
  Light/Robot/Lock/Blind 1×2 · Switch/Scene/Sensor 1×1.
- **Responsive:** Mobile (<768px) → bottom tab bar + fullscreen bottom-sheet panel;
  Tablet (768–1024) → rail + main, panel as bottom sheet; Desktop (>1024) → all three
  columns, panel pinned right.

---

## ICONOGRAPHY

MyHome uses **Lucide** (https://lucide.dev) — `lucide-react` in the app, loadable from CDN
for static mocks. The screenshot's device glyphs (lamp, thermometer, lock, camera,
shield, battery, etc.) are Lucide.

- **Why Lucide:** one even **~2px stroke**, rounded caps/joins — quiet, technical, and it
  covers the entire HA device domain: `lamp`, `lightbulb`, `thermometer-sun`, `snowflake`,
  `lock` / `lock-open`, `shield`, `video` / `camera`, `bot`, `blinds`, `plug-zap`,
  `battery`, `droplets`, `wind`, `sun`, `moon`, `cloud-rain`, `wifi-off`, `bell`, `sparkles`
  (the AI ✦), `home`, `layout-grid`, `settings`.
- **Stroke by default; color by state.** Icons render in `--ink` (or `--ink-secondary`
  when secondary). When a device is **active**, the icon takes its state color (a heating
  thermostat → `--hot-red`, a lit light → amber, an open lock → `--ok-green`).
- **Sizes:** 20px in tiles/rows, 24px for tile headers / rail, 16px inline. Never below
  16px. Touch targets stay ≥ 44×44px even when the glyph is small.
- **CDN usage for mocks:**
  ```html
  <script src="https://unpkg.com/lucide@latest"></script>
  <i data-lucide="thermometer-sun"></i>
  <script>lucide.createIcons();</script>
  ```
- **No emoji, no Unicode pictographs as UI icons.** `°`, `·`, `›` are fine as *typography*.
- **Brand mark:** `assets/logo-mark.svg` (a house with a "lit" Action-Blue window) and
  `assets/app-icon.svg` (the rounded-square PWA/rail icon). The connection **dot** beside
  the rail avatar is green / orange / red for HA connected / reconnecting / down.

> **Note:** Lucide is a deliberate, production choice (it's what the app ships), not a
> fallback substitution.

---

## Index / manifest

| Path | What it is |
|---|---|
| `README.md` | This file — context, content & visual foundations, iconography, sources |
| `colors_and_type.css` | All design tokens (color, glass, type scale, radius, spacing, motion) + `.glass` / `.t-*` / `.press` helpers |
| `SKILL.md` | Agent-Skill front-matter so this system can be used in Claude Code |
| `fonts/README.md` | Font strategy (SF Pro system + Inter fallback) |
| `assets/` | `logo-mark.svg`, `app-icon.svg` (brand) |
| `preview/` | Design-system specimen cards (rendered in the Design System tab) |
| `ui_kits/dashboard/` | The MyHome dashboard UI kit — `index.html` (interactive) + JSX components |

*(Built incrementally — see `ui_kits/dashboard/README.md` for the component list.)*
