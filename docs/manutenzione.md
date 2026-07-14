# Manutenzione e modifiche

## Aggiungere nuove sezioni standard
- Modificare il template JSON
- La UI si adatta automaticamente

## Riordinare sezioni o controlli
- Agire sul campo `order`
- Nessuna dipendenza nel codice

## Aggiornare il logo
- Sostituire `assets/logo.jpg` (UI)
- Rigenerare la base64 in `app.js` (PDF)

## Regolare peso e qualità delle foto
- Modificare `CONFIG` all'inizio di `image-utils.js`
- `maxWidthPx` e `maxHeightPx` regolano la risoluzione massima
- `jpegQuality` regola il compromesso tra qualità e peso
- `pdfMaxWidthMm` e `pdfMaxHeightMm` regolano lo spazio occupato nel PDF

## Filosofia
Il codice è pensato per:
- essere letto
- essere capito
- essere modificato anche a distanza di anni
