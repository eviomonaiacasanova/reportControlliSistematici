/* ========================================================================== */
/* PDF UTILITIES - extracted from app.js                                       */
/* ========================================================================== */

(function initReportPdf(global) {
"use strict";

let logoDataUrl = undefined;    // cache logo per PDF
/* 14) PDF                                                                     */
/* ========================================================================== */

async function generatePdf(reportModel, isBlank, generatedAt = new Date()) {
  if (!reportModel) return;

  if (!global.jspdf || !global.jspdf.jsPDF) {
    alert("jsPDF non caricato. Controlla libs/jspdf.umd.min.js e l’ordine degli script.");
    return;
  }

  const { jsPDF } = global.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  const centrale = reportModel.meta.centraleNome || "";
  const anno = reportModel.meta.anno || "";
  const preposto = reportModel.meta.preposto || "";
  const operatori = (reportModel.meta.operatori || "").trim();
  const dataInizio = reportModel.meta.dataInizio || "";
  const dataFine = reportModel.meta.dataFine || "";
  const oreFunzionamento = reportModel.meta.oreFunzionamento ?? "";
  const noteGenerali = String(reportModel.meta.noteGenerali || "").trim();

  // --- HEADER: prima scriviamo SEMPRE testo (così non esce mai vuoto) ---
  doc.setFontSize(14);
  doc.text(`Controlli sistematici - ${centrale} (${anno})`, 14, 16);

  doc.setFontSize(10);
  let headerY = 22;
  doc.text(`Preposto: ${preposto}`, 14, 22);
  if (operatori) {
    doc.text(`Operatori: ${operatori}`, 14, 27);
  }
  else {
    doc.text(`Operatori: ${preposto}`, 14, 27);
  }
  doc.text(`Periodo: ${dataInizio}  ${dataFine ? "-> " + dataFine : ""}`, 14, 32);

  const gp = getGlobalProgressForPdf(reportModel);
  const gpText = gp.total > 0
    ? `Completamento globale: ${gp.pct}% (${gp.done}/${gp.total}, NA: ${gp.na})`
    : "Completamento globale: 0% (nessun controllo)";
  doc.text(gpText, 14, 36);
  headerY = 36;

  if (oreFunzionamento !== "") {
    headerY += 5;
    doc.text(`Ore funzionamento: ${oreFunzionamento}`, 14, headerY);
  }

  const separatorY = headerY + 7;
  doc.setDrawColor(200);
  doc.line(14, separatorY, 196, separatorY);


  // --- LOGO ---
  try {
    const dataUrl = await loadLogoDataUrl();
    if (dataUrl) {
      doc.addImage(dataUrl, "JPEG", 175, 10, 25, 18);
    }
  } catch (e) {
    console.warn("Logo non inserito:", e);
  }

  let y = separatorY + 6;
  const canAutoTable = typeof doc.autoTable === "function";

  if (noteGenerali) {
    if (y > 270) { doc.addPage(); y = 20; }

    if (canAutoTable) {
      doc.autoTable({
        startY: y,
        head: [["Note generali"]],
        body: [[noteGenerali]],
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fontSize: 9, fillColor: [0, 92, 184], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 182 }
        }
      });
      y = doc.lastAutoTable.finalY + 6;
    } else {
      doc.setFillColor(0, 92, 184);
      doc.setTextColor(255);
      doc.rect(14, y, 182, 6, "F");
      doc.setFontSize(9);
      doc.text("Note generali", 16, y + 4);
      doc.setTextColor(0);
      y += 8;

      const noteLines = doc.splitTextToSize(noteGenerali, 176);
      const lineH = 4.5;
      const boxH = Math.max(8, noteLines.length * lineH + 4);
      doc.rect(14, y - 2, 182, boxH);
      for (let i = 0; i < noteLines.length; i++) {
        doc.text(noteLines[i], 16, y + (i * lineH) + 2);
      }
      y += boxH + 4;
    }
  }

  if (!isBlank) {
    const koItems = [];
    for (const section of global.ReportModel.sortByOrder(reportModel.sezioni)) {
      for (const it of global.ReportModel.sortByOrder(section.items || [])) {
        if ((it.stato || "todo") !== "ko") continue;
        koItems.push({
          sezione: section.titolo || "",
          controllo: it.testo || "",
          note: String(it.note || "").trim()
        });
      }
    }

    if (y > 270) { doc.addPage(); y = 20; }

    doc.setFontSize(12);
    doc.setTextColor(180, 0, 0);
    doc.text(`Segnalazione Guasti (${koItems.length})`, 14, y);
    doc.setTextColor(0);
    y += 4;

    if (canAutoTable) {
      const koRows = koItems.length
        ? koItems.map(it => [it.sezione, it.controllo, it.note || "-"])
        : [["", "Nessuna segnalazione guasti", ""]];

      doc.autoTable({
        startY: y,
        head: [["Sezione", "Controllo", "Note"]],
        body: koRows,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fontSize: 9, fillColor: [180, 0, 0], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 42 },
          1: { cellWidth: 78 },
          2: { cellWidth: 62 }
        }
      });

      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFontSize(9);
      if (!koItems.length) {
        doc.text("Nessuna segnalazione guasti", 14, y);
        y += 6;
      } else {
        for (const ko of koItems) {
          const lines = doc.splitTextToSize(
            `[${ko.sezione}] ${ko.controllo} | Note: ${ko.note || "-"}`,
            180
          );
          for (const line of lines) {
            if (y > 280) { doc.addPage(); y = 20; }
            doc.text(line, 14, y);
            y += 4.5;
          }
          y += 1.5;
        }
      }
      y += 2;
      doc.setFontSize(10);
    }
  }

  for (const section of global.ReportModel.sortByOrder(reportModel.sezioni)) {
    const items = global.ReportModel.sortByOrder(section.items || []);
    if (y > 270) { doc.addPage(); y = 20; }

    doc.setFontSize(12);
    doc.text(section.titolo, 14, y);
    y += 4;

    if (canAutoTable) {
      const preparedRows = [];
      for (const item of items) {
        preparedRows.push({
          item,
          photos: isBlank ? [] : await prepareItemPhotos(item, 46, 32)
        });
      }

      const rows = preparedRows.map(({ item, photos }) => {
        const state = isBlank ? "" : (item.stato || "todo");
        const baseCells = [stateToBox(state), item.testo, isBlank ? "" : (item.note || "")];
        if (!isBlank) {
          baseCells.push({
            content: "",
            styles: { minCellHeight: getPhotoCellHeight(photos) }
          });
        }
        return baseCells;
      });

      doc.autoTable({
        startY: y,
        head: [isBlank ? ["", "Controllo", "Note"] : ["", "Controllo", "Note", "Foto"]],
        body: rows,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
        headStyles: { fontSize: 9 },
        columnStyles: isBlank
          ? {
              0: { cellWidth: 10 },
              1: { cellWidth: 110 },
              2: { cellWidth: 60 }
            }
          : {
              0: { cellWidth: 10 },
              1: { cellWidth: 75 },
              2: { cellWidth: 45 },
              3: { cellWidth: 50, cellPadding: 2, valign: "middle" }
            },
        rowPageBreak: "avoid",
        didDrawCell: data => {
          if (isBlank || data.section !== "body" || data.column.index !== 3) return;
          drawPhotosInCell(doc, data.cell, preparedRows[data.row.index]?.photos || []);
        }
      });

      y = doc.lastAutoTable.finalY + 8;
    } else {
      for (const item of items) {
        y = await drawFallbackItemRow(doc, item, y, isBlank);
      }
      y += 6;
    }
  }

  const pageCount = doc.getNumberOfPages();
  const gen = `${global.ReportUtils.formatDateDDMMYYYY(generatedAt)} ${global.ReportUtils.pad2(generatedAt.getHours())}:${global.ReportUtils.pad2(generatedAt.getMinutes())}`;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generato: ${gen}`, 14, 290);
    doc.text(`Pagina ${i}/${pageCount}`, 180, 290);
    doc.setTextColor(0);
  }

  const fileName = global.ReportUtils.buildExportFileName({
    centrale: centrale || "CENTRALE",
    anno,
    label: isBlank ? "modulo_vuoto" : "stato",
    date: generatedAt,
    extension: "pdf"
  });

  doc.save(fileName);
}

function stateToBox(state) {
  // simboli semplici, stampabili
  // todo -> vuoto
  if (state === "ok") return "[x]";
  if (state === "ko") return "[!]";
  if (state === "na") return "[-]";
  return "[ ]";
}

async function prepareItemPhotos(item, maxWidth, maxHeight) {
  const sourcePhotos = Array.isArray(item.photos)
    ? item.photos.filter(photo => photo && photo.dataUrl)
    : [];
  if (!sourcePhotos.length && item.photoDataUrl) {
    sourcePhotos.push({ dataUrl: item.photoDataUrl, name: item.photoName || "foto" });
  }

  const imageConfig = global.ReportImages?.CONFIG;
  const effectiveMaxWidth = Math.min(maxWidth, imageConfig?.pdfMaxWidthMm || maxWidth);
  const effectiveMaxHeight = Math.min(maxHeight, imageConfig?.pdfMaxHeightMm || maxHeight);
  const result = [];
  for (const source of sourcePhotos) {
    let prepared = source;
    try {
      if (global.ReportImages) prepared = await global.ReportImages.ensureOptimizedPhoto(source);
    } catch (error) {
      console.warn(`Foto non inserita (${source.name || "foto"}):`, error);
      continue;
    }

    const dimensions = prepared.width && prepared.height
      ? { width: prepared.width, height: prepared.height }
      : await getImageDims(prepared.dataUrl);
    if (!dimensions) continue;
    const scale = Math.min(
      effectiveMaxWidth / dimensions.width,
      effectiveMaxHeight / dimensions.height,
      1
    );
    result.push({
      dataUrl: prepared.dataUrl,
      type: getImageType(prepared.dataUrl),
      width: dimensions.width * scale,
      height: dimensions.height * scale
    });
  }
  return result;
}

function getPhotoCellHeight(photos) {
  if (!photos.length) return 8;
  const imagesHeight = photos.reduce((total, photo) => total + photo.height, 0);
  return imagesHeight + ((photos.length - 1) * 2) + 4;
}

function drawPhotosInCell(doc, cell, photos) {
  if (!photos.length) return;
  const contentHeight = photos.reduce((total, photo) => total + photo.height, 0)
    + ((photos.length - 1) * 2);
  let imageY = cell.y + Math.max(2, (cell.height - contentHeight) / 2);

  for (const photo of photos) {
    const imageX = cell.x + Math.max(2, (cell.width - photo.width) / 2);
    try {
      doc.addImage(photo.dataUrl, photo.type, imageX, imageY, photo.width, photo.height, undefined, "FAST");
    } catch (error) {
      console.warn("Foto non inserita nella cella:", error);
    }
    imageY += photo.height + 2;
  }
}

async function drawFallbackItemRow(doc, item, y, isBlank) {
  const photos = isBlank ? [] : await prepareItemPhotos(item, 48, 32);
  const controlLines = doc.splitTextToSize(item.testo || "", isBlank ? 106 : 71);
  const noteLines = doc.splitTextToSize(isBlank ? "" : (item.note || ""), isBlank ? 56 : 41);
  const textHeight = Math.max(controlLines.length, noteLines.length, 1) * 4 + 4;
  const rowHeight = Math.max(10, textHeight, getPhotoCellHeight(photos));

  if (y + rowHeight > 280) {
    doc.addPage();
    y = 20;
  }

  const stateRight = 24;
  const controlRight = isBlank ? 134 : 99;
  const noteRight = isBlank ? 196 : 144;
  doc.rect(14, y, 182, rowHeight);
  doc.line(stateRight, y, stateRight, y + rowHeight);
  doc.line(controlRight, y, controlRight, y + rowHeight);
  if (!isBlank) doc.line(noteRight, y, noteRight, y + rowHeight);

  doc.setFontSize(9);
  doc.text(stateToBox(isBlank ? "" : (item.stato || "todo")), 16, y + 5);
  doc.text(controlLines, 26, y + 5);
  doc.text(noteLines, controlRight + 2, y + 5);
  if (!isBlank) {
    drawPhotosInCell(doc, { x: noteRight, y, width: 52, height: rowHeight }, photos);
  }
  return y + rowHeight;
}

function getImageType(dataUrl) {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  if (dataUrl.startsWith("data:image/bmp") || dataUrl.startsWith("data:image/x-ms-bmp")) return "BMP";
  return "JPEG";
}

function getImageDims(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function getGlobalProgressForPdf(reportModel) {
  return global.ReportModel.computeGlobalProgress(reportModel);
}

function loadLogoDataUrl() {
  return new Promise((resolve) => {
    if (logoDataUrl !== undefined) return resolve(logoDataUrl);

    // NOTE: se cambi logo.jpg, rigenera assets/logo.inline.js con:
    // ./scripts/update-logo-base64dataurl.sh
    if (global.LOGO_DATA_URL) {
      logoDataUrl = global.LOGO_DATA_URL;
      return resolve(logoDataUrl);
    }

    logoDataUrl = null;
    resolve(null);
  });
}

/* ========================================================================== */

global.generatePdf = generatePdf;
})(typeof window !== "undefined" ? window : globalThis);
