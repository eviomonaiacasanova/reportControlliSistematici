/* ==========================================================================
   CONTROLLI SISTEMATICI - app.js
   Offline, file-based, zero framework.

   Funzioni principali:
   - Import JSON / Export JSON
   - Render sezioni + controlli (dinamico da JSON)
   - Stati: todo / ok / ko / na (KO => note obbligatorie)
   - CRUD: aggiungi/rinomina/sposta/elimina controlli e sezioni
   - PDF: modulo vuoto / stato attuale
   ========================================================================== */

/* ========================================================================== */
/* 01) STATE                                                                  */
/* ========================================================================== */

let model = null;          // JSON in memoria
let openedFileName = "";   // per suggerire il nome in export
let showCompleted = true;  // mostra/nasconde controlli non "todo"
const MAX_PHOTOS = 3;
const APP_VERSION = "1.3.1"; // versione del programma, gestita in un solo punto


/* ========================================================================== */
/* 02) DATE & IDS                                                              */
/* ========================================================================== */

// Raccoglie tutti gli identificativi di sezioni e controlli presenti nel modello.
function collectAllIds(m) {
  const set = new Set();
  for (const s of m.sezioni || []) {
    set.add(s.id);
    for (const it of s.items || []) set.add(it.id);
  }
  return set;
}

