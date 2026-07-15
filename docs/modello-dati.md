# Modello dati (JSON)

Ogni file JSON rappresenta:
- una centrale
- un anno di controlli

Esempio nome file esportato: `CENTRALEA_2026_20260715_1430.json` (`AAAAMMGG_HHMM`).


---

## Struttura generale

```json
{
  "meta": {
    "centraleNome": "Centrale A",
    "anno": "2026",
    "preposto": "Mario Rossi",
    "operatori": "Rossi, Bianchi",
    "dataInizio": "2026-03-12",
    "dataFine": "",
    "oreFunzionamento": 1250
  },
  "sezioni": []
}
```

Le immagini dei controlli sono salvate nell'array `photos` già normalizzate in JPEG. Ogni elemento contiene `dataUrl`, nome, dimensioni, peso indicativo e il flag `optimized`. I vecchi campi `photoDataUrl` e `photoName` vengono ancora letti in importazione, ma poi svuotati per evitare di duplicare la prima immagine nel JSON.
