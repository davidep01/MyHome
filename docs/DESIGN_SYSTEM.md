# MyHome — Design System

> Versione: 1.0 · Ultimo aggiornamento: maggio 2026

---

## Filosofia

Dashboard domotica **semplice, funzionale e visivamente coerente**.  
Il design deve sparire: l'interfaccia serve i dispositivi, non si mette in mostra.  
Ispirazione primaria: **Apple Liquid Glass** — superfici chiare, tipografia pulita, interazioni fisiche.

---

## Palette

Un solo accento interattivo. Nessun secondo colore brand.  
I colori funzionali (rosso caldo, blu freddo, verde OK, arancio alert) esistono solo per lo stato dei dispositivi.

### Canvas e superfici

| Token | Hex | Uso |
|---|---|---|
| `canvas-page` | `#f5f5f7` | Background dell'intera app (parchment Apple) |
| `canvas-card` | `rgba(255,255,255,0.72)` + `blur(20px)` | Card frosted glass |
| `canvas-card-hover` | `rgba(255,255,255,0.88)` | Card in hover |
| `hairline` | `rgba(0,0,0,0.08)` | Bordi card |
| `hairline-strong` | `rgba(0,0,0,0.12)` | Bordi in evidenza |

### Testo

| Token | Valore | Uso |
|---|---|---|
| `ink` | `#1d1d1f` | Tutti i testi primari |
| `ink-secondary` | `rgba(29,29,31,0.60)` | Sottotitoli, label |
| `ink-tertiary` | `rgba(29,29,31,0.42)` | Metadati, placeholder, micro-info |

### Accento e stato

| Token | Hex | Uso |
|---|---|---|
| `action-blue` | `#0066cc` | CTA, focus, AI, link, accento unico interattivo |
| `action-blue-dark` | `#2997ff` | Link su superfici scure (overlay campanello) |
| `hot-red` | `#dc2626` | Riscaldamento attivo, temperatura ≥ 24 °C |
| `cold-blue` | `#0066cc` | Raffreddamento attivo, temperatura ≤ 18 °C |
| `ok-green` | `#15803d` | Stato OK, lock sbloccato, sensore stabile |
| `alert-orange` | `#c2410c` | Avvisi non critici, batteria bassa |
| `danger-red` | `#dc2626` | Allarme attivo, errori critici |

---

## Tipografia

Font: **SF Pro** su macOS/iOS (risolto automaticamente dal sistema), **Inter** come fallback su altri sistemi.

```css
font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
```

| Ruolo | Size | Weight | Letter-spacing | Uso |
|---|---|---|---|---|
| Titolo pagina | 28–32px | 600 | −0.374px | H1 di ogni vista |
| Intestazione sezione | 16px | 600 | −0.224px | Label SectionBand |
| Body card | 17px | 400 | −0.374px | Testo principale card |
| Label widget | 14px | 400 | −0.224px | Nomi dispositivi |
| Micro / badge | 11–12px | 500 | 0 | Chip, badge, counter |

**Regole invariabili**

- Body sempre a **17px**, non 16px.
- Pesi: 300 / 400 / 600 — il 500 non esiste nel sistema.
- Tracking negativo su tutti i titoli (firma "Apple tight").
- Line-height body: **1.47**.

---

## Spaziatura

Griglia a 8px. Le card usano padding interno `16–24px`.

| Token | Valore |
|---|---|
| `xs` | 8px |
| `sm` | 12px |
| `md` | 16px |
| `lg` | 24px |
| `xl` | 32px |
| `section-gap` | 20px (gap verticale tra SectionBand) |

---

## Raggi (border-radius)

| Token | Valore | Uso |
|---|---|---|
| `radius-card` | 18px | Card bento, GlassSheet, pannello |
| `radius-inner` | 11px | Elementi interni alle card |
| `radius-sm` | 8px | Bottoni utility, chip compatti |
| `radius-pill` | 999px | CTA primarie, input ricerca, badge |

---

## Elevazione

**Nessuna ombra su card o bottoni.**  
L'elevazione viene dal cambiamento di superficie (glass su parchment) e dal `backdrop-filter`.