// Genera un identificativo basato su data, ora e una componente casuale.
function makeId(prefix) {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  const rnd = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${y}${m}${day}_${hh}${mm}${ss}_${rnd}`;
}

// Genera un identificativo che non sia già presente nell'insieme ricevuto.
function makeUniqueId(prefix, existingSet) {
  let id = makeId(prefix);
  while (existingSet.has(id)) id = makeId(prefix);
  existingSet.add(id);
  return id;
}

// Converte una data nel formato leggibile GG/MM/AAAA.
function formatDateDDMMYYYY(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Converte una data nel formato compatto AAAAMMGG usato nei nomi dei file.
function formatDateYYYYMMDD(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  return `${year}${month}${day}`;
}

// Converte una data nel formato AAAAMMGG_HHMM usato per distinguere gli export.
function formatDateTimeYYYYMMDDHHMM(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${formatDateYYYYMMDD(d)}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

// Converte una data ISO AAAA-MM-GG nel formato GG/MM/AAAA.
function formatYmdToDmy(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Converte una data GG/MM/AAAA nel formato ISO AAAA-MM-GG.
function formatDmyToYmd(dmy) {
  const m = String(dmy || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Normalizza i diversi formati di data accettati nel formato GG/MM/AAAA.
function normalizeDateString(value) {
  const str = String(value ?? "").trim();
  if (!str) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return formatYmdToDmy(str);
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) return formatDateDDMMYYYY(d);
  return str;
}

// Svuota i campi foto legacy dopo la migrazione all'array photos.
function syncLegacyPhotoFields(it) {
  // I campi legacy duplicavano per intero la prima foto nel JSON.
  // Vengono ancora letti in normalizeModel, ma non sono piu salvati.
  it.photoDataUrl = "";
  it.photoName = "";
}

// Uniforma la struttura di una foto anche quando il modulo immagini non è disponibile.
function normalizePhotoRecord(photo) {
  if (window.ReportImages) return window.ReportImages.normalizePhotoRecord(photo);
  return {
    dataUrl: String(photo?.dataUrl || ""),
    name: String(photo?.name || "foto")
  };
}

// Ottimizza tutte le foto del modello e restituisce eventuali errori incontrati.
async function optimizeModelPhotos(targetModel) {
  if (!window.ReportImages) return { optimized: 0, errors: [] };

  let optimized = 0;
  const errors = [];

  for (const section of targetModel.sezioni || []) {
    for (const item of section.items || []) {
      const prepared = [];
      for (const photo of item.photos || []) {
        try {
          const result = await window.ReportImages.ensureOptimizedPhoto(photo);
          if (result.dataUrl !== photo.dataUrl) optimized++;
          prepared.push(result);
        } catch (error) {
          prepared.push(normalizePhotoRecord(photo));
          errors.push(`${photo.name || "foto"}: ${error.message}`);
        }
      }
      item.photos = prepared;
      syncLegacyPhotoFields(item);
    }
  }

  return { optimized, errors };
}

// Converte il valore di un campo data HTML nel formato usato dal modello.
function inputValueToDmy(value) {
  if (!value) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  return formatYmdToDmy(value);
}

// Restituisce la data corrente nel formato GG/MM/AAAA.
function nowDmy() {
  return formatDateDDMMYYYY(new Date());
}

// Aggiunge uno zero iniziale ai numeri composti da una sola cifra.
function pad2(n) {
  return String(n).padStart(2, "0");
}

// Restituisce una copia dell'array ordinata in base al campo order.
function sortByOrder(arr) {
  return [...arr].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* ========================================================================== */
/* 03) UI ENABLE / SUBTITLE                                                    */
/* ========================================================================== */

// Abilita o disabilita i comandi che richiedono un modello caricato.
function enableUi(enabled) {
  const ids = [
    "btnSave", "btnResetStates", "btnPdfBlank", "btnPdfState",
    "btnExpandAll", "btnCollapseAll", "btnAddSection",
    "btnToggleCompleted",
    "metaCentraleNome", "metaAnno", "metaPreposto",
    "metaDataInizio", "metaDataFine", "metaOreFunzionamento", "metaNoteGenerali",
    "metaOperatori"
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.tagName === "BUTTON") el.disabled = !enabled;
    else el.disabled = !enabled;
  }
}

// Aggiorna il sottotitolo con centrale, anno e nome del file corrente.
function updateSubtitle() {
  const sub = document.getElementById("subtitle");
  const nome = model.meta.centraleNome || "(centrale non impostata)";
  const anno = model.meta.anno || "";
  sub.textContent = `${nome} | ${anno} | File: ${openedFileName || "non salvato"}`;
}

// Mostra il messaggio iniziale quando nessun file è stato caricato.
function setSubtitleEmpty() {
  const sub = document.getElementById("subtitle");
  if (sub) sub.textContent = "Apri un file JSON per iniziare.";
}

/* ========================================================================== */
/* 04) MODEL VALIDATION / NORMALIZATION                                        */
/* ========================================================================== */

// Completa e normalizza il modello importato per renderlo compatibile con l'app.
function normalizeModel(m) {
  // Normalizzazione minima per evitare undefined e per garantire funzioni UI (riordino, ecc.)
  m.app = m.app || { schemaVersion: 1 };
  m.app.schemaVersion = 2;
  m.meta = m.meta || {};
  m.sezioni = Array.isArray(m.sezioni) ? m.sezioni : [];
  m.audit = m.audit || {};

  if (m.meta.dataInizio !== undefined) m.meta.dataInizio = normalizeDateString(m.meta.dataInizio);
  if (m.meta.dataFine !== undefined) m.meta.dataFine = normalizeDateString(m.meta.dataFine);
  if (m.audit.lastModified !== undefined) m.audit.lastModified = normalizeDateString(m.audit.lastModified);

  // Se mancano order (file vecchi), li assegniamo in base all'ordine corrente dell'array
  let secOrder = 10;

  for (const s of m.sezioni) {
    // id/titolo/order
    if (!s.id) s.id = makeUniqueId("sec", collectAllIds(m)); // fallback raro
    if (s.titolo === undefined) s.titolo = "";
    if (s.order === undefined || s.order === null || Number.isNaN(Number(s.order))) {
      s.order = secOrder;
    } else {
      s.order = Number(s.order);
    }
    secOrder = Math.max(secOrder, s.order) + 10;

    // items
    s.items = Array.isArray(s.items) ? s.items : [];
    let itemOrder = 10;
    const itemOrders = [];
    let needsReorder = false;

    for (const it of s.items) {
      if (!it.id) it.id = makeUniqueId("itm", collectAllIds(m));
      if (it.testo === undefined) it.testo = "";

      if (!it.stato) it.stato = "todo";
      if (it.note === undefined) it.note = "";
      if (it.photoDataUrl === undefined) it.photoDataUrl = "";
      if (it.photoName === undefined) it.photoName = "";
      if (!Array.isArray(it.photos)) it.photos = [];
      if (!it.photos.length && it.photoDataUrl) {
        it.photos = [{ dataUrl: it.photoDataUrl, name: it.photoName || "foto" }];
      }
      it.photos = it.photos
        .filter(p => p && p.dataUrl)
        .slice(0, MAX_PHOTOS)
        .map(normalizePhotoRecord);
      syncLegacyPhotoFields(it);
      if (it.timestamp === undefined) it.timestamp = "";
      if (it.timestamp) it.timestamp = normalizeDateString(it.timestamp);

      if (it.order === undefined || it.order === null || Number.isNaN(Number(it.order))) {
        it.order = itemOrder;
        needsReorder = true;
      } else {
        it.order = Number(it.order);
      }
      itemOrders.push(it.order);
      itemOrder = Math.max(itemOrder, it.order) + 10;
    }

    if (!needsReorder) {
      const uniq = new Set(itemOrders);
      if (uniq.size !== itemOrders.length) needsReorder = true;
    }

    if (needsReorder && s.items.length) {
      let order = 10;
      for (const it of s.items) {
        it.order = order;
        order += 10;
      }
    }
  }

  return m;
}

// Verifica che il JSON contenga la struttura minima richiesta dall'app.
function validateModel(m) {
  if (!m || typeof m !== "object") return "JSON non valido.";
  if (!m.meta || !m.sezioni) return "Mancano meta o sezioni.";
  if (!Array.isArray(m.sezioni)) return "sezioni deve essere un array.";
  return "";
}

/* ========================================================================== */
/* 05) AUDIT                                                                   */
/* ========================================================================== */

// Aggiorna i dati di audit dopo una modifica al modello.
function touchAudit() {
  if (!model.audit) model.audit = {};
  model.audit.lastModified = nowDmy();
  model.audit.lastModifiedBy = (model.meta.operatori || model.meta.preposto || "").trim();
}

/* ========================================================================== */
/* 06) META BINDING                                                            */
/* ========================================================================== */

// Collega i campi dei dati generali alle rispettive proprietà del modello.
function bindMeta() {
  const fields = [
    ["metaCentraleNome", "centraleNome"],
    ["metaAnno", "anno"],
    ["metaPreposto", "preposto"],
    ["metaOperatori", "operatori"],
    ["metaDataInizio", "dataInizio"],
    ["metaDataFine", "dataFine"],
    ["metaOreFunzionamento", "oreFunzionamento"],
    ["metaNoteGenerali", "noteGenerali"]
  ];
  for (const [id, key] of fields) {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      if (!model) return;
      if (key === "anno") {
        model.meta[key] = Number(el.value);
      } else if (key === "dataInizio" || key === "dataFine") {
        model.meta[key] = inputValueToDmy(el.value);
      } else if (key === "oreFunzionamento") {
        model.meta[key] = el.value === "" ? "" : Number(el.value);
      } else {
        model.meta[key] = el.value;
      }
      touchAudit();
      updateSubtitle();
    });
  }
}


// Riporta nei campi dell'interfaccia i dati generali presenti nel modello.
function renderMeta() {
  document.getElementById("metaCentraleNome").value = model.meta.centraleNome ?? "";
  document.getElementById("metaAnno").value = model.meta.anno ?? "";
  document.getElementById("metaPreposto").value = model.meta.preposto ?? "";
  document.getElementById("metaOperatori").value = model.meta.operatori || "";
  document.getElementById("metaDataInizio").value = formatDmyToYmd(model.meta.dataInizio ?? "");
  document.getElementById("metaDataFine").value = formatDmyToYmd(model.meta.dataFine ?? "");
  document.getElementById("metaOreFunzionamento").value = model.meta.oreFunzionamento ?? "";
  document.getElementById("metaNoteGenerali").value = model.meta.noteGenerali ?? "";
}

// Svuota tutti i campi dei dati generali mostrati nell'interfaccia.
function clearMetaInputs() {
  document.getElementById("metaCentraleNome").value = "";
  document.getElementById("metaAnno").value = "";
  document.getElementById("metaPreposto").value = "";
  document.getElementById("metaOperatori").value = "";
  document.getElementById("metaDataInizio").value = "";
  document.getElementById("metaDataFine").value = "";
  document.getElementById("metaOreFunzionamento").value = "";
  document.getElementById("metaNoteGenerali").value = "";
}

/* ========================================================================== */
/* 07) SECTION STATS / PROGRESS                                                */
/* ========================================================================== */

// Conta i controlli della sezione raggruppandoli per stato.
function computeSectionBadges(section) {
  const counts = { todo: 0, ok: 0, ko: 0, na: 0 };
  for (const it of section.items || []) {
    const st = it.stato || "todo";
    if (counts[st] === undefined) counts.todo++;
    else counts[st]++;
  }
  return counts;
}

// Calcola quanti controlli della sezione sono completati e la loro percentuale.
function computeSectionProgress(section) {
  const total = (section.items || []).length;
  if (total === 0) return { total: 0, done: 0, pct: 0 };

  let done = 0;
  for (const it of section.items) {
    const st = it.stato || "todo";
    if (st !== "todo") done++;
  }
  const pct = Math.round((done / total) * 100);
  return { total, done, pct };
}

// Crea un badge visivo per mostrare il conteggio di uno stato.
function makeBadge(kind, text) {
  const span = document.createElement("span");
  span.className = `badge ${kind}`;
  span.textContent = text;
  return span;
}

// Crea la barra di avanzamento di una sezione.
function makeProgressNode(pct) {
  const wrap = document.createElement("div");
  wrap.className = "progress";

  const bar = document.createElement("div");
  bar.style.width = `${pct}%`;

  wrap.appendChild(bar);
  return wrap;
}

// Calcola lo stato di avanzamento complessivo di tutte le sezioni.
function computeGlobalProgress() {
  if (!model || !Array.isArray(model.sezioni)) {
    return { done: 0, total: 0, pct: 0, ok: 0, ko: 0, todo: 0, na: 0 };
  }

  let ok = 0, ko = 0, todo = 0, na = 0;

  for (const s of model.sezioni) {
    for (const it of (s.items || [])) {
      const st = (it.stato || "todo");
      if (st === "ok") ok++;
      else if (st === "ko") ko++;
      else if (st === "na") na++;
      else todo++;
    }
  }

  // escludo NA dal totale "applicabile"
  const total = ok + ko + todo;
  const done = ok + ko;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return { done, total, pct, ok, ko, todo, na };
}

// Aggiorna la barra e i conteggi dell'avanzamento globale.
function renderGlobalProgress() {
  const fill = document.getElementById("globalProgressFill");
  const txt = document.getElementById("globalProgressText");
  const counts = document.getElementById("globalProgressCounts");

  if (!fill || !txt || !counts) return;

  const p = computeGlobalProgress();
  fill.style.width = `${p.pct}%`;
  txt.textContent = `${p.pct}%`;
  counts.textContent = p.total > 0
    ? `(${p.done}/${p.total} completati, NA: ${p.na})`
    : `(nessun controllo)`;
}


/* ========================================================================== */
/* 08) FINDERS                                                                 */
/* ========================================================================== */

// Cerca un controllo tramite gli identificativi della sezione e del controllo.
function findItem(sectionId, itemId) {
  const s = findSection(sectionId);
  if (!s) return null;
  return (s.items || []).find(it => it.id === itemId);
}

// Cerca una sezione tramite il suo identificativo.
function findSection(sectionId) {
  return model.sezioni.find(s => s.id === sectionId);
}

/* ========================================================================== */
/* 09) RENDER CORE                                                             */
/* ========================================================================== */

// Restituisce gli identificativi delle sezioni attualmente aperte.
function getOpenSectionIds() {
  return Array.from(document.querySelectorAll("details.section"))
    .filter(d => d.open)
    .map(d => d.dataset.sectionId);
}

// Crea un pulsante per impostare lo stato di un controllo.
function makeStateButton(kind, label, isActive, onClick) {
  const b = document.createElement("button");
  b.className = `state-btn kind-${kind}` + (isActive ? " active" : "");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// Apre nell'interfaccia la sezione indicata.
function openSection(sectionId) {
  const el = document.querySelector(`details.section[data-section-id="${sectionId}"]`);
  if (el) el.open = true;
}

// Costruisce l'interfaccia completa di un singolo controllo.
function renderItem(sectionId, itemId) {
  const item = findItem(sectionId, itemId);

  const wrap = document.createElement("div");
  wrap.className = "item";
  wrap.dataset.itemId = item.id;

  const grid = document.createElement("div");
  grid.className = "item-grid";

  // --- Riga titolo + strumenti (a destra del titolo) ---
  const titleRow = document.createElement("div");
  titleRow.className = "item-title-row";

  const titleLeft = document.createElement("div");
  titleLeft.className = "item-title-left";

  const text = document.createElement("div");
  text.className = "item-text";
  text.textContent = item.testo;

  titleLeft.appendChild(text);

  const tools = document.createElement("div");
  tools.className = "item-tools";

  const btnUp = document.createElement("button");
  btnUp.className = "icon-btn";
  btnUp.type = "button";
  btnUp.title = "Sposta su";
  btnUp.textContent = "⬆️";
  btnUp.disabled = !canMove(sectionId, itemId, "up");
  btnUp.addEventListener("click", () => moveItem(sectionId, itemId, "up"));

  const btnDown = document.createElement("button");
  btnDown.className = "icon-btn";
  btnDown.type = "button";
  btnDown.title = "Sposta giù";
  btnDown.textContent = "⬇️";
  btnDown.disabled = !canMove(sectionId, itemId, "down");
  btnDown.addEventListener("click", () => moveItem(sectionId, itemId, "down"));

  const btnEdit = document.createElement("button");
  btnEdit.className = "icon-btn";
  btnEdit.type = "button";
  btnEdit.title = "Rinomina";
  btnEdit.textContent = "✏️";
  btnEdit.addEventListener("click", () => renameItem(sectionId, itemId));

  const btnClone = document.createElement("button");
  btnClone.className = "icon-btn";
  btnClone.type = "button";
  btnClone.title = "Duplica controllo";
  btnClone.textContent = "⧉";
  btnClone.addEventListener("click", () => cloneItem(sectionId, itemId));

  const btnDel = document.createElement("button");
  btnDel.className = "icon-btn danger";
  btnDel.type = "button";
  btnDel.title = "Elimina";
  btnDel.textContent = "🗑️";
  btnDel.addEventListener("click", () => deleteItem(sectionId, itemId));

  tools.appendChild(btnEdit);
  tools.appendChild(btnClone);
  tools.appendChild(btnUp);
  tools.appendChild(btnDown);
  tools.appendChild(btnDel);

  titleRow.appendChild(titleLeft);
  titleRow.appendChild(tools);

  // --- Note ---
  const note = document.createElement("textarea");
  note.className = "note";
  note.rows = 2;
  note.placeholder = "Note (obbligatorie se KO)";
  note.value = item.note ?? "";
  if ((item.stato || "todo") === "ko" && !note.value.trim()) {
    note.classList.add("required");
  }

  note.addEventListener("input", () => {
    const it = findItem(sectionId, itemId);
    it.note = note.value;

    if (it.stato === "ko") {
      if (!it.note.trim()) note.classList.add("required");
      else note.classList.remove("required");
    }

    it.timestamp = nowDmy();
    touchAudit();
  });

  // --- Stati: in fondo a destra ---
  const footer = document.createElement("div");
  footer.className = "item-footer";

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const st = item.stato || "todo";
  actions.appendChild(makeStateButton("todo", "Da fare", st === "todo", () => setState(sectionId, itemId, "todo")));
  actions.appendChild(makeStateButton("ok", "OK", st === "ok", () => setState(sectionId, itemId, "ok")));
  actions.appendChild(makeStateButton("ko", "KO", st === "ko", () => setState(sectionId, itemId, "ko")));
  actions.appendChild(makeStateButton("na", "N.A.", st === "na", () => setState(sectionId, itemId, "na")));

  footer.appendChild(actions);

  // --- Allegato foto (fino a 3 per controllo) ---
  const attachment = document.createElement("div");
  attachment.className = "item-attachment";

  const photoInput = document.createElement("input");
  photoInput.type = "file";
  photoInput.accept = "image/jpeg,image/png,image/webp,image/bmp,.bmp";
  photoInput.className = "item-photo-input";
  photoInput.title = "Allega una foto";
  photoInput.hidden = true;

  let targetPhotoIndex = -1;

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;

    const selectedIndex = targetPhotoIndex;
    photoInput.value = "";
    photoInput.disabled = true;
    addLabel.textContent = "Ottimizzazione in corso...";

    try {
      if (!window.ReportImages) throw new Error("Modulo immagini non caricato.");
      const optimizedPhoto = await window.ReportImages.optimizeFile(file);
      const it = findItem(sectionId, itemId);
      const photos = Array.isArray(it.photos) ? [...it.photos] : [];
      const idx = selectedIndex < 0 ? photos.length : selectedIndex;
      photos[idx] = optimizedPhoto;
      it.photos = photos.filter(p => p && p.dataUrl).slice(0, MAX_PHOTOS);
      syncLegacyPhotoFields(it);
      touchAudit();
      rerenderAll();
    } catch (error) {
      alert(`Impossibile importare l'immagine:\n${error.message}`);
      photoInput.disabled = false;
      addLabel.textContent = `Fino a ${MAX_PHOTOS} foto - JPG, PNG, WebP o BMP`;
    } finally {
      targetPhotoIndex = -1;
    }
  });

  attachment.appendChild(photoInput);

  const photosWrap = document.createElement("div");
  photosWrap.className = "item-photos";

  const photos = Array.isArray(item.photos) ? item.photos : [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    if (!p || !p.dataUrl) continue;

    const card = document.createElement("div");
    card.className = "item-photo-card";

    const box = document.createElement("button");
    box.type = "button";
    box.className = "item-photo-box has-photo";
    box.title = "Sostituisci foto";
    box.addEventListener("click", () => {
      targetPhotoIndex = i;
      photoInput.click();
    });

    const preview = document.createElement("img");
    preview.className = "item-photo-preview";
    preview.alt = "Anteprima foto";
    preview.src = p.dataUrl;

    const btnClear = document.createElement("button");
    btnClear.type = "button";
    btnClear.className = "item-photo-clear";
    btnClear.textContent = "×";
    btnClear.title = "Rimuovi foto";
    btnClear.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    btnClear.addEventListener("click", () => {
      const it = findItem(sectionId, itemId);
      const list = Array.isArray(it.photos) ? [...it.photos] : [];
      list.splice(i, 1);
      it.photos = list;
      syncLegacyPhotoFields(it);
      touchAudit();
      rerenderAll();
    });

    const label = document.createElement("span");
    label.className = "item-photo-label";
    const details = window.ReportImages
      ? window.ReportImages.describePhoto(p)
      : (p.name || "foto");
    label.textContent = `Foto ${i + 1}: ${details}`;

    box.appendChild(preview);
    box.appendChild(btnClear);
    card.appendChild(box);
    card.appendChild(label);
    photosWrap.appendChild(card);
  }

  const addCard = document.createElement("div");
  addCard.className = "item-photo-card";

  const addBox = document.createElement("button");
  addBox.type = "button";
  addBox.className = "item-photo-box";
  addBox.title = "Aggiungi foto";
  addBox.innerHTML = "<span class=\"item-photo-icon\">📷</span><span class=\"item-photo-text\">Aggiungi foto</span>";
  addBox.disabled = photos.length >= MAX_PHOTOS;
  addBox.addEventListener("click", () => {
    if (photos.length >= MAX_PHOTOS) return;
    targetPhotoIndex = photos.length;
    photoInput.click();
  });

  const addLabel = document.createElement("span");
  addLabel.className = "item-photo-label";
  addLabel.textContent = photos.length >= MAX_PHOTOS
    ? "Limite massimo raggiunto"
    : `Fino a ${MAX_PHOTOS} foto - JPG, PNG, WebP o BMP`;

  addCard.appendChild(addBox);
  addCard.appendChild(addLabel);
  photosWrap.appendChild(addCard);

  attachment.appendChild(photosWrap);

  grid.appendChild(titleRow);
  grid.appendChild(note);
  grid.appendChild(attachment);
  grid.appendChild(footer);

  wrap.appendChild(grid);
  return wrap;
}

