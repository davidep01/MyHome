# DOMINICA — Masterplan v3

> Codename della ristrutturazione di MyHome ("Dominica" = il nome candidato del prodotto; il rename è un token, `dashboardName`, non un refactor).
> Stato: **ESEGUITO** — M0–M8 ✅ (2026-06-10). Residui: signaling proxy WebRTC, rimozione definitiva grid legacy post-validazione tablet.
> Data: 2026-06-10 · Basato su audit del codice reale, non su assunzioni.

---

## 1. Analisi diagnostica

### 1.1 Cosa non va nella domotica classica (e in MyHome oggi)

**Il peccato originale di tutte le dashboard HA: sono inventari, non interfacce.** Lovelace, e oggi anche MyHome, rispondono alla domanda "che dispositivi ho?" — ma chi passa davanti al tablet chiede "è tutto a posto? c'è qualcosa che richiede me?". Il 95% del tempo la risposta giusta è *niente*, e l'interfaccia perfetta per "niente" non è una griglia di 100 card: è un orologio, il meteo e l'assenza di badge.

Le tile disposte a mano sono il sintomo: chiedono all'utente di fare *a priori* il lavoro che il sistema può fare *a runtime* (decidere cosa è rilevante). La premessa di questo piano: **le tile persistite muoiono**; la rilevanza si calcola, non si configura.

Il desktop ha il problema speculare: 11 pagine di controllo (Luci, Clima, Media…) che duplicano il kiosk in un browser — nessuno controlla casa dalla scrivania avendo il tablet a muro e il telefono in tasca. Il lavoro vero del desktop (curare le entità scoperte) è sepolto in un monolite.

### 1.2 Findings riga-per-riga (audit del codice attuale)

| # | Finding | File | Gravità |
|---|---|---|---|
| D1 | Latenza dati kiosk: il bridge SSE **polla** HA ogni 1500ms → latenza media percepita ~750ms+render | `backend/src/lib/ha-stream.ts` | Alta |
| D2 | Token HA ancora consegnato al browser sul percorso desktop (`/api/config/ha-credentials` + WS diretto) | `src/api/ha-websocket.ts`, `backend/src/routes/config.ts:70` | Alta (sicurezza) |
| D3 | Riconnessione SSE = sempre full snapshot (nessun `Last-Event-ID` resume) → spreco su micro-disconnessioni WiFi | `src/api/ha-websocket.ts`, `backend/src/routes/ha.ts` | Media |
| D4 | `/api/weather` senza cache server-side: ogni client colpisce OpenWeather direttamente | `backend/src/routes/weather.ts` | Media |
| D5 | Store UI con 4 campi **morti** (zero consumatori): `theme/setTheme`, `activeRoom`, `dashboardView`, `rightPanelOpen` | `src/store/ui.ts` | Bassa (igiene) |
| D6 | Ogni delta entità fa spread O(n) dell'intera mappa + nessun batching client → re-render storm con HA rumorosi | `src/store/entities.ts` | Media |
| D7 | Diagnostica desktop a keyword-grep ("cpu", "ram"…) invece di `entity_category === 'diagnostic'` | `src/pages/SystemPage.tsx:10-31` | Media |
| D8 | Stanze: inserimento entità **digitando a mano** l'entity_id, mentre il registry HA (aree+nomi) esiste già ed è inutilizzato | `src/pages/SettingsPage.tsx`, `src/api/ha-registry.ts` | Alta (UX) |
| D9 | `SettingsPage` monolite 1.067 righe; `EntityCollectionPage` condivisa da 11 pagine-fotocopia | `src/pages/*` | Media |
| D10 | PIN admin `8999` hardcoded nel bundle = sicurezza-teatro | `src/pages/SettingsPage.tsx:25` | Media |
| D11 | Storage mostrato hardcoded "File" invece del mode reale | `src/pages/SystemPage.tsx:70` | Bassa |
| D12 | Nessuna igiene di memoria per esecuzione 24/7 (webview Android, settimane di uptime) | shell kiosk | Media |

