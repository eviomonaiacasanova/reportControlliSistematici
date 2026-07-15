# Generazione PDF

Sono disponibili due modalità:

## PDF modulo vuoto
- Nessuno stato selezionato
- Usato per stampa e compilazione manuale

## PDF stato attuale
- Riporta tutti gli stati e le note
- Include:
  - centrale
  - anno
  - preposto
  - operatori
  - data generazione

---

## Scelte tecniche

- Il logo è incorporato in base64
- Questo garantisce il funzionamento:
  - senza server
  - senza internet
  - con doppio click

Il layout è volutamente semplice e stampabile.

---

## Immagini

- JPG, PNG, WebP e BMP vengono convertiti in JPEG al caricamento.
- Le proporzioni originali vengono mantenute sia nell'anteprima sia nel PDF.
- Il lato massimo è limitato a 1280 px e la qualità JPEG è 0,78.
- Anche le foto presenti nei vecchi JSON vengono ottimizzate quando il file viene aperto.
- Nel PDF di stato ogni foto compare nella colonna `Foto` della riga del proprio controllo.
- L'altezza della riga si adatta automaticamente fino a contenere tutte le foto del controllo.

Tutti questi valori sono raccolti in `CONFIG` all'inizio di `js/image-utils.js`.