// Stabilisce se il controllo deve essere visibile con il filtro corrente.
function shouldRenderItem(item) {
  if (showCompleted) return true;
  return (item.stato || "todo") === "todo";
}

// Aggiorna l'etichetta del pulsante che mostra o nasconde i completati.
function updateToggleCompletedLabel() {
  const btn = document.getElementById("btnToggleCompleted");
  if (!btn) return;
  btn.textContent = showCompleted ? "Nascondi completati" : "Mostra completati";
}

// Disegna tutte le sezioni conservando quelle che erano già aperte.
function renderSections(openSet = new Set()) {
  const container = document.getElementById("sections");
  container.innerHTML = "";

  const sectionsSorted = sortByOrder(model.sezioni);

  if (sectionsSorted.length === 0) {
    container.innerHTML = `<div class="empty-hint">Nessuna sezione presente.</div>`;
    return;
  }

  for (const section of sectionsSorted) {
    // --- wrapper sezione ---
    const details = document.createElement("details");
    details.className = "section";
    details.dataset.sectionId = section.id;
    details.open = openSet.has(section.id);

    // --- summary ---
    const summary = document.createElement("summary");

    // ====== LEFT: titolo + tools sezione ======
    const left = document.createElement("div");
    left.className = "section-title";

    const titleText = document.createElement("div");
    titleText.className = "section-title-text";
    titleText.textContent = section.titolo;

    const secTools = document.createElement("div");
    secTools.className = "section-tools";

    const sEdit = document.createElement("button");
    sEdit.className = "icon-btn";
    sEdit.type = "button";
    sEdit.title = "Rinomina sezione";
    sEdit.textContent = "✏️";
    sEdit.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      renameSection(section.id);
    });

    const sClone = document.createElement("button");
    sClone.className = "icon-btn";
    sClone.type = "button";
    sClone.title = "Duplica sezione";
    sClone.textContent = "⧉";
    sClone.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      cloneSection(section.id);
    });

    const sUp = document.createElement("button");
    sUp.className = "icon-btn";
    sUp.type = "button";
    sUp.title = "Sposta sezione su";
    sUp.textContent = "⬆️";
    sUp.disabled = !canMoveSection(section.id, "up");
    sUp.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      moveSection(section.id, "up");
    });

    const sDown = document.createElement("button");
    sDown.className = "icon-btn";
    sDown.type = "button";
    sDown.title = "Sposta sezione giù";
    sDown.textContent = "⬇️";
    sDown.disabled = !canMoveSection(section.id, "down");
    sDown.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      moveSection(section.id, "down");
    });

    const sDel = document.createElement("button");
    sDel.className = "icon-btn danger";
    sDel.type = "button";
    sDel.title = "Elimina sezione (perde i controlli figli)";
    sDel.textContent = "🗑️";
    sDel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteSectionDangerous(section.id);
    });

    secTools.appendChild(sEdit);
    secTools.appendChild(sClone);
    secTools.appendChild(sUp);
    secTools.appendChild(sDown);
    secTools.appendChild(sDel);

    left.appendChild(titleText);
    left.appendChild(secTools);
    // ====== /LEFT ======

    // --- RIGHT: progress ---
    const prog = computeSectionProgress(section);
    const right = document.createElement("div");
    right.className = "summary-right";

    const progLabel = document.createElement("div");
    progLabel.className = "progress-label";
    progLabel.textContent = `${prog.done}/${prog.total} (${prog.pct}%)`;

    const progBar = makeProgressNode(prog.pct);

    right.appendChild(progLabel);
    right.appendChild(progBar);

    // --- badges ---
    const badges = document.createElement("div");
    badges.className = "badges";
    const c = computeSectionBadges(section);
    badges.appendChild(makeBadge("todo", `Da fare ${c.todo}`));
    badges.appendChild(makeBadge("ok", `OK ${c.ok}`));
    badges.appendChild(makeBadge("ko", `KO ${c.ko}`));
    badges.appendChild(makeBadge("na", `N.A. ${c.na}`));

    summary.appendChild(left);
    summary.appendChild(right);
    summary.appendChild(badges);

    // --- body ---
    const body = document.createElement("div");
    body.className = "section-body";

    // azioni sezione nel body
    const rowActions = document.createElement("div");
    rowActions.className = "row-actions";

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-small";
    addBtn.type = "button";
    addBtn.textContent = "+ Aggiungi controllo";
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addControl(section.id);
      openSection(section.id);
    });

    const checkAllBtn = document.createElement("button");
    checkAllBtn.className = "btn btn-small section-check-all";
    checkAllBtn.type = "button";
    checkAllBtn.textContent = "✓ Check tutti";
    checkAllBtn.title = "Imposta tutti i controlli della sezione su OK";
    checkAllBtn.disabled = !(section.items || []).length;
    checkAllBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setSectionState(section.id, "ok");
    });

    const uncheckAllBtn = document.createElement("button");
    uncheckAllBtn.className = "btn btn-small section-uncheck-all";
    uncheckAllBtn.type = "button";
    uncheckAllBtn.textContent = "○ Uncheck tutti";
    uncheckAllBtn.title = "Riporta tutti i controlli della sezione su Da fare";
    uncheckAllBtn.disabled = !(section.items || []).length;
    uncheckAllBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setSectionState(section.id, "todo");
    });

    const actionButtons = document.createElement("div");
    actionButtons.className = "section-action-buttons";
    actionButtons.appendChild(addBtn);
    actionButtons.appendChild(checkAllBtn);
    actionButtons.appendChild(uncheckAllBtn);

    const small = document.createElement("div");
    small.className = "small-muted";
    small.textContent = "KO richiede note obbligatorie.";

    rowActions.appendChild(actionButtons);
    rowActions.appendChild(small);
    body.appendChild(rowActions);

    // items
    const itemsSorted = sortByOrder(section.items || []);
    for (const item of itemsSorted) {
      if (!shouldRenderItem(item)) continue;
      body.appendChild(renderItem(section.id, item.id));
    }

    details.appendChild(summary);
    details.appendChild(body);
    container.appendChild(details);
  }
}

