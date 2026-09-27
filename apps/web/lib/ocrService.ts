/**
 * Computer Vision & Optical Character Recognition (OCR) Engine for Warehouse SKU Scanning.
 * 
 * Specifically designed for industrial 2D imagers and mobile smartphones in warehouse environments
 * where products do not have printed barcodes, but have printed/stamped numeric or alphanumeric SKU codes.
 */

export interface SkuCandidate {
  code: string;
  confidence: number; // 0 to 100
  source: 'catalog_match' | 'keyword' | 'numeric' | 'alphanumeric' | 'raw';
  isKnownProduct?: boolean;
  productName?: string;
  matchedField?: 'sku' | 'barcode';
}

export interface PreprocessOptions {
  invert?: boolean;
  contrast?: number; // 1.0 = normal, 1.5 - 2.0 = boosted
  binarize?: boolean; // Otsu binarization
  scaleFactor?: number;
}

export interface KnownProductLookup {
  sku: string;
  name: string;
  barcode?: string;
}

/**
 * Calculates Otsu's optimal threshold for grayscale image binarization.
 * Dynamically separates dark text from light packaging under varying warehouse lighting.
 */
export function calculateOtsuThreshold(grayPixels: Uint8ClampedArray): number {
  const histogram = new Array(256).fill(0);
  const total = grayPixels.length;

  for (let i = 0; i < total; i++) {
    histogram[grayPixels[i]]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * histogram[t];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;

    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varianceBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Preprocesses an image or video frame with Computer Vision algorithms:
 * 1. Cropping to the aiming reticle area.
 * 2. High-quality scaling for optimal OCR font height (30-60px).
 * 3. Grayscale conversion.
 * 4. Contrast stretching & enhancement.
 * 5. Otsu's adaptive binarization (sharp black/white text edges).
 * 6. Polarity inversion (for white text on dark packaging).
 */
export function preprocessCanvasForOCR(
  source: CanvasImageSource,
  cropRect: { x: number; y: number; width: number; height: number },
  options: PreprocessOptions = {}
): HTMLCanvasElement {
  const {
    invert = false,
    contrast = 1.5,
    binarize = true,
    scaleFactor = 2,
  } = options;

  const canvas = document.createElement('canvas');
  const targetWidth = Math.max(200, Math.round(cropRect.width * scaleFactor));
  const targetHeight = Math.max(100, Math.round(cropRect.height * scaleFactor));

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw cropped and scaled image onto canvas
  ctx.drawImage(
    source,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    targetWidth,
    targetHeight
  );

  const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imgData.data;
  const numPixels = targetWidth * targetHeight;
  const grayBuffer = new Uint8ClampedArray(numPixels);

  // 1. Grayscale luminance conversion
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard Rec. 601 luma formula
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    grayBuffer[j] = gray;
  }

  // 2. Compute Otsu threshold if binarization is enabled
  const otsuThreshold = binarize ? calculateOtsuThreshold(grayBuffer) : 128;

  // 3. Contrast adjustment factor
  // contrast factor = (259 * (contrastLevel + 255)) / (255 * (259 - contrastLevel))
  const contrastFactor = (259 * ((contrast - 1) * 128 + 255)) / (255 * (259 - (contrast - 1) * 128));

  // 4. Pixel transformation (Contrast, Binarization, Inversion)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    let gray = grayBuffer[j];

    // Contrast stretching
    gray = contrastFactor * (gray - 128) + 128;
    gray = Math.max(0, Math.min(255, gray));

    let finalVal: number;
    if (binarize) {
      finalVal = gray < otsuThreshold ? 0 : 255;
    } else {
      finalVal = gray;
    }

    if (invert) {
      finalVal = 255 - finalVal;
    }

    data[i] = finalVal;     // R
    data[i + 1] = finalVal; // G
    data[i + 2] = finalVal; // B
    data[i + 3] = 255;      // A
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Extracts and scores SKU candidates from raw OCR text using regex patterns
 * and optional cross-referencing against the product catalog database.
 */
export function extractSkuCandidates(
  rawText: string,
  knownProducts: KnownProductLookup[] = []
): SkuCandidate[] {
  if (!rawText || !rawText.trim()) return [];

  const candidatesMap = new Map<string, SkuCandidate>();

  const addCandidate = (
    code: string,
    source: SkuCandidate['source'],
    baseConfidence: number
  ) => {
    // Clean string: trim, remove stray quotes/parentheses, uppercase
    const clean = code.trim().replace(/^['"([{<]+|['")\]}>]+$/g, '').toUpperCase();
    if (clean.length < 3 || clean.length > 30) return;

    // Filter out common non-SKU packaging words
    const blacklist = new Set([
      'LOTE', 'LOT', 'FECHA', 'DATE', 'EXP', 'VENC', 'PESO', 'WEIGHT',
      'CANT', 'QTY', 'QUANTITY', 'MADE', 'CHINA', 'MEXICO', 'ORIGEN',
      'TOTAL', 'NETO', 'BRUTO', 'PIEZA', 'PIEZAS', 'PZAS', 'UNID',
      'MODEL', 'MODELO', 'NAME', 'DESCR', 'FABRICADO', 'IMPORTADO',
      'SERIAL', 'SERIE', 'HECHO', 'CAJA', 'PACK', 'BULTO', 'ENVIO'
    ]);
    if (blacklist.has(clean)) return;

    // Check if matches known product in database
    const matchedProduct = knownProducts.find(
      (p) =>
        p.sku.toUpperCase() === clean ||
        (p.barcode && p.barcode.toUpperCase() === clean)
    );

    let finalConfidence = baseConfidence;
    let isKnownProduct = false;
    let productName: string | undefined;
    let matchedField: 'sku' | 'barcode' | undefined;

    if (matchedProduct) {
      finalConfidence = 100;
      isKnownProduct = true;
      productName = matchedProduct.name;
      matchedField = matchedProduct.sku.toUpperCase() === clean ? 'sku' : 'barcode';
    }

    const existing = candidatesMap.get(clean);
    if (!existing || existing.confidence < finalConfidence) {
      candidatesMap.set(clean, {
        code: clean,
        confidence: finalConfidence,
        source: isKnownProduct ? 'catalog_match' : source,
        isKnownProduct,
        productName,
        matchedField,
      });
    }
  };

  // 1. Keyword-prefixed patterns (e.g. SKU: 12345, COD: ABC-01, ART: 99482)
  const keywordRegex = /(?:SKU|COD|CODIGO|ART|ARTICULO|REF|REFERENCIA|PART|P\/N|ITEM|NO|MODELO|MOD)\s*[:#.-]?\s*([A-Za-z0-9\-_./]{3,24})/gi;
  let match: RegExpExecArray | null;
  while ((match = keywordRegex.exec(rawText)) !== null) {
    if (match[1]) {
      addCandidate(match[1], 'keyword', 92);
    }
  }

  // 2. Pure numeric sequences of 4 to 18 digits (standard numeric SKUs, EAN, UPC)
  const numericRegex = /\b\d{4,18}\b/g;
  while ((match = numericRegex.exec(rawText)) !== null) {
    if (match[0]) {
      addCandidate(match[0], 'numeric', 85);
    }
  }

  // 3. Delimited alphanumeric patterns (e.g. ELEC-001, PRD-1029-A, RACK-01)
  const alphanumericRegex = /\b[A-Za-z0-9]{2,8}[-_/.][A-Za-z0-9]{2,8}(?:[-_/.][A-Za-z0-9]{1,8})?\b/gi;
  while ((match = alphanumericRegex.exec(rawText)) !== null) {
    if (match[0]) {
      addCandidate(match[0], 'alphanumeric', 88);
    }
  }

  // 4. Standalone alphanumeric tokens containing at least one digit (e.g. 1024B, X9001)
  const tokenRegex = /\b(?=[A-Za-z0-9\-_]{4,16}\b)(?=.*\d)[A-Za-z0-9\-_]+\b/g;
  while ((match = tokenRegex.exec(rawText)) !== null) {
    if (match[0]) {
      addCandidate(match[0], 'raw', 70);
    }
  }

  // Sort candidates by confidence descending
  const sorted = Array.from(candidatesMap.values()).sort(
    (a, b) => b.confidence - a.confidence
  );

  return sorted;
}

/**
 * Executes Optical Character Recognition (OCR) on an HTMLCanvasElement using Tesseract.js.
 * Includes dynamic worker initialization, progress tracking, and graceful fallback.
 */
export async function recognizeTextFromCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (progress: number, status: string) => void
): Promise<{ text: string; confidence: number }> {
  try {
    const { createWorker } = await import('tesseract.js');

    onProgress?.(10, 'Iniciando motor de visión artificial...');

    const worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 80) + 15;
          onProgress?.(pct, 'Reconociendo formas de dígitos y texto...');
        } else if (m.status === 'loading tesseract core') {
          onProgress?.(20, 'Cargando red neuronal de caracteres...');
        }
      },
    });

    onProgress?.(30, 'Optimizando vocabulario numérico y de SKU...');

    // Prioritize alphanumeric, digits and SKU punctuation
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._/#: ',
      tessedit_pageseg_mode: '6' as any, // Assume a single uniform block of text
    });

    onProgress?.(45, 'Escaneando píxeles con IA...');

    const ret = await worker.recognize(canvas);

    onProgress?.(95, 'Finalizando reconocimiento...');

    await worker.terminate();

    onProgress?.(100, 'Completado');

    return {
      text: ret.data.text || '',
      confidence: ret.data.confidence || 0,
    };
  } catch (err: unknown) {
    console.warn('[OCR Service] Error running Tesseract worker:', err);
    throw new Error(
      err instanceof Error
        ? err.message
        : 'Error durante el procesamiento OCR de la imagen.'
    );
  }
}
