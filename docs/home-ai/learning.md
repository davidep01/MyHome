# Apprendimento

Pattern mining locale, deterministico, **senza LLM** (`learning/miner.ts`, algoritmo `ordered-subsequence-support` v1.0.0). Le statistiche descrivono il campione osservato: non sono probabilità di correttezza universale.

## Opportunità e dataset

- **Opportunità** = un rientro a casa riconosciuto (`episodes/arrival.ts`): tutti assenti per almeno `previous_absence_minutes` (10), poi almeno un presente stabile per `presence_stability_seconds` (60). Flapping, snapshot e riconnessioni non creano rientri.
- Finestra dell'episodio: da `episode_before_minutes` (2) prima a `episode_after_minutes` (20) dopo l'arrivo.
- Contesti separati per fascia del giorno (mattina, pomeriggio, sera, notte): un'abitudine serale non si mescola con quella mattutina.

## Cosa conta

- Solo azioni `manual_confirmed` (gesti della dashboard con esito correlato); `confirmed_manual_only` è un letterale `true`.
- **Una** azione per operazione e per episodio: dieci click nello stesso minuto non gonfiano il supporto (T16); una regolazione con lo slider è **una** sessione (T05).
- Effetti di automazioni esistenti (contesto padre HA) sono esclusi (T08).
- I rientri con **ospiti** non entrano nel profilo ordinario.
- Un'abitudine **dimenticata** (tombstone per `pattern_id`) non viene ricostruita dal miner anche se gli stessi episodi restano: "dimentica" prevale sulle inferenze.
- Il **denominatore** include i rientri coperti in cui l'azione non è avvenuta: sono **controesempi** consultabili (T17).
- Una finestra con **gap** di copertura non è né successo né insuccesso certo: viene esclusa dal conteggio e abbassa la *copertura* dichiarata (T18).

## Processo

1. Token per episodio (max 8): `azione@entità` in ordine temporale.
2. Candidati: sottosequenze ordinate fino a `max_sequence_steps` (5), max 10 per contesto; si tengono i pattern **chiusi** (nessuna estensione con lo stesso supporto).
3. Statistiche: successi `k` su opportunità coperte `n`, frequenza `k/n`, **limite inferiore di Wilson 95%**, giorni distinti, giorni di osservazione, copertura.
4. **Baseline**: frequenza del primo passo fuori dai rientri, nella stessa fascia. Un'affermazione "dopo il rientro" richiede un vantaggio ≥ 0,2 sul contesto di confronto (`NO_CONTEXT_ADVANTAGE` altrimenti).
5. **Validazione temporale**: scoperta sui rientri più vecchi, verifica sul 30% più recente tenuto fuori (min 3), mai sullo stesso episodio.
6. **Decadimento**: peso esponenziale con emivita `decay_half_life_days` (30); un'abitudine che smette di ripetersi decade e viene ritirata con motivo (`DECAYED`, `NO_LONGER_OBSERVED`, T21).

## Soglie (default, configurabili in Impostazioni e privacy)

Un'ipotesi diventa **supportata dai dati** solo se tutte valgono:

| Soglia | Default |
|---|---|
| Opportunità coperte | ≥ 10 |
| Successi | ≥ 7 |
| Giorni distinti dei successi | ≥ 3 |
| Giorni di osservazione | ≥ 14 |
| Copertura | ≥ 0,9 |
| Frequenza | ≥ 0,75 |
| Wilson inferiore 95% | ≥ 0,45 |
| Vantaggio sulla baseline | ≥ 0,2 |
| Validazione temporale | superata |

Stati: `candidate` → `supported` → (`accepted` se salvata come preferenza) · `suppressed` (feedback "non suggerire più", "contesto sbagliato", o due "non utile") · `retired` (decaduta; resta ritirata con il motivo finché non torna davvero sopra soglia). Quando un'abitudine smette di essere supportata, la sua proposta aperta viene ritirata. Ogni stato porta `status_reason` leggibile nella vista **Abitudini**.

## Cold start

Senza abbastanza giorni od opportunità la timeline è disponibile ma **nessun** pattern viene presentato come stabile (`COLD_START`, `FEW_OPPORTUNITIES`, T19).

## Esempio della demo (dati sintetici)

Sequenza serale `luce ingresso accesa → luce soggiorno accesa → clima soggiorno in modalità` osservata in **8 rientri serali su 10** osservabili, con controesempi, copertura ≈ 0,91, baseline 0, validazione temporale superata. È un risultato della fixture, non della casa reale.

## Limiti

- La copertura è solo quella dei canali osservabili: gesti fuori dalla dashboard sono indizi, non azioni certe.
- Un tablet condiviso non identifica la persona: senza profili personali e prove esplicite le abitudini restano di **nucleo** (T14).
- Le soglie sono scelte progettuali, non garanzie statistiche universali.
