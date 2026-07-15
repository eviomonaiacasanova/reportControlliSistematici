/* ========================================================================== */
/* UTILITA CONDIVISE                                                          */
/* Date, identificativi e nomi dei file esportati vivono in questo modulo.    */
/* ========================================================================== */

(function initReportUtils(global) {
  "use strict";

  // Aggiunge uno zero iniziale ai numeri composti da una sola cifra.
  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  // Converte una data nel formato leggibile GG/MM/AAAA.
  function formatDateDDMMYYYY(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  // Converte una data nel formato compatto AAAAMMGG.
  function formatDateYYYYMMDD(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  }

  // Converte una data nel formato AAAAMMGG_HHMM usato negli export.
  function formatDateTimeYYYYMMDDHHMM(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return `${formatDateYYYYMMDD(date)}_${pad2(date.getHours())}${pad2(date.getMinutes())}`;
  }

  // Converte una data ISO AAAA-MM-GG nel formato GG/MM/AAAA.
  function formatYmdToDmy(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
  }

  // Converte una data GG/MM/AAAA nel formato ISO AAAA-MM-GG.
  function formatDmyToYmd(value) {
    const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
  }

  // Normalizza i formati di data accettati nel formato GG/MM/AAAA.
  function normalizeDateString(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatYmdToDmy(text);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text : formatDateDDMMYYYY(parsed);
  }

  // Restituisce la data indicata, o quella corrente, nel formato GG/MM/AAAA.
  function nowDmy(now = new Date()) {
    return formatDateDDMMYYYY(now);
  }

  // Genera un identificativo con data, ora e una componente casuale.
  function makeId(prefix, now = new Date(), random = Math.random) {
    const stamp = [
      now.getFullYear(),
      pad2(now.getMonth() + 1),
      pad2(now.getDate()),
      "_",
      pad2(now.getHours()),
      pad2(now.getMinutes()),
      pad2(now.getSeconds())
    ].join("");
    const suffix = random().toString(36).slice(2, 7);
    return `${prefix}_${stamp}_${suffix}`;
  }

  // Genera e registra un identificativo non ancora presente nell'insieme.
  function makeUniqueId(prefix, existingIds, idFactory = makeId) {
    let id = idFactory(prefix);
    while (existingIds.has(id)) id = idFactory(prefix);
    existingIds.add(id);
    return id;
  }

  // Rende sicuro il nome della centrale per l'uso nel nome di un file.
  function sanitizeFilePart(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/[^A-Z0-9_]/g, "");
  }

  // Costruisce un nome export coerente per JSON e PDF.
  function buildExportFileName({ centrale, anno, label = "", date = new Date(), extension }) {
    const parts = [sanitizeFilePart(centrale), sanitizeFilePart(anno)];
    if (label) parts.push(String(label).trim().replace(/[^A-Za-z0-9_]/g, ""));
    parts.push(formatDateTimeYYYYMMDDHHMM(date));
    const ext = String(extension || "").replace(/^\./, "");
    return `${parts.filter(Boolean).join("_")}.${ext}`;
  }

  global.ReportUtils = Object.freeze({
    buildExportFileName,
    formatDateDDMMYYYY,
    formatDateTimeYYYYMMDDHHMM,
    formatDateYYYYMMDD,
    formatDmyToYmd,
    formatYmdToDmy,
    makeId,
    makeUniqueId,
    normalizeDateString,
    nowDmy,
    pad2,
    sanitizeFilePart
  });
})(typeof window !== "undefined" ? window : globalThis);
