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
const APP_VERSION = "1.4.0"; // versione del programma, gestita in un solo punto
const RM = window.ReportModel;
const RU = window.ReportUtils;


/* ========================================================================== */
/* 02) DATE & IDS                                                              */
/* ========================================================================== */

// Ottimizza tutte le foto e restituisce un nuovo modello con gli eventuali errori.
async function optimizeModelPhotos(targetModel) {
  if (!window.ReportImages) return { model: targetModel, optimized: 0, errors: [] };

  let optimized = 0;
  const errors = [];
  let optimizedModel = targetModel;

  for (const section of targetModel.sezioni || []) {
    for (const item of section.items || []) {
      const prepared = [];
      for (const photo of item.photos || []) {
        try {
          const result = await window.ReportImages.ensureOptimizedPhoto(photo);
          if (result.dataUrl !== photo.dataUrl) optimized++;
          prepared.push(result);
        } catch (error) {
          prepared.push(window.ReportImages.normalizePhotoRecord(photo));
          errors.push(`${photo.name || "foto"}: ${error.message}`);
        }
      }
      optimizedModel = RM.updateItem(optimizedModel, section.id, item.id, current => ({
        ...current,
        photos: prepared,
        photoDataUrl: "",
        photoName: ""
      }));
    }
  }

  return { model: optimizedModel, optimized, errors };
}

