# Fonts

MyHome follows Apple's system-font strategy.

| Role | Family | How it loads |
|---|---|---|
| Primary (Apple platforms) | **SF Pro Display / SF Pro Text** | Resolved automatically by the OS via `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text"` — no file needed |
| Fallback (everything else) | **Inter** | Loaded from Google Fonts CDN in `../colors_and_type.css` (weights 300 / 400 / 600) |

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
             "Inter", system-ui, sans-serif;
```

**Rules that ride on the font (from `DESIGN_SYSTEM.md`):**
- Body text is **17px** (never 16), line-height **1.47**.
- Weight ladder is **300 / 400 / 600** — **weight 500 does not exist** in the system.
- **Negative letter-spacing on titles** (−0.224 → −0.374px) for the "Apple-tight" feel.
- Numeric read-outs use `font-variant-numeric: tabular-nums`.

> No local font files are vendored — SF Pro ships with the OS and Inter comes from CDN.
> Inter is the spec's chosen fallback, so it is used here despite being a common face.
