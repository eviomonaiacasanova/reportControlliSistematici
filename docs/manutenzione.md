# Manutenzione e modifiche

## Aggiungere nuove sezioni standard
- Modificare il template JSON
- La UI si adatta automaticamente

## Riordinare sezioni o controlli
- Agire sul campo `order`
- Nessuna dipendenza nel codice

## Aggiornare il logo
- Sostituire `assets/logo.jpg` (UI)
- Rigenerare `assets/logo.inline.js` con lo script dedicato

## Aggiornare la versione
- Modificare soltanto `APP_VERSION` all'inizio di `js/app.js`

## Modificare la logica dei dati
- Le trasformazioni di sezioni e controlli sono raccolte in `js/model.js`
- Le funzioni del modello non usano DOM, prompt o stato globale e restituiscono un nuovo modello
- Date, identificativi e nomi dei file esportati sono raccolti in `js/utils.js`

## Modificare l'interfaccia
- `js/app.js` coordina eventi e rendering
- I renderer di controllo sono separati in titolo, note, stato e fotografie
- I renderer di sezione sono separati in riepilogo, azioni e corpo

## Eseguire i test
- Aprire `tests/model-smoke.html`
- Aprire `tests/app-load-smoke.html`
- Aprire `tests/pdf-export-smoke.html`
- Aprire `tests/image-utils-smoke.html`
- Ogni pagina deve mostrare `PASS`

## Regolare peso e qualità delle foto
- Modificare `CONFIG` all'inizio di `js/image-utils.js`
- `maxWidthPx` e `maxHeightPx` regolano la risoluzione massima
- `jpegQuality` regola il compromesso tra qualità e peso
- `pdfMaxWidthMm` e `pdfMaxHeightMm` regolano lo spazio occupato nel PDF

## Filosofia
Il codice è pensato per:
- essere letto
- essere capito
- essere modificato anche a distanza di anni