// Converte il valore di un campo data HTML nel formato usato dal modello.
function inputValueToDmy(value) {
  if (!value) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  return RU.formatYmdToDmy(value);
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

/* ========================================================================== */
/* 05) AUDIT                                                                   */
/* ========================================================================== */

// Aggiorna i dati di audit dopo una modifica al modello.
function touchAudit() {
  const modifiedBy = (model.meta.operatori || model.meta.preposto || "").trim();
  model = RM.updateAudit(model, RU.nowDmy(), modifiedBy);
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
        model = RM.updateMeta(model, key, Number(el.value));
      } else if (key === "dataInizio" || key === "dataFine") {
        model = RM.updateMeta(model, key, inputValueToDmy(el.value));
      } else if (key === "oreFunzionamento") {
        model = RM.updateMeta(model, key, el.value === "" ? "" : Number(el.value));
      } else {
        model = RM.updateMeta(model, key, el.value);
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
  document.getElementById("metaDataInizio").value = RU.formatDmyToYmd(model.meta.dataInizio ?? "");
  document.getElementById("metaDataFine").value = RU.formatDmyToYmd(model.meta.dataFine ?? "");
  document.getElementById("metaOreFunzionamento").value = model.meta.oreFunzionamento ?? "";
  document.getElementById("metaNoteGenerali").value = model.meta.noteGenerali ?? "";
}

/* ========================================================================== */
/* 07) SECTION STATS / PROGRESS                                                */
/* ========================================================================== */

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

// Aggiorna la barra e i conteggi dell'avanzamento globale.
function renderGlobalProgress() {
  const fill = document.getElementById("globalProgressFill");
  const txt = document.getElementById("globalProgressText");
  const counts = document.getElementById("globalProgressCounts");

  if (!fill || !txt || !counts) return;

  const p = RM.computeGlobalProgress(model);
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
  return RM.findItem(model, sectionId, itemId);
}

// Cerca una sezione tramite il suo identificativo.
function findSection(sectionId) {
  return RM.findSection(model, sectionId);
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

// Costruisce il titolo e i comandi di modifica di un controllo.
function renderItemTitle(sectionId, item) {
  const row = document.createElement("div");
  row.className = "item-title-row";

  const title = document.createElement("div");
  title.className = "item-title-left";
  const text = document.createElement("div");
  text.className = "item-text";
  text.textContent = item.testo;
  title.appendChild(text);

  const tools = document.createElement("div");
  tools.className = "item-tools";
  const definitions = [
    ["Rinomina", "✏️", false, () => renameItem(sectionId, item.id)],
    ["Duplica controllo", "⧉", false, () => cloneItem(sectionId, item.id)],
    ["Sposta su", "⬆️", !canMove(sectionId, item.id, "up"), () => moveItem(sectionId, item.id, "up")],
    ["Sposta giù", "⬇️", !canMove(sectionId, item.id, "down"), () => moveItem(sectionId, item.id, "down")],
    ["Elimina", "🗑️", false, () => deleteItem(sectionId, item.id), "danger"]
  ];

  for (const [label, icon, disabled, onClick, extraClass = ""] of definitions) {
    const button = document.createElement("button");
    button.className = `icon-btn${extraClass ? ` ${extraClass}` : ""}`;
    button.type = "button";
    button.title = label;
    button.textContent = icon;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    tools.appendChild(button);
  }

  row.appendChild(title);
  row.appendChild(tools);
  return row;
}

// Costruisce e collega il campo note di un controllo.
function renderItemNote(sectionId, item) {
  const note = document.createElement("textarea");
  note.className = "note";
  note.rows = 2;
  note.placeholder = "Note (obbligatorie se KO)";
  note.value = item.note ?? "";
  if ((item.stato || "todo") === "ko" && !note.value.trim()) note.classList.add("required");

  note.addEventListener("input", () => {
    model = RM.updateItem(model, sectionId, item.id, current => ({
      ...current,
      note: note.value,
      timestamp: RU.nowDmy()
    }));
    const current = findItem(sectionId, item.id);
    note.classList.toggle("required", current.stato === "ko" && !current.note.trim());
    touchAudit();
  });
  return note;
}

// Costruisce i pulsanti che impostano lo stato di un controllo.
function renderItemState(sectionId, item) {
  const footer = document.createElement("div");
  footer.className = "item-footer";
  const actions = document.createElement("div");
  actions.className = "item-actions";
  const state = item.stato || "todo";
  actions.appendChild(makeStateButton("todo", "Da fare", state === "todo", () => setState(sectionId, item.id, "todo")));
  actions.appendChild(makeStateButton("ok", "OK", state === "ok", () => setState(sectionId, item.id, "ok")));
  actions.appendChild(makeStateButton("ko", "KO", state === "ko", () => setState(sectionId, item.id, "ko")));
  actions.appendChild(makeStateButton("na", "N.A.", state === "na", () => setState(sectionId, item.id, "na")));
  footer.appendChild(actions);
  return footer;
}

// Costruisce la gestione degli allegati fotografici di un controllo.
function renderItemPhotos(sectionId, item) {
  const attachment = document.createElement("div");
  attachment.className = "item-attachment";
  const photoInput = document.createElement("input");
  photoInput.type = "file";
  photoInput.accept = "image/jpeg,image/png,image/webp,image/bmp,.bmp";
  photoInput.className = "item-photo-input";
  photoInput.title = "Allega una foto";
  photoInput.hidden = true;
  attachment.appendChild(photoInput);

  const photosWrap = document.createElement("div");
  photosWrap.className = "item-photos";
  const photos = Array.isArray(item.photos) ? item.photos : [];
  let targetPhotoIndex = -1;

  const addLabel = document.createElement("span");
  addLabel.className = "item-photo-label";
  addLabel.textContent = photos.length >= MAX_PHOTOS
    ? "Limite massimo raggiunto"
    : `Fino a ${MAX_PHOTOS} foto - JPG, PNG, WebP o BMP`;

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
      model = RM.updateItem(model, sectionId, item.id, current => {
        const nextPhotos = Array.isArray(current.photos) ? [...current.photos] : [];
        const index = selectedIndex < 0 ? nextPhotos.length : selectedIndex;
        nextPhotos[index] = optimizedPhoto;
        return {
          ...current,
          photos: nextPhotos.filter(photo => photo && photo.dataUrl).slice(0, MAX_PHOTOS),
          photoDataUrl: "",
          photoName: ""
        };
      });
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

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index];
    if (!photo?.dataUrl) continue;
    const card = document.createElement("div");
    card.className = "item-photo-card";
    const box = document.createElement("button");
    box.type = "button";
    box.className = "item-photo-box has-photo";
    box.title = "Sostituisci foto";
    box.addEventListener("click", () => {
      targetPhotoIndex = index;
      photoInput.click();
    });

    const preview = document.createElement("img");
    preview.className = "item-photo-preview";
    preview.alt = "Anteprima foto";
    preview.src = photo.dataUrl;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "item-photo-clear";
    removeButton.textContent = "×";
    removeButton.title = "Rimuovi foto";
    removeButton.addEventListener("click", event => {
      event.stopPropagation();
      model = RM.updateItem(model, sectionId, item.id, current => ({
        ...current,
        photos: (current.photos || []).filter((_, photoIndex) => photoIndex !== index),
        photoDataUrl: "",
        photoName: ""
      }));
      touchAudit();
      rerenderAll();
    });

    const label = document.createElement("span");
    label.className = "item-photo-label";
    const description = window.ReportImages?.describePhoto(photo) || photo.name || "foto";
    label.textContent = `Foto ${index + 1}: ${description}`;
    box.appendChild(preview);
    box.appendChild(removeButton);
    card.appendChild(box);
    card.appendChild(label);
    photosWrap.appendChild(card);
  }

  const addCard = document.createElement("div");
  addCard.className = "item-photo-card";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "item-photo-box";
  addButton.title = "Aggiungi foto";
  addButton.innerHTML = '<span class="item-photo-icon">📷</span><span class="item-photo-text">Aggiungi foto</span>';
  addButton.disabled = photos.length >= MAX_PHOTOS;
  addButton.addEventListener("click", () => {
    if (photos.length >= MAX_PHOTOS) return;
    targetPhotoIndex = photos.length;
    photoInput.click();
  });
  addCard.appendChild(addButton);
  addCard.appendChild(addLabel);
  photosWrap.appendChild(addCard);
  attachment.appendChild(photosWrap);
  return attachment;
}