| Livello | Trattamento | Dove |
|---|---|---|
| Flat | Nessuna ombra, nessun bordo | Sezioni, background |
| Frosted glass | `rgba(255,255,255,0.72)` + `blur(20px)` + hairline `rgba(0,0,0,0.08)` | Tutte le card |
| Product shadow | `rgba(0,0,0,0.22) 3px 5px 30px` | Solo immagini prodotto/video su superficie |
| Glow | `rgba(accent, 0.20–0.35)` spread `24px` | Card clima attive (caldo/freddo) |

---

## Layout

### Struttura a tre colonne (desktop/tablet)

```
┌──────┬──────────────────────────────────┬──────────┐
│      │  Header: saluto + meteo           │          │
│      │  Scene circolari                  │ Pannello │
│ RAIL │  ──────────────────────────────── │ on-demand│
│ 68px │  BENTO GRID                       │  320px   │
│      │  (sezioni per dominio / area HA)  │          │
│      │                                   │          │
└──────┴──────────────────────────────────┴──────────┘
```

- **Mobile** (`< 768px`): bottom tab bar, pannello → bottom sheet fullscreen.
- **Tablet** (`768–1024px`): rail icone 68px + main, pannello → bottom sheet.
- **Desktop** (`> 1024px`): layout a tre colonne, pannello sempre a destra.

### Rail sidebar (tablet/desktop)

Larghezza fissa **68px**. Solo icone. Dall'alto verso il basso:

1. Avatar / logo app + dot connessione HA (verde / arancio / rosso)
2. Divisore hairline
3. Nav: Home · Aree · Clima · Sicurezza · Energia
4. `margin-top: auto` →
5. Pulsante AI (gradiente blu→viola)
6. Pulsante Impostazioni
7. NotificationBell

Tooltip a comparsa su hover (label testuale). Active state: pill background `rgba(0,0,0,0.10)` con `layoutId` animato.

---

## Struttura Home

```
1. HomeHeader        — saluto ora del giorno, nome utente, meteo 4-day
2. SceneRow          — 6 scene circolari colorate con label sotto
3. SectionBand       — "Persone" (2×1)
4. AutoHome          — sezioni bento per dominio, auto-scoperte da HA live
                       (con "Mostra tutti N" se > 8 card)
```

La home si **auto-configura** dal flusso WebSocket di HA. Zero setup manuale.  
Se ci sono **Aree** definite in HA → la vista "Aree" genera una plancia per stanza (Piscina, Locale Termico, …).

---

## Bento Grid

`SectionBand` usa CSS Grid con:

```css
grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
grid-auto-rows: 112px;
grid-auto-flow: row dense;
```

`dense` incastra le tessere eliminando i buchi. Ogni card ha `height: 100%` per riempire la sua cella.

### Footprint per tipo di dispositivo

| Tipo | Colonne × Righe | px (appross.) | Motivo |
|---|---|---|---|
| 📹 Camera | 2 × 3 | 300×336 | Video ha bisogno di spazio |
| 🎵 Media | 2 × 2 | 300×224 | Art + now-playing |
| 🌡️ Clima | 2 × 2 | 300×224 | Dial radiale + controlli |
| 🛡️ Allarme | 2 × 1 | 300×112 | Due bottoni affiancati |
| 💡 Luce | 1 × 2 | 150×224 | Toggle + slider brightness |
| 🤖 Robot | 1 × 2 | 150×224 | Stato + chip info |
| 🔒 Serratura | 1 × 2 | 150×224 | Press-and-hold verticale |
| 🪟 Tapparella | 1 × 2 | 150×224 | Slider apertura |
| 🔌 Switch | 1 × 1 | 150×112 | Toggle compatto |
| 🎬 Scena | 1 × 1 | 150×112 | Tap immediato |
| 📊 Sensore | 1 × 1 | 150×112 | Valore + sparkline |

---

## Card per tipo

### 💡 Luce
- **Tap** sull'icona → toggle on/off istantaneo (ottimistico).
- Card accesa: tint ambra `rgba(234,179,8,0.10)`, glow giallo.
- **Slider brightness inline** visibile solo quando la luce è accesa.
- Chevron `›` → apre pannello contestuale dx con DragSlider + preset 25/50/75/100%.

