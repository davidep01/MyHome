---
name: myhome-design
description: Use this skill to generate well-branded interfaces and assets for MyHome, a Home-Assistant smart-home dashboard, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

MyHome is an **Apple "Liquid Glass"** smart-home dashboard (Italian UI) built on Home
Assistant: a parchment `#f5f5f7` canvas, **white frosted-glass cards**, a **single**
Action-Blue `#0066cc` accent, and functional state colors used **only** for device
status. Body is 17px; weights are 300/400/600 (never 500); press = `scale(0.95)`.

Start here:
- `colors_and_type.css` — all tokens (color, `.glass`, type scale, radius, spacing,
  motion) + `.t-*` / `.press` helpers. Import it; don't redefine values.
- `README.md` — content voice (Italian, status-first), visual foundations, iconography
  (**Lucide**, CDN), and the **light-vs-dark open question** (read it before theming).
- `ui_kits/dashboard/` — the dashboard UI kit. `index.html` is an interactive build;
  `rail.jsx` / `cards.jsx` / `panel.jsx` / `overlays.jsx` are reusable React components
  (rail, bento device tiles, contextual panel, doorbell/AI/connection overlays).
- `assets/` — `logo-mark.svg`, `app-icon.svg`.
- `preview/` — specimen cards documenting each token group.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and
create static HTML files for the user to view. If working on production code, copy assets
and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without other guidance, ask what they want to build,
ask a few focused questions, and act as an expert designer who outputs HTML artifacts
**or** production code, depending on the need. Keep device & scene names faithful to the
home's own Home Assistant `friendly_name`s, write UI copy in Italian, and never introduce
a second accent color or emoji.
