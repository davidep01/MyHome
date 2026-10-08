# Calendario della raccolta differenziata

Configurabile **senza modificare codice**: regole manuali o import ICS, con zona, fonte, validità e approvazione esplicita. Il calendario della demo (`demo-waste`, organico il martedì) **non** è una validazione del calendario del comune.

## Modello (`waste-calendar.v1`)

| Campo | Significato |
|---|---|
| `municipality`, `area` | Comune e zona di raccolta (obbligatori per una casa reale: senza → `MUNICIPALITY_MISSING` / `AREA_MISSING`, stato di salute `conflict`, nessun promemoria certo) |
| `timezone` | IANA (default `Europe/Rome`) |
| `valid_from`, `valid_until` | Validità: oltre la scadenza lo stato diventa `expired` e i promemoria non sono più certi |
| `source` | `manual` \| `local_ics` \| `ha_calendar`, riferimento, URL `https` del documento, checksum, data di acquisizione |
| `fractions` | Frazioni (organico, carta, plastica, …), max 12 |
| `rules` | Per frazione: ricorrenza (`dates` esplicite o `rrule`), ora di raccolta, **finestra di esposizione**, **promemoria** (max 4) |
| `exceptions` | Per singola occorrenza: `cancel` oppure `replace` (data/ora di recupero) |
| `revision`, `approval` | Ogni import crea una revisione in **bozza**; diventa attiva solo dopo l'approvazione |

Raccolta, esposizione e promemoria sono **tre orari distinti**. `day_offset: -1` è il giorno civile precedente, non "24 ore prima".

```json
{
  "rule_id": "organico-mar",
  "fraction_id": "organico",
  "recurrence": { "kind": "rrule", "dtstart": "2026-09-01", "value": "FREQ=WEEKLY;BYDAY=TU" },
  "collection_time": "06:00",
  "exposure": { "start_day_offset": -1, "start_time": "20:00", "end_day_offset": 0, "end_time": "06:00" },
  "reminders": [{ "day_offset": -1, "at": "21:00" }]
}
```

RRULE supportate: `FREQ` (DAILY, WEEKLY, MONTHLY), `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `COUNT`, `UNTIL`, `WKST`. Il resto viene **rifiutato** (`RECURRENCE_UNSUPPORTED`), non interpretato.

## Import ICS

`POST /waste-calendar/import` con `kind: "ics"`, contenuto, comune, zona, validità e `label_mapping` (testo del `SUMMARY` → frazione). Regole RFC 5545 applicate:

- `EXDATE` esclude l'occorrenza; `RECURRENCE-ID` la sostituisce (prevalgono sulla ricorrenza);
- eventi **all-day** con `DTEND` esclusivo: la data civile resta quella locale, nessuno slittamento in UTC;
- testi ostili (HTML, caratteri di controllo) trattati come dato: markup rimosso, lunghezza limitata;
- etichette non riconosciute restituite come `unrecognized_labels`, mai indovinate;
- orari **senza fuso** (né `TZID` né `Z`) vengono **rifiutati** con errore visibile: il parser li leggerebbe nel fuso del server (su un server UTC le 07:00 diventerebbero le 09:00) e alcune ricorrenze slitterebbero di giorno. Meglio nessun calendario che uno in parte inventato: esportare l'ICS con `TZID` o inserire le regole a mano.

## Approvazione e revisioni

1. Import → **bozza** con anteprima: occorrenze nell'orizzonte (default 60 giorni), differenze rispetto alla versione attiva (`added`/`removed`/`changed`), problemi e risoluzioni dell'ora legale (`dst_adjusted`).
2. Approva con `If-Match: <revisione>`: la revisione diventa attiva; approvare due volte la stessa revisione non attiva nulla due volte (T28).
3. La nuova versione **ritira** i promemoria della precedente (anche se già visibili) e riconcilia quelli validi: un'occorrenza identica nella nuova versione resta com'è, senza un secondo promemoria; "fatto"/"ignorato" si conservano (T24).

## Regole di risoluzione

- **Festività**: non spostano la raccolta da sole. Serve un'eccezione `replace` confermata (T23).
- **Ora legale** (`Europe/Rome`): un orario inesistente (es. 02:30 del 29/03/2026) passa al primo istante valido se ancora utile (`shifted_forward`); uno ambiguo (02:30 del 25/10/2026) usa la **prima** occorrenza (`first_of_ambiguous`). Mai due promemoria.

## Lifecycle del promemoria

```
scheduled → due → visible → snoozed | completed | dismissed | expired | superseded
```

- `completed` = "ho esposto i rifiuti", non "il gestore ha raccolto".
- Al riavvio i promemoria maturati si recuperano **una volta**; quelli la cui finestra utile è passata scadono, senza raffiche retroattive (T47).
- Il promemoria compare nella regia (**Memoria → Adesso / Raccolta differenziata**). Nessuna notifica push, email, voce o servizio HA in questa release.
