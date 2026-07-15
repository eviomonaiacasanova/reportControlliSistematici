/* ========================================================================== */
/* IMAGE UTILITIES                                                             */
/*                                                                            */
/* Tutte le scelte su peso e qualita delle foto sono raccolte qui.             */
/* Modificare solo CONFIG per cambiare il comportamento dell'applicazione.     */
/* ========================================================================== */

(function initReportImages(global) {
  "use strict";

  const CONFIG = Object.freeze({
    maxWidthPx: 1280,
    maxHeightPx: 1280,
    jpegQuality: 0.78,
    pdfMaxWidthMm: 180,
    pdfMaxHeightMm: 60,
    backgroundColor: "#ffffff"
  });

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Impossibile leggere il file selezionato."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Formato immagine non leggibile dal browser."));
      img.src = dataUrl;
    });
  }

  function fitWithin(width, height, maxWidth, maxHeight, allowUpscale = false) {
    const w = Number(width);
    const h = Number(height);
    if (!(w > 0) || !(h > 0)) return { width: 0, height: 0, scale: 0 };

    const maxW = Number(maxWidth) || w;
    const maxH = Number(maxHeight) || h;
    const limit = allowUpscale ? Number.POSITIVE_INFINITY : 1;
    const scale = Math.min(maxW / w, maxH / h, limit);

    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
      scale
    };
  }

  function estimateDataUrlBytes(dataUrl) {
    const comma = String(dataUrl || "").indexOf(",");
    if (comma < 0) return 0;
    const payload = dataUrl.slice(comma + 1);
    const padding = (payload.match(/=*$/) || [""])[0].length;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }

  function normalizePhotoRecord(photo) {
    const source = photo && typeof photo === "object" ? photo : {};
    return {
      dataUrl: String(source.dataUrl || ""),
      name: String(source.name || "foto"),
      width: Number(source.width) || 0,
      height: Number(source.height) || 0,
      sizeBytes: Number(source.sizeBytes) || estimateDataUrlBytes(source.dataUrl),
      format: String(source.format || ""),
      optimized: source.optimized === true
    };
  }

  function isAlreadyOptimized(photo) {
    return Boolean(
      photo &&
      photo.optimized === true &&
      photo.format === "JPEG" &&
      photo.width > 0 &&
      photo.height > 0 &&
      String(photo.dataUrl || "").startsWith("data:image/jpeg")
    );
  }

  async function optimizeDataUrl(dataUrl, name = "foto") {
    const img = await loadImage(dataUrl);
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
      throw new Error("L'immagine non contiene dimensioni valide.");
    }

    const fitted = fitWithin(
      sourceWidth,
      sourceHeight,
      CONFIG.maxWidthPx,
      CONFIG.maxHeightPx
    );

    const canvas = document.createElement("canvas");
    canvas.width = fitted.width;
    canvas.height = fitted.height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Il browser non consente di elaborare l'immagine.");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = CONFIG.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // La conversione in JPEG normalizza anche BMP e altri formati prima di jsPDF.
    const optimizedDataUrl = canvas.toDataURL("image/jpeg", CONFIG.jpegQuality);
    if (!optimizedDataUrl.startsWith("data:image/jpeg")) {
      throw new Error("Il browser non e riuscito a convertire l'immagine in JPEG.");
    }

    return {
      dataUrl: optimizedDataUrl,
      name: String(name || "foto"),
      width: canvas.width,
      height: canvas.height,
      sizeBytes: estimateDataUrlBytes(optimizedDataUrl),
      format: "JPEG",
      optimized: true
    };
  }

  async function optimizeFile(file) {
    if (!file) throw new Error("Nessun file selezionato.");
    const isImage = String(file.type || "").startsWith("image/") || /\.(bmp|jpe?g|png|webp)$/i.test(file.name || "");
    if (!isImage) throw new Error("Seleziona un'immagine JPG, PNG, WebP o BMP.");
    const dataUrl = await readFileAsDataUrl(file);
    return optimizeDataUrl(dataUrl, file.name || "foto");
  }

  async function ensureOptimizedPhoto(photo) {
    const normalized = normalizePhotoRecord(photo);
    if (isAlreadyOptimized(normalized)) return normalized;
    return optimizeDataUrl(normalized.dataUrl, normalized.name);
  }

  function formatSize(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function describePhoto(photo) {
    const p = normalizePhotoRecord(photo);
    const dimensions = p.width && p.height ? `${p.width}x${p.height}` : "";
    const size = p.sizeBytes ? formatSize(p.sizeBytes) : "";
    return [p.name, dimensions, size].filter(Boolean).join(" - ");
  }

  global.ReportImages = Object.freeze({
    CONFIG,
    describePhoto,
    ensureOptimizedPhoto,
    estimateDataUrlBytes,
    fitWithin,
    formatSize,
    normalizePhotoRecord,
    optimizeDataUrl,
    optimizeFile
  });
})(typeof window !== "undefined" ? window : globalThis);