**Cosa è già giusto e NON si tocca:** allowlist servizi per il tablet (`backend/src/routes/ha.ts` — diventa l'unico percorso azioni per *tutti* i client), persistenza a documento singolo, sistema card `WidgetCardFactory` + `stateLabel`, primitive glass, ottimismo+rollback `act()`, SSE config.

---

## 2. Architettura tecnica

### 2.1 Verdetto stack

React 19 + Vite + Zustand + TanStack Query + Hono restano. Cambia la **topologia dei dati** e muore un intero sottosistema (le tile).

### 2.2 HA Bridge v2 — da poll a push (chiude D1, D2, D3)

```
HA ──(UN WebSocket, token server-side)──▶ backend ──SSE──▶ kiosk + desktop + N client
        subscribe_entities (delta compressi)        snapshot + delta + event-id
        ping 30s, backoff, downgrade→poll
```

- **Zero dipendenze nuove**: Node 24 ha il client WebSocket nativo. Client HA minimale scritto a mano (~120 righe: auth, `subscribe_entities`, parsing formato compresso `c/a/r`).
- Il poll attuale **resta come fallback automatico** (codice già esistente e collaudato): se il WS muore → ping fallito → downgrade trasparente a poll → retry WS con backoff. Workaround additivo, debito zero.
- **Latenza: da ~750ms media a <100ms.** Il numero che si sente sotto al dito.
- SSE con `id:` monotono + supporto `Last-Event-ID`: riconnessioni brevi riprendono dai delta, niente full snapshot.
- Il **desktop migra sullo stesso SSE** → si cancellano `connectHA` (WS in browser) e `/api/config/ha-credentials`. Il token non lascia mai il server. P4 chiuso *davvero*.
- `callService` sempre via proxy backend + allowlist (già esistente), per tutti i client.

### 2.3 State management impeccabile (chiude D6)

- **Coalescing**: i delta in arrivo si accumulano e si flushano in finestra da 50ms (un solo `set` Zustand per batch).
- **`useEntity(id, selector?)`**: hook con shallow-equality su `(state, attributes-ref)` — il delta di un sensore non ridisegna nessun'altra card.
- Card memoizzate sul contratto `WidgetCardModel` (già derivato puro in `mapEntityToWidgetCard`).
- **Optimistic v2**: correlazione su `context.id` (HA echeggia il context della service call negli eventi di stato) per conferma/rollback deterministici; timeout 2.5s resta come rete di sicurezza.

### 2.4 Il Composer di rilevanza (il cuore del nuovo kiosk)

Funzione **pura e deterministica**: `compose(entities, config, now) → { header, hero[], rooms[] }`.

Regole di priorità (non ML — spiegabili, testabili a tavolino come il vecchio kernel):

| P | Condizione | Card hero |
|---|---|---|
| 0 | allarme triggered · serratura aperta di notte · fumo/acqua | allarme/sicurezza (bypassa ogni isteresi) |
| 1 | media in riproduzione | media grande |
| 2 | clima in azione (heating/cooling attivo) | clima |
| 3 | robot attivo · cover in movimento · timer | dispositivo in corso |
| 4 | luci accese (aggregate per stanza) | gruppo luci stanza |
| 5 | quiete | Momenti (scene contestuali) + meteo esteso |

Anti-flicker (stress-testato in §5): **dwell minimo 45s** per card entrata, **max 1 swap/30s** (P0 esente), tie-break deterministico per `entity_id` (due client = stessa identica composizione), ricalcolo throttled a 1/s. Override utente dalla regia: "Mostra sempre / Mai nell'Adesso" per entità.

### 2.5 Nuovi endpoint backend (tutto qui)

- `GET /api/ha/registry` — aree+device+entità dal registry HA, proxate (cache 60s). Per il workbench.
- `GET /api/system/status` — storage mode/writable, HA reachability+latenza, modalità bridge (ws/poll), client SSE connessi, versione e integrazioni opzionali presenti come **boolean** (Gemini/OpenWeather — mai i valori).
- `GET /api/weather` → cache server-side 10 minuti (D4).
- `getStreamStats()` esportata da `ha-stream.ts`.
- **Deprecati e poi rimossi**: `/api/layout/*`, `/api/config/ha-credentials`.

### 2.6 Igiene 24/7 (D12)

Soft-reload del kiosk alle 04:00 se idle da >10min (un `location.reload()` — la webview Android accumula; Fully Kiosk lo prevede ma lo facciamo nostro per indipendenza dal launcher). Heartbeat visibile in regia.

---

## 3. Specifiche UI/UX — Liquid Glass, semiotica, motion

### 3.1 Material system — l'asse Z (valori esatti)

Canvas sempre parchment **#f5f5f7** opaco. Profondità = materia, mai ombre.

| Z | Ruolo | Fill | Backdrop | Bordo | Raggio |
|---|---|---|---|---|---|
| **Z0** | canvas | `#f5f5f7` | — | — | — |
| **Z1** | card | `rgba(255,255,255,0.72)` | `blur(20px) saturate(180%)` | `rgba(0,0,0,0.08)` 1px | 18px |
| **Z2** | hero "Adesso" | `rgba(255,255,255,0.78)` + top-light interno (`linear-gradient(180deg, rgba(255,255,255,0.5), transparent 40%)`) | `blur(24px) saturate(180%)` | esterno idem + hairline interna `rgba(255,255,255,0.55)` | 18px |
| **Z3** | sheet/pannello | `rgba(250,250,252,0.86)` | `blur(36px) saturate(200%)` | `rgba(0,0,0,0.10)` | 24px · scrim retro `rgba(8,6,20,0.28)` |
| **Z4** | alert fullscreen | opaco (`#0a0a0c` doorbell) | — | — | 0 |

Regole ferree: blur e opacità **crescono con Z** · **un solo** `backdrop-filter` per ramo di stacking (mai annidati) · budget **≤6 regioni blur** visibili sul kiosk · ingresso elementi: scala 1.0→1.02 mai ombre · `perf-lite`: fill solido `rgba(251,251,253,0.94)`, blur 0, identica gerarchia.

### 3.2 Semiotica del colore

Assioma: **l'icona dice il dominio, il colore dice lo stato, il testo dice il valore.** Mai ridondanza (icona rossa + testo "errore" + badge rosso = rumore).

- Ink ladder `#1d1d1f` / 60% / 42% · interazione **solo** Action Blue `#0066cc` (`#2997ff` su scuro) · gradiente AI solo sul bottone AI.
- Funzionali (solo stato dispositivo): heat `#dc2626` · cool `#0066cc` · ok `#15803d` · warn `#c2410c` · danger `#dc2626` · offline `#b45309` · toni famiglia già in `mapEntityToWidgetCard` (ambra luce, acqua, ecc.).
- **Notte**: scrim `rgba(8,6,20,0.46)` `mix-blend-mode: multiply` — abbassa, non inverte (già esistente, confermato).
- **Dusk shift** (opzionale, fase M7): layer caldo `#ff9a3c` con opacità 0→6% legata all'elevazione solare, transizione 20 minuti, solo `opacity`. Se banda su pannelli 8-bit → si elimina senza rimpianti (polish, non pilastro).

Stati interattivi (touch-first, hover mai necessario):
`rest` → `pressed` (scale 0.97 + overlay nero 6%, 140ms) → `on` (tint famiglia) · `disabled` 40% opacità · `unavailable` 45% + label tradotta · `editing` hairline blu.

### 3.3 Motion system (solo transform/opacity)

| Token | Curva | Durata | Uso |
|---|---|---|---|
| `enter` | `cubic-bezier(0.32, 0.72, 0, 1)` | 380ms | sheet, hero swap, ingressi |
| `exit` | `cubic-bezier(0.4, 0, 1, 1)` | 240ms | uscite (le cose se ne vanno più in fretta di come arrivano) |
| `press` | `cubic-bezier(0.2, 0, 0, 1)` | 140ms | scale 0.97 |
| `toggle` | spring 500/32 | — | knob |
| `reflow` | spring 260/30 | — | FLIP **translate-only** del composer |
| `count` | ease-out | 280ms | numeri live, `tabular-nums` |

Coreografia del composer: a ogni swap si animano **max 2 card** (uscente+entrante), stagger 35ms, il resto trasla via FLIP; `reduced-motion`/`perf-lite` → crossfade 140ms. Mai animare un elemento con `backdrop-filter`.

Tipografia: body 17px (mai 16) · pesi 300/400/600 (il 500 non esiste) · ambient clock 112px peso 300 tracking −2% `tabular-nums`.

### 3.4 User journey — tap necessari

| Azione | Oggi | Dominica |
|---|---|---|
| Spegnere la luce rimasta accesa | cerca sezione + scroll + tap (2–4 gesti) | **1 tap** (è nell'Adesso) |
| "Esco: è tutto a posto?" | impossibile a colpo d'occhio | **0 tap** (header: badge o quiete) — 1 tap per "Spegni tutto" |
| Camera all'arrivo di qualcuno | — | **0 tap** (doorbell fullscreen, esistente) |
| Camera manuale | sezione + scroll | 2 tap (chip stanza → card) |
| Inserire allarme | sezione Sicurezza | 1 tap dal badge header |
| Rinominare un'entità (regia) | Settings → Admin → PIN → cerca | Entità → cerca → inline |

---

## 4. Roadmap moduli

| Fase | Modulo | Contenuto | Rilasciabile |
|---|---|---|---|
| **M0** | Fondazioni | Bridge WS v2 + fallback poll · coalescing store · `useEntity` · resume SSE · cache weather · pulizia `ui.ts` (D5) | ✅ **fatto** (2026-06-10) — chiude D1–D6, D12 parziale; bonus: HLS sul kiosk, fix allowlist humidifier/lawn_mower, token mai più nel browser |
| **M1** | Kiosk a strati | Header stato · Composer "Adesso" · chip Stanze (da aree HA) · dietro flag, grid legacy come fallback un release | ✅ **fatto** (2026-06-10) — composer+isteresi con 13 test |
| **M2** | Regia: Stato+Sistema | landing salute (`/api/system/status`) · connessione/test · backup · diagnostica vera (D7) · sidebar a 4 voci | ✅ **fatto** (2026-06-10) |
| **M3** | Regia: workbench Entità | tabella unica con filtri dominio/area/stato · rinomina inline · aree dal registry HA in sola lettura (D8 risolto alla radice) · bulk · anteprima card live · gruppi | ✅ **fatto** (2026-06-10) |
| **M4** | Timeline + Funzioni | logbook filtrato (`/api/ha/logbook`) + sheet dall'orologio · FunctionsPage (tema, campanelli, suoni, kiosk, integrazioni) | ✅ **fatto** (2026-06-10) |
| **M5** | Energia onesta | sensore più attivo vs la SUA media 24h, capability-gated (niente somme arbitrarie) | ✅ **fatto** (2026-06-10) — più sobrio del piano: per-sensore, non EWMA |
| **M6** | Suggerimenti | regole locali oneste con bottone-azione (il tap è la conferma); write-back automazioni → roadmap AI | ✅ **fatto** (2026-06-10) — 6 test |
| **M7** | Presenza + Ambient | ambient su idle 180s (orologio 112px, drift transform-only) · presence-wake da `kiosk.wakeEntityId` (subscription, non Fully REST) · dusk shift ≤6% | ✅ **fatto** (2026-06-10) |
| **M8** | Demolizioni | via: 9 pagine controllo · `SettingsPage`+PIN · `WidgetHome`/`WidgetPicker` · `ha-credentials` · AppView a 4. La grid kiosk resta SOLO come fallback lazy dietro flag (con kernel e `/api/layout`, che porta anche doorbells/curation) finché il composer non è validato sul tablet | ✅ **fatto** (2026-06-10) |

---

## 5. Report di confutazione

Formato: **Proposta → Attacco (il peggior critico) → Verdetto.**

1. **Composer di rilevanza** → *"La casa decide cosa vedo: imprevedibile, toglie controllo, sorprende."* → Mitigato strutturalmente: slot fissi (l'header e i chip non si muovono MAI), isteresi 45s, tie-break deterministico (stessa composizione su ogni client), spiegabilità ("perché è qui?" nel dettaglio card), override "Mostra sempre/Mai" in regia, inventario completo sempre a 1 tap. **Regge.**
2. **Flicker con HA rumorosi** (sensori che oscillano) → dwell minimo + max swap rate + il ranking usa stati *di classe* (heating sì/no), non valori continui. **Regge.**
3. **Scala a 200+ dispositivi** → compose è uno scan O(n): <1ms per 500 entità. Sheet stanza: cap 24 card + "mostra tutte"; tabella regia virtualizzata oltre 200 righe. **Regge.**
4. **Bridge WS: HA si riavvia, il socket muore in silenzio** → ping 30s, backoff esponenziale, **downgrade automatico al poll esistente** (nessun nuovo single-point-of-failure: il fallback è il sistema attuale già in produzione), stato visibile in regia. Node 24 nativo = zero dipendenze. **Regge.**
5. **Liquid Glass illeggibile su pannelli scadenti** → il fill 0.72+ su parchment dà testo `#1d1d1f` a ~12:1 di contrasto; vietato testo su foto/gradienti; `perf-lite` passa a superficie solida con identica gerarchia. **Regge.**
6. **Animazioni del composer pesanti su GPU mid** → FLIP translate-only, max 2 card animate, mai blur in animazione, `contain` già attivo sulle shell. Worst case → crossfade. **Regge.**
7. ~~**ML locale per comfort predittivo**~~ → *una casa sola = dati insufficienti, modelli inspiegabili, debito enorme.* **SCARTATO.** Sostituito da M5/M6: statistiche baseline + regole leggibili. ("ML" che non sai spiegare a chi abita la casa è un bug, non una feature.)
8. ~~**Voice/wake-word nella webview**~~ → latenza e affidabilità inaccettabili su tablet mid; HA Assist esiste già nativo. **SCARTATO** — non duplichiamo male ciò che HA fa bene.
9. ~~**Punteggio "salute casa" (0-100)**~~ → numero senza azione = gamification vuota. **SCARTATO** a favore dei chip-anomalia azionabili.
10. ~~**Predictive caching client / Service Worker**~~ → su LAN il guadagno è ~0 e la staleness sul kiosk è già costata cara (SW oggi `selfDestroying` apposta). **SCARTATO**; le cache giuste sono server-side (weather 10min, registry 60s) + `staleTime` TanStack.
11. ~~**Multi-home / multi-tenant**~~ → contro la premessa single-home; la semplicità del documento unico È l'architettura. **SCARTATO.**
12. **Uccidere la griglia = buttare il kernel appena consolidato e testato** → vero, ed è sunk cost: il kernel resta finché la vista grid è il fallback (un release), poi si elimina. L'investimento grosso — le card — migra 1:1: cambia il *contenitore*, non il mattone. **Accettato consapevolmente.**
13. **Il piano stesso: troppo in una volta?** → ogni fase M0–M8 è rilasciabile e reversibile da sola; M1 è dietro flag con toggle istantaneo (`localStorage`), e M0 migliora il prodotto *attuale* anche se tutto il resto si fermasse. **Regge.**

---

*Questo documento è la fonte del redesign v3. Quando una fase viene implementata: aggiornare CLAUDE.md (§4/§5) e DESIGN_SYSTEM.md di conseguenza.*