// Ridisegna l'intera interfaccia mantenendo lo stato di apertura delle sezioni.
function rerenderAll() {
  // salva quali sezioni sono aperte (prima che la UI venga ricreata)
  const openIds = getOpenSectionIds();
  const openSet = new Set(openIds);

  updateSubtitle();
  updateToggleCompletedLabel();
  renderMeta();
  renderGlobalProgress();
  renderSections(openSet);
}

/* ========================================================================== */
/* 10) ADD / EDIT ITEMS & SECTIONS                                             */
/* ========================================================================== */

// Aggiunge un nuovo controllo vuoto alla sezione indicata.
function addControl(sectionId) {
  const section = findSection(sectionId);
  if (!section) return;

  const testo = prompt(`Nuovo controllo in "${section.titolo}":`);
  if (!testo || !testo.trim()) return;

  const existing = collectAllIds(model);
  const newId = makeUniqueId("itm", existing);

  const maxOrder = Math.max(0, ...(section.items || []).map(it => it.order ?? 0));
  section.items = section.items || [];
  section.items.push({
    id: newId,
    testo: testo.trim(),
    order: maxOrder + 10,
    stato: "todo",
    note: "", timestamp: "",
    photos: [],
    photoDataUrl: "",
    photoName: ""
  });

  touchAudit();
  rerenderAll();
  openSection(sectionId);
}