### 🌡️ Clima
- **Tint rosso** quando riscalda (`#dc2626` al 12%), **tint blu** quando raffredda (`#0066cc` al 10%).
- Mostra temperatura target (colorata) + corrente.
- Bottoni `−` / `+` (step 0.5°) **non** aprono il pannello.
- **Click sulla card** → pannello dx:
  - Radial dial grande (target vs current)
  - Bottoni `−` · `Allinea` · `+`
  - MODE: OFF / CALDO / AUTO (pill selezionabile)
  - FAN MODE: 1 2 3 4 5

### 📊 Sensore temperatura
- Valore grande: **rosso ≥ 24 °C, blu ≤ 18 °C**, neutro tra 18–24 °C.
- Sparkline storico 6h con lo stesso colore del valore.
- Usa solo °C e normalizza internamente per la soglia.

### 🔒 Serratura
- **Press-and-hold** (900ms): anello di progresso SVG animato.
- Nessun toggle accidentale: serve intenzione esplicita.
- Icona cambia: `Lock` chiuso → `LockOpen` aperto.

### 🤖 Robot
- Stato: In Carica / In Pulizia / Rientro / In Pausa.
- Chip: area m², durata, velocità.
- Pulsante: Start / Dock.
- Animazione rotazione quando in pulizia.

### 📹 Camera
- **Miniatura live**: snapshot → fallback automatico a MJPEG se la camera non supporta still (es. Scrypted).
- Badge **Offline** giallo se `state === 'unavailable'`.
- **Tap → fullscreen**: stream adattivo:
  - `web_rtc` se `frontend_stream_type === 'web_rtc'` → bassa latenza.
  - MJPEG altrimenti → fallback immediato.
  - Pulsante 🎤 **push-to-talk** (WebRTC con back-channel).
- Upgrade automatico: MJPEG visibile subito, sostituito da WebRTC appena la traccia arriva.

### 🎵 Media
- Art work + titolo + artista.
- Controlli: Previous / Play-Pause / Next.
- Barra volume.

### 🛡️ Allarme
- Stato corrente (Disinserito / Inserito / Allarme!).
- Due bottoni: **Disins.** / **Inser.** con colori dinamici stato.

### 🔌 Switch / 🎬 Scena
- Compatti, tap immediato, `scale(0.95)` on press.
- Switch: toggle con stato cromatico (verde on, grigio off).
- Scena: colore personalizzato per scene (icona + pill).

---

## Pannello contestuale (destra)

**Aperto solo su richiesta**. Default: Meteo + News.

```
Header: [icona dominio]  Nome entità     [✕ chiudi]
               Sottotitolo stato

Body: controlli specifici per tipo
      (clima → dial + mode + fan)
      (luce  → toggle + slider + preset)
      (altro → info base)
```

Animazione: `x: 16px → 0, opacity: 0 → 1` (spring).  
Su mobile/tablet → `GlassSheet` bottom invece del pannello laterale.

---

## Overlay di sistema

### HA non disponibile

```
Background: rgba(245,245,247,0.86) + blur(24px)
Icona:      WifiOff, animazione pulse
Titolo:     "Home Assistant non disponibile"
Azione:     Pulsante "Riprova adesso" → reconnect manuale
```

- Grace period: **2 secondi** prima di mostrarlo (evita flash su reconnect rapido).
- **Si chiude automaticamente** quando `connectionStatus === 'connected'`.

### Campanello → fullscreen

```
Background: nero pieno
Contenuto:  stream video fullscreen (WebRTC → MJPEG)
Top bar:    icona campanello animata + "Qualcuno alla porta" + ora + ✕
Bottom:     pill "Riconoscimento volto" (placeholder) + Ignora / Visto
```

- Auto-dismiss: **60 secondi** se il sensore rimane attivo.
- Pulsante 🎤 talk-back se la camera supporta WebRTC + audio.

### Night mode (tablet Android)

- Guidato da `AmbientLightSensor` del dispositivo.
- Soglia: lux < 10 → notte, lux > 25 → giorno (isteresi per evitare flickering).
- Fallback: orologio (21:00–07:00 = notte).
- Implementazione: scrim `rgba(8,6,20,0.34)` + `mix-blend-mode: multiply`.  
  Non inverte i colori, abbassa semplicemente la luminosità percepita.

