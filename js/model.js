/* ========================================================================== */
/* MODELLO DATI                                                               */
/* Trasformazioni pure: ricevono dati, restituiscono nuovi dati e non usano   */
/* direttamente DOM, prompt, alert o lo stato globale dell'applicazione.       */
/* ========================================================================== */

(function initReportModel(global) {
  "use strict";

  const VALID_STATES = new Set(["todo", "ok", "ko", "na"]);
  const DEFAULT_MAX_PHOTOS = 3;
  const SCHEMA_VERSION = 2;

  // Restituisce una copia ordinata senza modificare l'array originale.
  function sortByOrder(values) {
    return [...(values || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  // Raccoglie tutti gli identificativi presenti nel report.
  function collectAllIds(report) {
    const ids = new Set();
    for (const section of report?.sezioni || []) {
      if (section.id) ids.add(section.id);
      for (const item of section.items || []) {
        if (item.id) ids.add(item.id);
      }
    }
    return ids;
  }

  // Cerca una sezione senza dipendere dal modello globale dell'interfaccia.
  function findSection(report, sectionId) {
    return (report?.sezioni || []).find(section => section.id === sectionId) || null;
  }

  // Cerca un controllo all'interno di una sezione.
  function findItem(report, sectionId, itemId) {
    const section = findSection(report, sectionId);
    return (section?.items || []).find(item => item.id === itemId) || null;
  }

  // Crea un nuovo identificativo quando quello ricevuto manca o e duplicato.
  function claimId(value, prefix, usedIds, makeUniqueId) {
    const requested = String(value || "").trim();
    if (requested && !usedIds.has(requested)) {
      usedIds.add(requested);
      return requested;
    }

    let generated = "";
    let idsBeforeGeneration;
    do {
      idsBeforeGeneration = new Set(usedIds);
      generated = makeUniqueId(prefix, usedIds);
    } while (!generated || idsBeforeGeneration.has(generated));
    usedIds.add(generated);
    return generated;
  }

  // Uniforma una foto quando non viene fornito un normalizzatore specializzato.
  function normalizePhotoFallback(photo) {
    const source = photo && typeof photo === "object" ? photo : {};
    return {
      ...source,
      dataUrl: String(source.dataUrl || ""),
      name: String(source.name || "foto")
    };
  }

  // Normalizza un JSON importato restituendo un nuovo modello indipendente.
  function normalizeModel(source, options = {}) {
    const input = source && typeof source === "object" ? source : {};
    const normalizeDate = options.normalizeDate || global.ReportUtils.normalizeDateString;
    const normalizePhoto = options.normalizePhoto || normalizePhotoFallback;
    const maxPhotos = Number(options.maxPhotos) || DEFAULT_MAX_PHOTOS;
    const makeUniqueId = options.makeUniqueId || global.ReportUtils.makeUniqueId;
    const usedIds = new Set();

    const meta = { ...(input.meta || {}) };
    const audit = { ...(input.audit || {}) };
    if (meta.dataInizio !== undefined) meta.dataInizio = normalizeDate(meta.dataInizio);
    if (meta.dataFine !== undefined) meta.dataFine = normalizeDate(meta.dataFine);
    if (audit.lastModified !== undefined) audit.lastModified = normalizeDate(audit.lastModified);

    let sectionOrder = 10;
    const sections = (Array.isArray(input.sezioni) ? input.sezioni : []).map(rawSection => {
      const sourceSection = rawSection && typeof rawSection === "object" ? rawSection : {};
      const sectionId = claimId(sourceSection.id, "sec", usedIds, makeUniqueId);
      const numericOrder = Number(sourceSection.order);
      const order = sourceSection.order === undefined || sourceSection.order === null || Number.isNaN(numericOrder)
        ? sectionOrder
        : numericOrder;
      sectionOrder = Math.max(sectionOrder, order) + 10;

      let itemOrder = 10;
      let needsReorder = false;
      const itemOrders = [];
      const items = (Array.isArray(sourceSection.items) ? sourceSection.items : []).map(rawItem => {
        const sourceItem = rawItem && typeof rawItem === "object" ? rawItem : {};
        const numericItemOrder = Number(sourceItem.order);
        const normalizedOrder = sourceItem.order === undefined || sourceItem.order === null || Number.isNaN(numericItemOrder)
          ? itemOrder
          : numericItemOrder;
        if (sourceItem.order === undefined || sourceItem.order === null || Number.isNaN(numericItemOrder)) {
          needsReorder = true;
        }
        itemOrders.push(normalizedOrder);
        itemOrder = Math.max(itemOrder, normalizedOrder) + 10;

        let photos = Array.isArray(sourceItem.photos) ? sourceItem.photos : [];
        if (!photos.length && sourceItem.photoDataUrl) {
          photos = [{ dataUrl: sourceItem.photoDataUrl, name: sourceItem.photoName || "foto" }];
        }

        return {
          ...sourceItem,
          id: claimId(sourceItem.id, "itm", usedIds, makeUniqueId),
          testo: String(sourceItem.testo ?? ""),
          order: normalizedOrder,
          stato: VALID_STATES.has(sourceItem.stato) ? sourceItem.stato : "todo",
          note: String(sourceItem.note ?? ""),
          photos: photos
            .filter(photo => photo && photo.dataUrl)
            .slice(0, maxPhotos)
            .map(photo => ({ ...normalizePhoto(photo) })),
          photoDataUrl: "",
          photoName: "",
          timestamp: sourceItem.timestamp ? normalizeDate(sourceItem.timestamp) : ""
        };
      });

      if (!needsReorder && new Set(itemOrders).size !== itemOrders.length) needsReorder = true;
      const orderedItems = needsReorder
        ? items.map((item, index) => ({ ...item, order: (index + 1) * 10 }))
        : items;

      return {
        ...sourceSection,
        id: sectionId,
        titolo: String(sourceSection.titolo ?? ""),
        order,
        items: orderedItems
      };
    });

    return {
      ...input,
      app: { ...(input.app || {}), schemaVersion: SCHEMA_VERSION },
      meta,
      sezioni: sections,
      audit
    };
  }

  // Verifica che il JSON contenga la struttura minima richiesta.
  function validateModel(value) {
    if (!value || typeof value !== "object") return "JSON non valido.";
    if (!value.meta || !value.sezioni) return "Mancano meta o sezioni.";
    if (!Array.isArray(value.sezioni)) return "sezioni deve essere un array.";
    return "";
  }

  // Aggiorna una sezione applicando una trasformazione pura.
  function updateSection(report, sectionId, updater) {
    let changed = false;
    const sections = (report.sezioni || []).map(section => {
      if (section.id !== sectionId) return section;
      changed = true;
      return updater(section);
    });
    return changed ? { ...report, sezioni: sections } : report;
  }

  // Aggiorna un controllo applicando una trasformazione pura.
  function updateItem(report, sectionId, itemId, updater) {
    return updateSection(report, sectionId, section => {
      let changed = false;
      const items = (section.items || []).map(item => {
        if (item.id !== itemId) return item;
        changed = true;
        return updater(item);
      });
      return changed ? { ...section, items } : section;
    });
  }

  // Aggiunge una sezione al report senza modificare quello originale.
  function addSection(report, section) {
    return { ...report, sezioni: [...(report.sezioni || []), section] };
  }

  // Aggiunge un controllo alla sezione richiesta.
  function addItem(report, sectionId, item) {
    return updateSection(report, sectionId, section => ({
      ...section,
      items: [...(section.items || []), item]
    }));
  }

  // Elimina una sezione dal report.
  function removeSection(report, sectionId) {
    return { ...report, sezioni: (report.sezioni || []).filter(section => section.id !== sectionId) };
  }

  // Elimina un controllo dalla sezione richiesta.
  function removeItem(report, sectionId, itemId) {
    return updateSection(report, sectionId, section => ({
      ...section,
      items: (section.items || []).filter(item => item.id !== itemId)
    }));
  }

  // Aggiorna una proprieta dei dati generali.
  function updateMeta(report, key, value) {
    return { ...report, meta: { ...(report.meta || {}), [key]: value } };
  }

  // Aggiorna le informazioni di audit del report.
  function updateAudit(report, lastModified, lastModifiedBy) {
    return {
      ...report,
      audit: { ...(report.audit || {}), lastModified, lastModifiedBy }
    };
  }

  // Imposta lo stato di un singolo controllo.
  function setItemState(report, sectionId, itemId, state, timestamp) {
    const normalizedState = VALID_STATES.has(state) ? state : "todo";
    return updateItem(report, sectionId, itemId, item => ({
      ...item,
      stato: normalizedState,
      timestamp
    }));
  }

  // Imposta lo stesso stato su tutti i controlli di una sezione.
  function setSectionState(report, sectionId, state, timestamp) {
    const normalizedState = VALID_STATES.has(state) ? state : "todo";
    return updateSection(report, sectionId, section => ({
      ...section,
      items: (section.items || []).map(item => ({
        ...item,
        stato: normalizedState,
        timestamp
      }))
    }));
  }

  // Duplica un controllo mantenendone i dati compilati.
  function cloneItem(original, { id, testo, timestamp }) {
    return {
      ...original,
      id,
      testo,
      photos: (original.photos || []).map(photo => ({ ...photo })),
      photoDataUrl: "",
      photoName: "",
      timestamp
    };
  }

  // Duplica una sezione mantenendo i controlli ma azzerando i dati compilati.
  function cloneSectionEmpty(original, { id, titolo, itemIds }) {
    const items = sortByOrder(original.items || []).map((item, index) => ({
      ...item,
      id: itemIds[index],
      stato: "todo",
      note: "",
      photos: [],
      photoDataUrl: "",
      photoName: "",
      timestamp: ""
    }));
    return { ...original, id, titolo, items };
  }

  // Riassegna valori di order regolari a sezioni e controlli.
  function normalizeOrders(report) {
    const sections = sortByOrder(report.sezioni || []).map((section, sectionIndex) => ({
      ...section,
      order: (sectionIndex + 1) * 10,
      items: sortByOrder(section.items || []).map((item, itemIndex) => ({
        ...item,
        order: (itemIndex + 1) * 10
      }))
    }));
    return { ...report, sezioni: sections };
  }

  // Verifica se un controllo puo essere spostato nella direzione richiesta.
  function canMoveItem(report, sectionId, itemId, direction) {
    const items = sortByOrder(findSection(report, sectionId)?.items || []);
    const index = items.findIndex(item => item.id === itemId);
    return index >= 0 && (direction === "up" ? index > 0 : index < items.length - 1);
  }

  // Sposta un controllo scambiandone l'ordine con quello adiacente.
  function moveItem(report, sectionId, itemId, direction) {
    const section = findSection(report, sectionId);
    const items = sortByOrder(section?.items || []);
    const index = items.findIndex(item => item.id === itemId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return report;
    const current = items[index];
    const adjacent = items[swapIndex];
    return updateSection(report, sectionId, value => ({
      ...value,
      items: (value.items || []).map(item => {
        if (item.id === current.id) return { ...item, order: adjacent.order };
        if (item.id === adjacent.id) return { ...item, order: current.order };
        return item;
      })
    }));
  }

  // Verifica se una sezione puo essere spostata nella direzione richiesta.
  function canMoveSection(report, sectionId, direction) {
    const sections = sortByOrder(report.sezioni || []);
    const index = sections.findIndex(section => section.id === sectionId);
    return index >= 0 && (direction === "up" ? index > 0 : index < sections.length - 1);
  }

  // Sposta una sezione scambiandone l'ordine con quella adiacente.
  function moveSection(report, sectionId, direction) {
    const sections = sortByOrder(report.sezioni || []);
    const index = sections.findIndex(section => section.id === sectionId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= sections.length) return report;
    const current = sections[index];
    const adjacent = sections[swapIndex];
    return {
      ...report,
      sezioni: (report.sezioni || []).map(section => {
        if (section.id === current.id) return { ...section, order: adjacent.order };
        if (section.id === adjacent.id) return { ...section, order: current.order };
        return section;
      })
    };
  }

  // Conta i controlli di una sezione raggruppandoli per stato.
  function computeSectionBadges(section) {
    const counts = { todo: 0, ok: 0, ko: 0, na: 0 };
    for (const item of section?.items || []) {
      const state = VALID_STATES.has(item.stato) ? item.stato : "todo";
      counts[state]++;
    }
    return counts;
  }

  // Calcola l'avanzamento di una singola sezione.
  function computeSectionProgress(section) {
    const items = section?.items || [];
    const total = items.length;
    const done = items.filter(item => (item.stato || "todo") !== "todo").length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  // Calcola l'avanzamento complessivo escludendo i non applicabili dal totale.
  function computeGlobalProgress(report) {
    const counts = { ok: 0, ko: 0, todo: 0, na: 0 };
    for (const section of report?.sezioni || []) {
      for (const item of section.items || []) {
        const state = VALID_STATES.has(item.stato) ? item.stato : "todo";
        counts[state]++;
      }
    }
    const total = counts.ok + counts.ko + counts.todo;
    const done = counts.ok + counts.ko;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { ...counts, total, done, pct };
  }

  // Azzera compilazione, allegati, metadati e audit del report.
  function resetReport(report) {
    return {
      ...report,
      meta: {
        ...(report.meta || {}),
        centraleNome: "",
        anno: "",
        preposto: "",
        operatori: "",
        dataInizio: "",
        dataFine: "",
        oreFunzionamento: "",
        noteGenerali: ""
      },
      sezioni: (report.sezioni || []).map(section => ({
        ...section,
        items: (section.items || []).map(item => ({
          ...item,
          stato: "todo",
          note: "",
          timestamp: "",
          photos: [],
          photoDataUrl: "",
          photoName: ""
        }))
      })),
      audit: {}
    };
  }

  // Restituisce i controlli KO privi delle note obbligatorie.
  function findKoWithoutNotes(report) {
    const problems = [];
    for (const section of report?.sezioni || []) {
      for (const item of section.items || []) {
        if ((item.stato || "todo") === "ko" && !String(item.note || "").trim()) {
          problems.push({ section, item });
        }
      }
    }
    return problems;
  }

  global.ReportModel = Object.freeze({
    SCHEMA_VERSION,
    addItem,
    addSection,
    canMoveItem,
    canMoveSection,
    cloneItem,
    cloneSectionEmpty,
    collectAllIds,
    computeGlobalProgress,
    computeSectionBadges,
    computeSectionProgress,
    findItem,
    findKoWithoutNotes,
    findSection,
    moveItem,
    moveSection,
    normalizeModel,
    normalizeOrders,
    removeItem,
    removeSection,
    resetReport,
    setItemState,
    setSectionState,
    sortByOrder,
    updateAudit,
    updateItem,
    updateMeta,
    updateSection,
    validateModel
  });
})(typeof window !== "undefined" ? window : globalThis);