// Aggiunge una nuova sezione vuota al modello.
function addSection() {
  const titolo = prompt("Titolo nuova sezione:");
  if (!titolo || !titolo.trim()) return;

  const existing = collectAllIds(model);
  const newId = makeUniqueId("sec", existing);

  const maxOrder = Math.max(0, ...model.sezioni.map(s => s.order ?? 0));
  model.sezioni.push({
    id: newId,
    titolo: titolo.trim(),
    order: maxOrder + 10,
    items: []
  });

  touchAudit();
  rerenderAll();
  openSection(newId);
}

// Verifica se un controllo può essere spostato nella direzione richiesta.
function canMove(sectionId, itemId, direction) {
  const s = findSection(sectionId);
  if (!s || !Array.isArray(s.items)) return false;

  const itemsSorted = sortByOrder(s.items);
  const idx = itemsSorted.findIndex(x => x.id === itemId);
  if (idx < 0) return false;

  if (direction === "up") return idx > 0;
  return idx < itemsSorted.length - 1;
}

// Elimina un controllo dopo aver chiesto conferma all'utente.
function deleteItem(sectionId, itemId) {
  const s = findSection(sectionId);
  if (!s || !Array.isArray(s.items)) return;

  const it = findItem(sectionId, itemId);
  if (!it) return;

  const ok = confirm(`Eliminare questo controllo?\n\n- ${it.testo}`);
  if (!ok) return;

  s.items = s.items.filter(x => x.id !== itemId);

  touchAudit();
  rerenderAll();
}