---

## Interazioni

| Gesto | Effetto |
|---|---|
| Tap | Azione primaria (toggle, scena, CTA) |
| Press | `scale(0.95)` — Apple universal micro-interaction |
| Long-press | Sblocco serrature (press-and-hold con anello progress) |
| Click card clima/luce | Apre pannello contestuale dx |
| Swipe bottom sheet | Chiude il pannello su mobile |

Tutte le azioni verso HA usano **stato ottimistico**: UI aggiornata istantaneamente, rollback automatico se HA risponde con errore.

---

## Intelligenza Artificiale (Gemini 2.5 Flash)

- **Chiave esclusivamente backend** (`GEMINI_API_KEY` senza prefisso `VITE_`).
- **Grounded** sullo stato live di HA (fino a 120 entità nel contesto).
- Due endpoint:
  - `/api/ai/chat` — chat in linguaggio naturale.
  - `/api/ai/suggest` — 3 automazioni proattive contestuali.
- UI: pannello sheet laterale accessibile dall'icona ✦ nella rail.

### Comportamento atteso
- Risponde **solo su entità esistenti** (non inventa dispositivi).
- Lingua: italiano.
- Tono: conciso e pratico.
- Per le automazioni: formato `trigger → condizione → azione`.

---

## PWA (Progressive Web App)

| Voce | Valore |
|---|---|
| `theme-color` | `#f5f5f7` |
| `background-color` | `#f5f5f7` |
| `display` | `standalone` |
| Icone | 192px, 512px, 512px maskable |
| Offline | Shell cached, stati last-known |
| Precache | 13 entry (JS + CSS + icone + manifest) |

**Requisiti per il tablet Android**

- HTTPS obbligatorio per: autoplay video, `AmbientLightSensor`, microfono (talk-back), installabilità PWA.
- Keep-awake via **Wake Lock API** (da aggiungere).
- Target di tocco minimo: **44 × 44px** su tutti i controlli interattivi.

---

## Regole "da non fare"

- ❌ Gradienti decorativi come sfondo (solo parchment piatto `#f5f5f7`).
- ❌ Ombre su card o bottoni (solo glow funzionale per clima attivo).
- ❌ Secondo colore brand accento.
- ❌ Peso 500 (la scala è 300 / 400 / 600).
- ❌ Sezioni sempre espanse con molti dispositivi (usare "Mostra tutti N").
- ❌ Entità diagnostica/sistema visibili in dashboard (gestirle via Admin PIN 8999).
- ❌ Chiave API nel bundle frontend.
- ❌ Toggle per sblocco serrature (solo press-and-hold).

---

## File chiave

| File | Ruolo |
|---|---|
| `src/design/tokens.ts` | Tutti i token colore, raggio, spring |
| `src/index.css` | Canvas, glass utilities, tipografia base |
| `src/components/home/SectionBand.tsx` | Bento grid (row unit 112px, dense flow) |
| `src/components/widgets/WidgetGrid.tsx` | Spans per tipo di entità |
| `src/components/widgets/CameraStream.tsx` | WebRTC adattivo + MJPEG fallback + talk-back |
| `src/components/contextual/ClimateDetail.tsx` | Pannello clima (dial + MODE + FAN) |
| `src/components/system/ConnectionOverlay.tsx` | HA-down fullscreen |
| `src/components/system/DoorbellAlert.tsx` | Campanello fullscreen |
| `src/hooks/useAmbientNightMode.ts` | Light sensor + clock fallback |
| `src/hooks/useDiscoveredEntities.ts` | Auto-discovery live da HA |
| `src/hooks/useAreas.ts` | Planche per area (registry HA) |
| `src/config/doorbell.ts` | Config campanello → camera |
| `docs/SMART_FUNCTIONS_ROADMAP.md` | Feature da deployare (Frigate, WebRTC audio, ecc.) |

---

## Matrice famiglie widget (canone implementativo — 2026-06-10)

Il sistema card è **uno solo**: `WidgetCardFactory` (azioni) + `mapEntityToWidgetCard` (design per
famiglia) + `WidgetCardBase` (shell e primitive) + `utils/stateLabel.ts` (stati in italiano).
Le vecchie card standalone per dominio sono state eliminate (codice morto).