// Costruisce l'interfaccia completa di un singolo controllo.
function renderItem(sectionId, itemId) {
  const item = findItem(sectionId, itemId);

  const wrap = document.createElement("div");
  wrap.className = "item";
  wrap.dataset.itemId = item.id;

  const grid = document.createElement("div");
  grid.className = "item-grid";

  const titleRow = renderItemTitle(sectionId, item);
  const note = renderItemNote(sectionId, item);
  const attachment = renderItemPhotos(sectionId, item);
  const footer = renderItemState(sectionId, item);

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

// Costruisce i comandi di modifica mostrati nel titolo di una sezione.
function renderSectionTools(section) {
  const tools = document.createElement("div");
  tools.className = "section-tools";
  const definitions = [
    ["Rinomina sezione", "✏️", false, () => renameSection(section.id)],
    ["Duplica sezione", "⧉", false, () => cloneSection(section.id)],
    ["Sposta sezione su", "⬆️", !canMoveSection(section.id, "up"), () => moveSection(section.id, "up")],
    ["Sposta sezione giù", "⬇️", !canMoveSection(section.id, "down"), () => moveSection(section.id, "down")],
    ["Elimina sezione (perde i controlli figli)", "🗑️", false, () => deleteSectionDangerous(section.id), "danger"]
  ];

  for (const [label, icon, disabled, action, extraClass = ""] of definitions) {
    const button = document.createElement("button");
    button.className = `icon-btn${extraClass ? ` ${extraClass}` : ""}`;
    button.type = "button";
    button.title = label;
    button.textContent = icon;
    button.disabled = disabled;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    tools.appendChild(button);
  }
  return tools;
}

// Costruisce il riepilogo con titolo, avanzamento e badge di una sezione.
function renderSectionSummary(section) {
  const summary = document.createElement("summary");
  const title = document.createElement("div");
  title.className = "section-title";
  const titleText = document.createElement("div");
  titleText.className = "section-title-text";
  titleText.textContent = section.titolo;
  title.appendChild(titleText);
  title.appendChild(renderSectionTools(section));

  const progress = RM.computeSectionProgress(section);
  const progressWrap = document.createElement("div");
  progressWrap.className = "summary-right";
  const progressLabel = document.createElement("div");
  progressLabel.className = "progress-label";
  progressLabel.textContent = `${progress.done}/${progress.total} (${progress.pct}%)`;
  progressWrap.appendChild(progressLabel);
  progressWrap.appendChild(makeProgressNode(progress.pct));

  const badges = document.createElement("div");
  badges.className = "badges";
  const counts = RM.computeSectionBadges(section);
  badges.appendChild(makeBadge("todo", `Da fare ${counts.todo}`));
  badges.appendChild(makeBadge("ok", `OK ${counts.ok}`));
  badges.appendChild(makeBadge("ko", `KO ${counts.ko}`));
  badges.appendChild(makeBadge("na", `N.A. ${counts.na}`));

  summary.appendChild(title);
  summary.appendChild(progressWrap);
  summary.appendChild(badges);
  return summary;
}

// Costruisce i comandi collettivi disponibili nel corpo di una sezione.
function renderSectionActions(section) {
  const row = document.createElement("div");
  row.className = "row-actions";
  const buttons = document.createElement("div");
  buttons.className = "section-action-buttons";
  const definitions = [
    ["+ Aggiungi controllo", "", "Aggiunge un controllo alla sezione", () => addControl(section.id)],
    ["✓ Check tutti", "section-check-all", "Imposta tutti i controlli della sezione su OK", () => setSectionState(section.id, "ok")],
    ["○ Uncheck tutti", "section-uncheck-all", "Riporta tutti i controlli della sezione su Da fare", () => setSectionState(section.id, "todo")]
  ];

  for (const [label, extraClass, title, action] of definitions) {
    const button = document.createElement("button");
    button.className = `btn btn-small${extraClass ? ` ${extraClass}` : ""}`;
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.disabled = Boolean(extraClass) && !(section.items || []).length;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      action();
      openSection(section.id);
    });
    buttons.appendChild(button);
  }

  const hint = document.createElement("div");
  hint.className = "small-muted";
  hint.textContent = "KO richiede note obbligatorie.";
  row.appendChild(buttons);
  row.appendChild(hint);
  return row;
}