// Sposta un controllo scambiandone l'ordine con quello adiacente.
function moveItem(sectionId, itemId, direction) {
  const s = findSection(sectionId);
  if (!s || !Array.isArray(s.items)) return;

  const itemsSorted = sortByOrder(s.items);
  const idx = itemsSorted.findIndex(x => x.id === itemId);
  if (idx < 0) return;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= itemsSorted.length) return;

  const a = itemsSorted[idx];
  const b = itemsSorted[swapIdx];

  // scambio order (semplice, stabile)
  const ao = a.order ?? 0;
  const bo = b.order ?? 0;
  a.order = bo;
  b.order = ao;

  touchAudit();
  rerenderAll();
}

// Modifica il testo descrittivo di un controllo.
function renameItem(sectionId, itemId) {
  const it = findItem(sectionId, itemId);
  if (!it) return;

  const nuovo = prompt("Rinomina controllo:", it.testo || "");
  if (nuovo === null) return; // annullato
  const txt = nuovo.trim();
  if (!txt) return;

  it.testo = txt;
  it.timestamp = nowDmy();
  touchAudit();
  rerenderAll();
}

// Riassegna valori di ordinamento regolari a sezioni e controlli.
function normalizeSectionAndItemOrders() {
  const sectionsSorted = sortByOrder(model.sezioni);
  let secOrder = 10;
  for (const section of sectionsSorted) {
    section.order = secOrder;
    secOrder += 10;

    const itemsSorted = sortByOrder(section.items || []);
    let itemOrder = 10;
    for (const item of itemsSorted) {
      item.order = itemOrder;
      itemOrder += 10;
    }
  }
}