### Stati universali (valgono per OGNI famiglia, presente e futura)
- **Loading** → skeleton shimmer · **Unavailable/Unknown** → card desaturata, "Non disponibile" ·
  **Offline** → idem con WifiOff · **Errore azione** → rollback + shake + haptic heavy
  (`useActionFeedback`, helper `act()` nel factory) · **Editing** → overlay tratteggiato con grip.

### Famiglie

| Famiglia | Domini HA | Icona | Tono | Primario | Anim. (solo se attiva) | Azioni |
|---|---|---|---|---|---|---|
| light | light | Lightbulb | light | luminosità % | softGlow | tap=toggle · slider |
| switch / smartPlug | switch, input_boolean | Power/PlugZap | ok/energy | ON-OFF / W | energyFlow (plug) | tap=toggle |
| climate / thermostat | climate, water_heater | Flame/Wind/Thermometer | temperatureTone | target °C | heat/snow/fanSpin | ±temp · power · dial |
| fan | fan | Fan | cool | velocità % | fanSpin | tap=toggle · slider |
| humidifier | humidifier | Droplets | water | umidità target % | waterWave | tap=toggle · slider umidità |
| cover/curtain/gate/garage | cover | Blinds/Home | energy | posizione % | blindMove/gateSlide | apri · stop · chiudi |
| lock | lock | Lock | securityTone | Aperta/Chiusa | alarmPulse se aperta | press-and-hold (mai toggle) |
| alarm/smokeGasCo/waterLeak | alarm_control_panel, siren, binary_sensor | Shield(Alert) | ok/critical | OK / ! | alarmPulse se critico | arm/disarm |
| motion/presence/doorWindow | binary_sensor, person, device_tracker | Activity/UserRound/Home | cool/ok/security | Sì-No / Casa-Fuori / Aperta-Chiusa | ripple se attivo | — |
| sensori (temp/humidity/airQuality/battery/energy/solar/water/pool/network) | sensor, air_quality | per famiglia | scale dedicate | valore + unità | energyFlow/waterWave | — |
| weather | weather | CloudSun | light/cool | °C | rain/softGlow | — |
| camera/doorbell | camera | Camera/Bell | cool | Live | liveBlink | snapshot nel ring |
| media/speaker/tv | media_player | Music2/Radio/Tv | media | Play/Pausa/Off | pulse se playing | play/pause · volume |
| vacuum / mower | vacuum, lawn_mower | Bot | ok/critical | batteria % | rotate se al lavoro | start / dock |
| scene/script/automation/timer | scene, script, automation, timer, button, remote | Sparkles/ListChecks/Timer | media | Vai / ON-OFF | sparkle solo se attiva | esegui/toggle |
| update | update | CircleArrowUp | warning/ok | versione | — | nessuna (no install da kiosk); fuori dalla discovery |
| water (valvole) | valve | Droplets | water | stato | — | apri/chiudi valvola |
| **generic (fallback)** | qualsiasi dominio ignoto | per dominio | neutral | stato tradotto + unità | — | — |

**Regola fallback:** un dominio mai visto non deve mai rompere la dashboard → famiglia `generic`,
stato tradotto, tono neutro. La discovery resta una **allowlist** (`DOMAIN_TYPE`): i domini rumore
(sun, zone, tts, update, …) restano fuori di proposito.

### Lingua e tipografia delle card
- Ogni stato HA passa da `stateLabel()` → italiano. Mai snake_case all'utente.
- Temperature sempre `°C`; numeri `tabular-nums`; accenti corretti (Luminosità, Velocità, Qualità, Umidità).

### Checklist nuovo dominio
1. `DOMAIN_TYPE` + `DOMAIN_META` (`useDiscoveredEntities.ts`) riusando un `EntityType` affine.
2. Famiglia in `WidgetFamily` + caso in `mapEntityToWidgetCard.ts` (tono da `widgetTones`, animazione solo se attiva).
3. Stati nuovi in `stateLabel.ts`.
4. Azioni nel factory sempre dentro `act()`; haptic: light=toggle, medium=azione, heavy=sicurezza.
5. Touch ≥44px, niente hover-only; aggiorna questa matrice.

