# Privacy

Principio: **minimo necessario, locale, revocabile**. Nessun dato lascia la casa: niente cloud, niente modelli, niente telemetria verso terzi. L'unica eccezione possibile è l'adapter meteo OpenWeather già usato dalla dashboard, e solo se dichiarato (`external_network_enabled: true`): invia la posizione configurata per le previsioni, mai dati della casa.

## Cosa si osserva

- **Solo entità selezionate** (opt-in, max 1.000) più i ruoli presenza/porta/finestra. Le entità non selezionate vengono scartate nell'adapter, **prima** della persistenza.
- **Stato minimizzato**: stato e pochi attributi ammessi per dominio; niente immagini, `entity_picture`, coordinate GPS, token, URL.
- **Mai** audio, video o posizione precisa: `capture_audio`/`capture_video` sono letterali `false` nello schema.
- Click della dashboard: chiave semantica dell'azione (`lighting.on`, `climate.mode`…), entità, sessione di regolazione, esito. Il tablet condiviso **non identifica la persona** (`SHARED_DEVICE`).

## Consensi (tre finalità distinte)

| Consenso | Effetto | Revoca |
|---|---|---|
| Osservazione | Registra eventi delle entità selezionate e la telemetria dei gesti | Si smette di registrare; i dati restano finché non li dimentichi |
| Apprendimento | Il miner cerca abitudini sui dati reali | Stop immediato delle inferenze e **rimozione delle abitudini reali e delle proposte di routine derivate** (T43) |
| Profili personali | Separa abitudini per persona (pseudonimi) | Gli scope *persona* tornano invisibili; nessuna attribuzione per coincidenza |

Uno non implica gli altri. Ogni modifica è registrata (`privacy_consents`) con una nuova `privacy_scope_version`, copiata negli eventi successivi. La demo non può apprendere da dati reali (vincolo di schema).

## Scope e ruoli

- Scope dei dati: `household` (nucleo), `person` (pseudonimo, solo con consenso), `device`.
- Ruolo `kiosk` (tablet): proposte e contesto di nucleo ridotti; **mai** episodi o abitudini personali, nemmeno via API diretta o stream (T44).
- Ruolo `admin` (regia): configurazione, export, oblio, audit, backup.

## Conservazione (default, configurabile)

| Dato | Giorni |
|---|---|
| Eventi osservati | 30 |
| Episodi di rientro | 90 |
| Statistiche e snapshot di contesto | 90 |
| Audit e decisioni di policy | 90 |
| Quarantena | 1 |

La retention gira una volta al giorno (data civile locale).

## Export

**Impostazioni e privacy → Esporta**: JSON locale (`home-ai-core-export/v1`, `secrets_included: false`) con consensi, eventi, episodi, abitudini, proposte, preferenze, feedback, calendari e promemoria, già passato dalla redazione dei segreti. Lo scope *persona* esce solo con il consenso ai profili, sia per gli eventi sia per i derivati. Non contiene token né la chiave dei backup.

## Oblio

`POST /privacy/delete` con un selettore: per entità, per soggetto (pseudonimo), per abitudine, prima di una data, oppure tutto. La cancellazione è transazionale e include i **derivati**: episodi, abitudini, feedback, preferenze collegate, snapshot di contesto, proposte, proiezione di stato e intervalli di copertura.

Ogni cancellazione lascia una **tombstone** (selettore + istante). Un evento che corrisponde a una tombstone viene rifiutato all'ingestione (`tombstoned`), quindi né un replay né un ripristino da backup reintroducono ciò che è stato dimenticato.

## Backup

- Copia coerente (`VACUUM INTO`) + `PRAGMA integrity_check`, cifrata AES-256-GCM.
- La chiave sta in un file separato (`home-ai-backup.key`, permessi `0600`), **mai** nella cartella dei backup.
- Rotazione: 7 copie.
- Ripristino: il database corrente viene salvato a parte; le tombstone attuali vengono riapplicate **appena aperto l'archivio ripristinato, prima di qualsiasi rielaborazione** (T49).

## Redazione dei segreti

`domain/redact.ts` rimuove token HA/Supervisor/admin/kiosk noti, header `Authorization`, JWT e chiavi tipo `api_key=` da messaggi d'errore, audit ed export (T45).