// Duplica un controllo all'interno della stessa sezione.
function cloneItem(sectionId, itemId) {
  const original = findItem(sectionId, itemId);
  if (!original) return;
  const nuovo = prompt("Duplica controllo:", `${original.testo || ""} (copia)`);
  if (nuovo === null) return;
  const testo = nuovo.trim();
  if (!testo) return;

  const s = findSection(sectionId);
  if (!s) return;

  const existing = collectAllIds(model);
  const newId = makeUniqueId("itm", existing);
  const newItem = {
    ...original,
    id: newId,
    testo,
    order: original.order ?? 0,
    photos: Array.isArray(original.photos)
      ? original.photos.map(normalizePhotoRecord)
      : [],
    photoDataUrl: "",
    photoName: "",
    timestamp: nowDmy()
  };

  s.items = s.items || [];
  s.items.push(newItem);
  normalizeSectionAndItemOrders();
  touchAudit();
  rerenderAll();
  openSection(sectionId);
}

// Duplica la struttura di una sezione azzerando i dati compilati dei controlli.
function cloneSection(sectionId) {
  const original = findSection(sectionId);
  if (!original) return;
  const nuovo = prompt("Duplica sezione:", `${original.titolo || ""} (copia)`);
  if (nuovo === null) return;
  const titolo = nuovo.trim();
  if (!titolo) return;

  const existing = collectAllIds(model);
  const newSectionId = makeUniqueId("sec", existing);

  const clonedItems = (sortByOrder(original.items || [])).map(item => {
    const itemId = makeUniqueId("itm", existing);
    return {
      ...item,
      id: itemId,
      order: item.order ?? 0,
      stato: "todo",
      note: "",
      photos: [],
      photoDataUrl: "",
      photoName: "",
      timestamp: ""
    };
  });

  const cloneSection = {
    id: newSectionId,
    titolo,
    order: original.order ?? 0,
    items: clonedItems
  };

  model.sezioni.push(cloneSection);
  normalizeSectionAndItemOrders();
  touchAudit();
  rerenderAll();
  openSection(newSectionId);
}

/* ========================================================================== */
/* 11) SECTION ACTIONS                                                         */
/* ========================================================================== */

// Verifica se una sezione può essere spostata nella direzione richiesta.
function canMoveSection(sectionId, direction) {
  const sectionsSorted = sortByOrder(model.sezioni);
  const idx = sectionsSorted.findIndex(x => x.id === sectionId);
  if (idx < 0) return false;
  if (direction === "up") return idx > 0;
  return idx < sectionsSorted.length - 1;
}

// Elimina una sezione e tutti i suoi controlli dopo una doppia conferma.
function deleteSectionDangerous(sectionId) {
  const s = findSection(sectionId);
  if (!s) return;

  const count = (s.items || []).length;

  const msg =
    `ATTENZIONE: eliminerai la sezione "${s.titolo}"\n` +
    `e perderai anche ${count} controlli figli.\n\n` +
    `Per confermare, scrivi esattamente: elimina`;

  const typed = prompt(msg, "");
  if (typed === null) return;

  if (typed.trim().toLowerCase() !== "elimina") {
    alert("Conferma non valida. Nessuna modifica effettuata.");
    return;
  }

  model.sezioni = model.sezioni.filter(x => x.id !== sectionId);

  touchAudit();
  rerenderAll();
}

// Sposta una sezione scambiandone l'ordine con quella adiacente.
function moveSection(sectionId, direction) {
  const sectionsSorted = sortByOrder(model.sezioni);
  const idx = sectionsSorted.findIndex(x => x.id === sectionId);
  if (idx < 0) return;

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sectionsSorted.length) return;

  const a = sectionsSorted[idx];
  const b = sectionsSorted[swapIdx];

  const ao = a.order ?? 0;
  const bo = b.order ?? 0;
  a.order = bo;
  b.order = ao;

  touchAudit();
  rerenderAll();
}

// Modifica il titolo di una sezione.
function renameSection(sectionId) {
  const s = findSection(sectionId);
  if (!s) return;

  const nuovo = prompt("Rinomina sezione:", s.titolo || "");
  if (nuovo === null) return;
  const txt = nuovo.trim();
  if (!txt) return;

  s.titolo = txt;
  touchAudit();
  rerenderAll();
}

/* ========================================================================== */
/* 12) STATE LOGIC                                                             */
/* ========================================================================== */

// Applica lo stesso stato a tutti i controlli di una sezione.
function setSectionState(sectionId, state) {
  const section = findSection(sectionId);
  if (!section) return;

  const timestamp = nowDmy();
  for (const item of section.items || []) {
    item.stato = state;
    item.timestamp = timestamp;
  }

  touchAudit();
  rerenderAll();
  openSection(sectionId);
}

// Imposta lo stato di un controllo e gestisce l'obbligo delle note per i KO.
function setState(sectionId, itemId, state) {
  const it = findItem(sectionId, itemId);
  if (!it) return;

  // Se KO, prima controlla note (se esistono già ok, altrimenti obbliga)
  if (state === "ko") {
    if (!String(it.note ?? "").trim()) {
      // settiamo lo stato, ma evidenziamo subito e lasciamo l’utente scrivere note
      it.stato = "ko";
      it.timestamp = nowDmy();
      touchAudit();
      rerenderAll();
      alert("Stato KO: inserire le note (obbligatorie).");
      return;
    }
  }

  it.stato = state;
  it.timestamp = nowDmy();
  // Se stai uscendo da KO e le note erano marcate required, ok.
  touchAudit();
  rerenderAll();
}

/* ========================================================================== */
/* 13) IMPORT / EXPORT                                                         */
/* ========================================================================== */

// Avvia nel browser il download di un contenuto testuale.
function downloadTextFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Valida e scarica il modello corrente come file JSON.
function exportJson() {
  if (!model) return;

  // Validazione KO -> note obbligatorie
  const problems = [];
  for (const s of model.sezioni) {
    for (const it of s.items || []) {
      if ((it.stato || "todo") === "ko" && !String(it.note || "").trim()) {
        problems.push(`KO senza note: [${s.titolo}] ${it.testo}`);
      }
    }
  }
  if (problems.length) {
    alert("Impossibile esportare:\n\n" + problems.slice(0, 10).join("\n") + (problems.length > 10 ? "\n..." : ""));
    return;
  }

  model.app.lastSavedWith = APP_VERSION;
  touchAudit();

  const suggested = makeSuggestedFileName();
  if (!suggested) return;

  downloadTextFile(
    JSON.stringify(model, null, 2),
    suggested,
    "application/json"
  );
}