---

## Home a strati (DOMINICA, 2026-06-10) — canone

La home kiosk **si compone da sola**: nessuna tile da disporre. Quattro strati:

| Strato | Componente | Contenuto | Regole |
|---|---|---|---|
| 1 · Stato | `StatusHeader` | ora 56px/300 tabular + saluto, presenza, meteo chip, punto connessione, **chip-anomalia** | sempre presente; chip: danger `#dc2626`/bg red-12, warn `#c2410c`/bg orange-12, info ink-55/bg black-6; azione proposta = bottone bianco inline (il tap è la conferma) |
| 2 · Adesso | `NowSection` | 3–6 card scelte dal composer (`src/lib/composer.ts`) | griglia 2/3 col, righe 170px, prima card prioritaria = col-span-2 taglia L; ingressi `.card-enter` stagger 35ms; MAI FLIP su elementi col blur |
| 2b · Quiete | `QuietSection` | meteo esteso (2 col) + EnergyCard (se sensori) + Momenti/SceneRow | compare solo a hero vuoto |
| 3 · Stanze | `RoomsRow` + `EntitySheet` | chip pill 48px dalle aree HA, badge = attivi; sheet centrato con griglia card 150px, cap 24 + "Mostra tutte" | fallback senza registry: una chip "Tutti i dispositivi" |
| 4 · Ambient | `AmbientLayer` | idle 180s → superficie `#070709`, orologio 112px/300 tracking −2%, data, meteo; drift ±10px/90s transform-only | esce con tocco / presence-wake / mai sopra un danger; drift spento in reduced-motion e perf-lite |

**Composer**: priorità 0 sicurezza (triggered, serratura aperta di notte, smoke/water) → 1 media playing → 2 clima con `hvac_action` attiva → 3 robot/cover in movimento → 4 luci accese aggregate per area (gruppo sintetico). Isteresi: dwell 45s, max 1 swap/30s, P0 bypassa; tie-break per `entity_id` (composizione identica su ogni schermo). Spiegabilità: `reason` su ogni slot (title).

**Timeline** (`TimelineSheet`): tap sull'orologio → "Oggi a casa" (logbook filtrato: person/alarm/lock/automation + eventi campanello), righe 52px, orari tabular.

**Dusk shift** (`DuskLayer`): velo `#ff9a3c` multiply, opacità 0→6% per elevazione solare 10°→−6°, transizione 2s. Se banda su pannelli scadenti → si elimina senza rimpianti.

**Regia desktop** (4 viste): Stato (salute+problemi+backup), Entità (workbench con anteprima live card), Funzioni (feature card con stato), Sistema (connessione+diagnostica da `entity_category`). Touch target ≥44px ovunque; nessun PIN (gate = `desktopOnly`).

> La "premium widget card" e le card di dominio restano il mattone invariato (vedi matrice famiglie sopra): è cambiato il contenitore, non il mattone. La griglia widget 8col×64px è **legacy**: vive solo dietro `localStorage['myhome.home']='grid'`.

---

## Icone animate + catalogo Spazi (2026-06-11)

### Icone animate (`src/components/icons/animated.tsx`)
23 icone SVG multi-parte in stile lucide (viewBox 24, stroke 2, cap arrotondati), drop-in al posto delle icone statiche nel mapping delle card. La **parte** giusta si muove, mai l'icona intera:

| Icona | Parte animata | Quando |
|---|---|---|
| `AnimFan` | rotore (3 lobi pieni) gira, mozzo fermo | fan on |
| `AnimLightbulb` | 3 raggi + alone respirano sfalsati | luce accesa |
| `AnimFlame` | guizzo dalla base (scaleY+rotate) | heating |
| `AnimSnowflake` | rotazione lentissima (14s) | cooling |
| `AnimEqualizer` / `AnimTv` | barre che danzano sfalsate | playing |
| `AnimSpeaker` | woofer che pulsa | playing |
| `AnimLock` | gancio che si solleva (posa con spring, non loop) + keyhole pulse | sbloccata |
| `AnimBlinds(Moving)` | stecche che ondeggiano | solo opening/closing |
| `AnimBot` | occhi che sbattono + corpo che ondeggia | cleaning/mowing |
| `AnimShield` | eco che si propaga + "!" pulsante | triggered |
| `AnimRadar` | anelli che si propagano | motion rilevato |
| `AnimCamera` | iride viva + REC blink | online |
| `AnimMist` | fili di vapore che salgono | umidificatore on |
| `AnimZap`/`AnimWind`/`AnimDroplet`/`AnimCloudSun`/`AnimSparkles`/`AnimPower`/`AnimBell` | flicker/flusso/bob/twinkle sobri | attivi |