// Costruisce il corpo di una sezione con azioni e controlli visibili.
function renderSectionBody(section) {
  const body = document.createElement("div");
  body.className = "section-body";
  body.appendChild(renderSectionActions(section));
  for (const item of RM.sortByOrder(section.items || [])) {
    if (shouldRenderItem(item)) body.appendChild(renderItem(section.id, item.id));
  }
  return body;
}

// Costruisce una singola sezione completa dell'accordion.
function renderSection(section, isOpen) {
  const details = document.createElement("details");
  details.className = "section";
  details.dataset.sectionId = section.id;
  details.open = isOpen;
  details.appendChild(renderSectionSummary(section));
  details.appendChild(renderSectionBody(section));
  return details;
}

// Disegna tutte le sezioni conservando quelle che erano già aperte.
function renderSections(openSet = new Set()) {
  const container = document.getElementById("sections");
  container.innerHTML = "";

  const sections = RM.sortByOrder(model.sezioni);

  if (sections.length === 0) {
    container.innerHTML = `<div class="empty-hint">Nessuna sezione presente.</div>`;
    return;
  }

  for (const section of sections) {
    container.appendChild(renderSection(section, openSet.has(section.id)));
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

  const existing = RM.collectAllIds(model);
  const newId = RU.makeUniqueId("itm", existing);

  const maxOrder = Math.max(0, ...(section.items || []).map(it => it.order ?? 0));
  const item = {
    id: newId,
    testo: testo.trim(),
    order: maxOrder + 10,
    stato: "todo",
    note: "", timestamp: "",
    photos: [],
    photoDataUrl: "",
    photoName: ""
  };
  model = RM.addItem(model, sectionId, item);

  touchAudit();
  rerenderAll();
  openSection(sectionId);
}

// Aggiunge una nuova sezione vuota al modello.
function addSection() {
  const titolo = prompt("Titolo nuova sezione:");
  if (!titolo || !titolo.trim()) return;

  const existing = RM.collectAllIds(model);
  const newId = RU.makeUniqueId("sec", existing);

  const maxOrder = Math.max(0, ...model.sezioni.map(s => s.order ?? 0));
  model = RM.addSection(model, {
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
  return RM.canMoveItem(model, sectionId, itemId, direction);
}

// Elimina un controllo dopo aver chiesto conferma all'utente.
function deleteItem(sectionId, itemId) {
  const s = findSection(sectionId);
  if (!s || !Array.isArray(s.items)) return;

  const it = findItem(sectionId, itemId);
  if (!it) return;

  const ok = confirm(`Eliminare questo controllo?\n\n- ${it.testo}`);
  if (!ok) return;

  model = RM.removeItem(model, sectionId, itemId);

  touchAudit();
  rerenderAll();
}

// Sposta un controllo scambiandone l'ordine con quello adiacente.
function moveItem(sectionId, itemId, direction) {
  model = RM.moveItem(model, sectionId, itemId, direction);
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

  model = RM.updateItem(model, sectionId, itemId, current => ({
    ...current,
    testo: txt,
    timestamp: RU.nowDmy()
  }));
  touchAudit();
  rerenderAll();
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

  const existing = RM.collectAllIds(model);
  const newId = RU.makeUniqueId("itm", existing);
  const newItem = RM.cloneItem(original, {
    id: newId,
    testo,
    timestamp: RU.nowDmy()
  });

  model = RM.normalizeOrders(RM.addItem(model, sectionId, newItem));
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

  const existing = RM.collectAllIds(model);
  const newSectionId = RU.makeUniqueId("sec", existing);
  const itemIds = RM.sortByOrder(original.items || [])
    .map(() => RU.makeUniqueId("itm", existing));
  const clonedSection = RM.cloneSectionEmpty(original, {
    id: newSectionId,
    titolo,
    itemIds
  });

  model = RM.normalizeOrders(RM.addSection(model, clonedSection));
  touchAudit();
  rerenderAll();
  openSection(newSectionId);
}

/* ========================================================================== */
/* 11) SECTION ACTIONS                                                         */
/* ========================================================================== */

// Verifica se una sezione può essere spostata nella direzione richiesta.
function canMoveSection(sectionId, direction) {
  return RM.canMoveSection(model, sectionId, direction);
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

  model = RM.removeSection(model, sectionId);

  touchAudit();
  rerenderAll();
}

// Sposta una sezione scambiandone l'ordine con quella adiacente.
function moveSection(sectionId, direction) {
  model = RM.moveSection(model, sectionId, direction);
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

  model = RM.updateSection(model, sectionId, section => ({ ...section, titolo: txt }));
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

  model = RM.setSectionState(model, sectionId, state, RU.nowDmy());
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
      model = RM.setItemState(model, sectionId, itemId, "ko", RU.nowDmy());
      touchAudit();
      rerenderAll();
      alert("Stato KO: inserire le note (obbligatorie).");
      return;
    }
  }

  model = RM.setItemState(model, sectionId, itemId, state, RU.nowDmy());
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
  const problems = RM.findKoWithoutNotes(model)
    .map(({ section, item }) => `KO senza note: [${section.titolo}] ${item.testo}`);
  if (problems.length) {
    alert("Impossibile esportare:\n\n" + problems.slice(0, 10).join("\n") + (problems.length > 10 ? "\n..." : ""));
    return;
  }

  model = { ...model, app: { ...(model.app || {}), lastSavedWith: APP_VERSION } };
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

  return RU.buildExportFileName({
    centrale: nome,
    anno,
    date: new Date(),
    extension: "json"
  });
}


// Legge, valida e carica nell'app un file JSON selezionato dall'utente.
function openJsonFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const err = RM.validateModel(parsed);
      if (err) {
        alert(err);
        return;
      }
      const normalized = RM.normalizeModel(parsed, {
        maxPhotos: MAX_PHOTOS,
        normalizePhoto: window.ReportImages?.normalizePhotoRecord
      });
      const imageResult = await optimizeModelPhotos(normalized);
      model = imageResult.model;
      openedFileName = file?.name || "";
      enableUi(true);
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
      id: RU.makeUniqueId("sec", existing),
      titolo,
      order: (i + 1) * 10,
      items: [
        {
          id: RU.makeUniqueId("itm", existing),
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

  model = RM.normalizeModel(base, {
    maxPhotos: MAX_PHOTOS,
    normalizePhoto: window.ReportImages?.normalizePhotoRecord
  });
  openedFileName = "";
  enableUi(true);
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

  model = RM.resetReport(model);
  touchAudit();
  rerenderAll();
}

/* ========================================================================== */
/* 16) INIT                                                                    */
/* ========================================================================== */

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
  document.getElementById("btnPdfBlank").addEventListener("click", () => generatePdf(model, true));
  document.getElementById("btnPdfState").addEventListener("click", () => generatePdf(model, false));

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