// Costruisce il nome del file JSON usando centrale, anno, data e ora.
function makeSuggestedFileName() {
  const nome = (model.meta.centraleNome || "").trim();
  const anno = String(model.meta.anno || "").trim();

  if (!nome || !anno) {
    alert("Impossibile esportare:\nCompilare almeno Centrale e Anno.");
    return null;
  }

  // Normalizzazione nome file:
  // - spazi → _
  // - niente caratteri strani
  const safeNome = nome
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");

  const stamp = formatDateTimeYYYYMMDDHHMM(new Date());
  return `${safeNome}_${anno}_${stamp}.json`;
}


// Legge, valida e carica nell'app un file JSON selezionato dall'utente.
function openJsonFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const err = validateModel(parsed);
      if (err) {
        alert(err);
        return;
      }
      const normalized = normalizeModel(parsed);
      const imageResult = await optimizeModelPhotos(normalized);
      model = normalized;
      openedFileName = file?.name || "";
      enableUi(true);
      bindAfterLoad();
      rerenderAll();
      if (imageResult.errors.length) {
        alert(
          "Alcune immagini non sono state ottimizzate:\n\n" +
          imageResult.errors.slice(0, 5).join("\n") +
          (imageResult.errors.length > 5 ? "\n..." : "")
        );
      }
    } catch (e) {
      alert("Errore nel parsing JSON: " + e.message);
    }
  };
  reader.readAsText(file);
}

// Crea un nuovo modello con le sezioni iniziali predefinite.
function createNewFile() {
  if (model) {
    const ok = confirm("Creare un nuovo file? Le modifiche non salvate andranno perse.");
    if (!ok) return;
  }

  const sections = [
    "Servizi Ausiliari Corrente Alternata",
    "Servizi Ausiliari Corrente Continua",
    "Blindati M.T.",
    "S.O.D.",
    "Sgrigliatore"
  ];

  const existing = new Set();
  const base = {
    app: { schemaVersion: 2 },
    meta: {},
    sezioni: sections.map((titolo, i) => ({
      id: makeUniqueId("sec", existing),
      titolo,
      order: (i + 1) * 10,
      items: [
        {
          id: makeUniqueId("itm", existing),
          testo: "Ispezione e pulizia",
          order: 10,
          stato: "todo",
          note: "",
          photos: [],
          photoDataUrl: "",
          photoName: "",
          timestamp: ""
        }
      ]
    })),
    audit: {}
  };

  model = normalizeModel(base);
  openedFileName = "";
  enableUi(true);
  bindAfterLoad();
  rerenderAll();
}

/* ========================================================================== */
/* 15) EXPAND / COLLAPSE                                                       */
/* ========================================================================== */

// Espande o comprime contemporaneamente tutte le sezioni.
function expandCollapseAll(open) {
  document.querySelectorAll("details.section").forEach(d => d.open = open);
}

// Azzera stati, dati generali, note e foto dopo la conferma dell'utente.
function resetAllStates() {
  if (!model) return;

  const ok = confirm("Confermi il reset completo?\n\n- Stati: tutti su \"Da fare\"\n- Note e dati generali: cancellati");
  if (!ok) return;

  for (const s of model.sezioni || []) {
    for (const it of s.items || []) {
      it.stato = "todo";
      it.note = "";
      it.timestamp = "";
      it.photos = [];
      it.photoDataUrl = "";
      it.photoName = "";
    }
  }

  if (!model.meta) model.meta = {};
  model.meta.centraleNome = "";
  model.meta.anno = "";
  model.meta.preposto = "";
  model.meta.operatori = "";
  model.meta.dataInizio = "";
  model.meta.dataFine = "";
  model.meta.oreFunzionamento = "";
  model.meta.noteGenerali = "";

  model.audit = {};

  touchAudit();
  rerenderAll();
}

/* ========================================================================== */
/* 16) INIT                                                                    */
/* ========================================================================== */

// Riserva il punto di collegamento per eventi da inizializzare dopo il caricamento.
function bindAfterLoad() {
  // campi meta (una sola volta)
  // se già bindati, non crea problemi gravi, ma meglio evitare in futuro
}

// Collega gli eventi principali e prepara l'interfaccia all'avvio.
function init() {
  enableUi(false);

  const versionLabel = document.getElementById("appVersion");
  if (versionLabel) versionLabel.textContent = `v${APP_VERSION}`;

  const fileInput = document.getElementById("fileInput");
  document.getElementById("btnNew").addEventListener("click", createNewFile);
  document.getElementById("btnOpen").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) openJsonFile(file);
    fileInput.value = "";
  });

  document.getElementById("btnSave").addEventListener("click", exportJson);
  document.getElementById("btnResetStates").addEventListener("click", resetAllStates);
  document.getElementById("btnPdfBlank").addEventListener("click", () => generatePdf(true));
  document.getElementById("btnPdfState").addEventListener("click", () => generatePdf(false));

  document.getElementById("btnExpandAll").addEventListener("click", () => expandCollapseAll(true));
  document.getElementById("btnCollapseAll").addEventListener("click", () => expandCollapseAll(false));
  document.getElementById("btnToggleCompleted").addEventListener("click", () => {
    showCompleted = !showCompleted;
    updateToggleCompletedLabel();
    rerenderAll();
  });

  document.getElementById("btnAddSection").addEventListener("click", addSection);

  const more = document.querySelector(".toolbar-more");
  const morePanel = document.querySelector(".toolbar-more-panel");

  if (more && morePanel) {
    morePanel.addEventListener("click", () => {
      if (more.open) more.open = false;
    });
    document.addEventListener("click", (e) => {
      if (!more.open) return;
      if (!more.contains(e.target)) more.open = false;
    });
  }

  bindMeta();
}

/* ========================================================================== */
/* 17) BOOT                                                                   */
/* ========================================================================== */

init();
