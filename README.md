# Report Controlli Sistematici

Questo progetto nasce per gestire i **controlli sistematici annuali** delle centrali idroelettriche.

L’obiettivo è sostituire:

- sostituire file Excel difficili da gestire
- dare struttura e standardizzazione nella comunicazione
- visualizzazione dello stato corrente dei lavori

con uno strumento **semplice, locale e robusto**, utilizzabile anche da personale non tecnico.

Non richiede installazioni, server o connessione internet.

---

## Caratteristiche principali

- Tutto **offline**, funziona anche con file su PC locale
- Un file **HTML + JS**
- Salvataggio dati in **JSON**
- Struttura per **sezioni e checklist**
- Stati chiari per ogni controllo (OK / KO / NA / TODO)
- Note obbligatorie in caso di KO
- Generazione PDF:
  - modulo vuoto (per stampa e compilazione a mano)
  - stato attuale (per report finale)
- Codice leggibile, niente framework

---

## Filosofia del progetto

- Un file JSON = **una centrale + un anno**
- Il preposto lavora su un file unico
- Gli operatori compilano sul campo anche su carta, i dati vengono poi integrati nella pagina

---

## Struttura del progetto

```

/
├─ index.html
├─ app.js
├─ pdf.js
├─ style.css
├─ README.md
├─ todo.md
├─ assets/
│  ├─ favicon.inline.js
│  ├─ favicon.png
│  ├─ logo.inline.js
│  └─ logo.jpg
├─ docs/
│  ├─ modello-dati.md
│  ├─ flusso-operativo.md
│  ├─ pdf.md
│  └─ manutenzione.md
├─ dist/
│  └─ single.html
├─ examples/
│  ├─ CENTRALE_IDRO_2026.json
│  ├─ CENTRALE_IDRO_2026_modulo_vuoto.pdf
│  └─ CENTRALE_IDRO_2026_stato.pdf
├─ libs/
│  ├─ jspdf-autotable.min.js
│  ├─ jspdf.umd.min.js
│  └─ jspdf.umd.min.js.map
└─ scripts/
   ├─ build-single-html.sh
   ├─ inline-favicon.sh
   └─ update-logo-base64dataurl.sh
```

---

## Avvio

Aprire `index.html` con doppio click.  
Non serve altro.

---

## Note importanti

- Il logo nel PDF è incorporato (base64) per garantire il funzionamento offline (ho limitazioni di sicurezza del browser)
- Il file `assets/logo.jpg` viene usato solo per la UI
- Il JSON può essere letto e ispezionato anche con editor esterni

---

## Stato del progetto

Utilizzato in fase di prova su centrali reali.  
Il codice è volutamente semplice e modificabile.