**Regole.** (1) Attivazione SOLO via contesto CSS: `.widget-card-icon-active` (puck card) o `.ai-active` (wrapper libero) — niente prop drilling; fuori contesto l'icona è una posa statica corretta. (2) `transform-box: fill-box` su ogni `.ai-part` (origini locali). (3) Solo transform/opacity. (4) **Mai loop su sensori passivi** (termometro, droplet-umidità statici di proposito). (5) Tutto spento in `perf-lite` e `prefers-reduced-motion`. CSS nella sezione "Animated icons" di `index.css`.

### Catalogo "Spazi" (`SpacesCatalog`)
Zoom-out della casa in stile rivista: overlay fullscreen su parchment pieno, titolo 44px/300, sottotitolo riassuntivo, grab-handle con **drag-down elastico** per chiudere. Card stanza (glass, 22px radius, min 164px, enter stagger `.card-enter`): puck 56px con icona-attività animata (o glifo della stanza da `roomGlyph`), badge temperatura, nome 19px/600, fatti vivi max 2 ("3 luci accese · Serratura aperta"), strip 28px delle altre attività in corso. Sezione "Automazioni attive" con sparkle animato solo se scattate da <1h. Il tap su una stanza apre l'EntitySheet SOPRA il catalogo (drill-down). Chip Stanze: stesso linguaggio — glifo→icona attività con pop spring (`ACTIVITY_META`).

### Fix di sistema
- I preset `widget-anim-*` non vanno MAI sulla shell della card (la ruotavano/lampeggiavano): vivono nel motion-layer e nelle parti delle icone.
- `.widget-card-motion-layer` dichiara `position:absolute` DOPO i preset: quelli con `position:relative` (energyFlow/ripple/shimmer) lo collassavano a misura zero.

---

## Card entità — anatomia definitiva (2026-06-13)

Il sistema card è stato riscritto contro il look "AI slop" (gradienti generici,
glitch di layout, ring decorativi). Canone attuale:

```
┌──────────────────────────────┐
│ [icona 34-44px]   [controllo]│  ← toggle iOS / ± / ↑■↓ / play / hold-lock
│        …spazio flessibile…   │
│ (valore grande, solo misure) │  ← 22/28/36px tabular, solo sensori/clima/meteo
│ Nome dispositivo             │  ← 13/15/17px·600, 2 righe (1 se slider/valore)
│ Stato · dettaglio            │  ← 13px·400 inchiostro muto; accent solo se significativo
│ [slider inline se attiva]    │  ← track 5px + knob bianco 26px, custom
└──────────────────────────────┘
```

Regole dure:
- **Vetro neutro identico per ogni famiglia**: `rgba(255,255,255,0.44)` + blur;
  attiva = layer `.widget-card-fill` (bianco 0.78) che fa SOLO fade di opacity.
- Il **colore vive nell'icona** (cerchio piatto: accent 15% + glifo accent da
  attiva, nero 5% + glifo muto da spenta) e nella riga di stato quando
  significativo (riscalda/allarme/sbloccata). Mai come lavaggio di fondo.
- **Niente**: ring/dial, gradienti per famiglia, gloss multilayer, drop shadow
  (eccetto il drag, transitorio), badge ridondanti, footer di bottoni 48px,
  viola (l'accento è uno: `#0066cc`; l'ambra è delle lampadine).
- **Serrature**: anche sulla card lo sblocco è hold 900ms (disco che si riempie,
  transform-only); il blocco è un tap.
- Le uniche animazioni di card: shimmer (loading) e errorShake (rollback).
  Il movimento è delle icone animate (`.widget-card-icon-active`).
