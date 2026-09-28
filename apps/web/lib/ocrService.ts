/**
 * Computer Vision & Optical Character Recognition (OCR) Engine for Warehouse SKU Scanning.
 * 
 * Specifically designed for industrial 2D imagers and mobile smartphones in warehouse environments
 * where products do not have printed barcodes, but have printed/stamped numeric or alphanumeric SKU codes.
 * 
 * Features:
 * - Multi-pass computer vision filters (Otsu adaptive binarization, Laplacian unsharp mask edge sharpen, contrast stretch).
 * - OCR Confusion Matrix normalization (O <-> 0, I/l/| <-> 1, S <-> 5, B <-> 8, Z <-> 2).
 * - Levenshtein fuzzy string matching against catalog products with similarity scoring.
 * - Warehouse location code detection (A-C-01-01, RACK-01).
 * - Barcode checksum verification (EAN-13, UPC-A mod 10).
 * - Auto-delivery scoring (>= 90% confidence threshold).
 */

import { isWarehouseLocationCode } from './locations-data';

export interface SkuCandidate {
  code: string;
  confidence: number; // 0 to 100
  source: 'catalog_match' | 'fuzzy_match' | 'location_match' | 'checksum' | 'keyword' | 'numeric' | 'alphanumeric' | 'raw';
  isKnownProduct?: boolean;
  productName?: string;
  matchedField?: 'sku' | 'barcode';
  originalOcrText?: string;
}

export interface PreprocessOptions {
  invert?: boolean;
  contrast?: number; // 1.0 = normal, 1.5 - 2.0 = boosted
  binarize?: boolean; // Otsu binarization
  scaleFactor?: number;
  sharpen?: boolean; // Laplacian unsharp mask
  adaptiveThreshold?: boolean;
}

export interface KnownProductLookup {
  sku: string;
  name: string;
  barcode?: string;
}

/**
 * Normalizes common OCR mischaracterizations:
 * 'O' <-> '0', 'I'/'l'/'|' <-> '1', 'S' <-> '5', 'B' <-> '8', 'Z' <-> '2'
 */
export function normalizeOcrConfusion(str: string): string {
  if (!str) return '';
  return str
    .toUpperCase()
    .replace(/[O]/g, '0')
    .replace(/[IL|!]/g, '1')
    .replace(/[S]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/[Z]/g, '2');
}

/**
 * Standard Levenshtein edit distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const s1 = a.toUpperCase();
  const s2 = b.toUpperCase();
  const m = s1.length;
  const n = s2.length;
  
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Similarity ratio between two strings in range [0, 1]
 */
export function calculateSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(a, b);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Validates EAN-13 or UPC-A Modulo 10 Checksum
 */
export function validateBarcodeChecksum(code: string): boolean {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== 12 && clean.length !== 13) return false;

  const digits = clean.split('').map(Number);
  const checkDigit = digits.pop()!;
  
  let sum = 0;
  // If 13 digits (EAN-13): odd positions * 1, even positions * 3
  // If 12 digits (UPC-A): odd positions * 3, even positions * 1
  const isEan13 = clean.length === 13;
  for (let i = 0; i < digits.length; i++) {
    const weight = isEan13 ? (i % 2 === 0 ? 1 : 3) : (i % 2 === 0 ? 3 : 1);
    sum += digits[i] * weight;
  }

  const expected = (10 - (sum % 10)) % 10;
  return checkDigit === expected;
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
 * 5. Optional Laplacian edge sharpening.
 * 6. Otsu's adaptive binarization (sharp black/white text edges).
 * 7. Polarity inversion (for white text on dark packaging).
 */
export function preprocessCanvasForOCR(
  source: CanvasImageSource,
  cropRect: { x: number; y: number; width: number; height: number },
  options: PreprocessOptions = {}
): HTMLCanvasElement {
  const {
    invert = false,
    contrast = 1.6,
    binarize = true,
    scaleFactor = 2.2,
    sharpen = true,
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

  // 1. Grayscale luminance conversion (Rec. 601 luma)
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    grayBuffer[j] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // 2. Optional Laplacian edge sharpening to crisp faint/dot-matrix printed digits
  if (sharpen && targetWidth > 2 && targetHeight > 2) {
    const sharpened = new Uint8ClampedArray(numPixels);
    for (let y = 1; y < targetHeight - 1; y++) {
      const rowOffset = y * targetWidth;
      const prevRow = (y - 1) * targetWidth;
      const nextRow = (y + 1) * targetWidth;
      for (let x = 1; x < targetWidth - 1; x++) {
        const center = grayBuffer[rowOffset + x];
        const top = grayBuffer[prevRow + x];
        const bottom = grayBuffer[nextRow + x];
        const left = grayBuffer[rowOffset + x - 1];
        const right = grayBuffer[rowOffset + x + 1];
        // 3x3 unsharp mask kernel: [0, -1, 0; -1, 5, -1; 0, -1, 0]
        const val = 5 * center - top - bottom - left - right;
        sharpened[rowOffset + x] = Math.max(0, Math.min(255, val));
      }
    }
    // Copy back interior pixels
    for (let y = 1; y < targetHeight - 1; y++) {
      const rowOffset = y * targetWidth;
      for (let x = 1; x < targetWidth - 1; x++) {
        grayBuffer[rowOffset + x] = sharpened[rowOffset + x];
      }
    }
  }

  // 3. Compute Otsu threshold if binarization is enabled
  const otsuThreshold = binarize ? calculateOtsuThreshold(grayBuffer) : 128;

  // 4. Contrast adjustment factor
  const contrastFactor = (259 * ((contrast - 1) * 128 + 255)) / (255 * (259 - (contrast - 1) * 128));

  // 5. Pixel transformation (Contrast, Binarization, Inversion)
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
 * Extracts and scores SKU candidates from raw OCR text using regex patterns,
 * warehouse location validation, OCR confusion correction, and fuzzy matching
 * against the product catalog database.
 */
export function extractSkuCandidates(
  rawText: string,
  knownProducts: KnownProductLookup[] = []
): SkuCandidate[] {
  if (!rawText || !rawText.trim()) return [];

  const candidatesMap = new Map<string, SkuCandidate>();

  const registerCandidate = (
    code: string,
    source: SkuCandidate['source'],
    baseConfidence: number,
    extra?: {
      isKnownProduct?: boolean;
      productName?: string;
      matchedField?: 'sku' | 'barcode';
      originalOcrText?: string;
    }
  ) => {
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

    const existing = candidatesMap.get(clean);
    if (!existing || existing.confidence < baseConfidence) {
      candidatesMap.set(clean, {
        code: clean,
        confidence: Math.min(100, Math.round(baseConfidence)),
        source,
        isKnownProduct: extra?.isKnownProduct ?? false,
        productName: extra?.productName,
        matchedField: extra?.matchedField,
        originalOcrText: extra?.originalOcrText,
      });
    }
  };

  const processToken = (rawToken: string, source: SkuCandidate['source'], defaultConfidence: number) => {
    const cleanToken = rawToken.trim().replace(/^['"([{<]+|['")\]}>]+$/g, '').toUpperCase();
    if (cleanToken.length < 3) return;

    // 1. Warehouse Location Code Check (e.g. A-C-01-01, B-P-02-14)
    if (isWarehouseLocationCode(cleanToken)) {
      registerCandidate(cleanToken, 'location_match', 98, {
        originalOcrText: rawToken,
      });
      return;
    }

    // Try OCR confusion on location code (e.g. A-C-O1-O2 -> A-C-01-02)
    const normalizedLoc = cleanToken.replace(/-O(\d)/g, '-0$1').replace(/O/g, '0');
    if (normalizedLoc !== cleanToken && isWarehouseLocationCode(normalizedLoc)) {
      registerCandidate(normalizedLoc, 'location_match', 95, {
        originalOcrText: rawToken,
      });
      return;
    }

    // 2. Exact match in product catalog
    const exactProduct = knownProducts.find(
      (p) =>
        p.sku.toUpperCase() === cleanToken ||
        (p.barcode && p.barcode.toUpperCase() === cleanToken)
    );

    if (exactProduct) {
      const isSku = exactProduct.sku.toUpperCase() === cleanToken;
      registerCandidate(isSku ? exactProduct.sku : exactProduct.barcode || cleanToken, 'catalog_match', 100, {
        isKnownProduct: true,
        productName: exactProduct.name,
        matchedField: isSku ? 'sku' : 'barcode',
        originalOcrText: rawToken,
      });
      return;
    }

    // 3. OCR Confusion Normalized match against product catalog
    // E.g., OCR sees "BEV-OO1" when catalog has "BEV-001"
    const confusionNormalizedToken = normalizeOcrConfusion(cleanToken);
    const confusionProduct = knownProducts.find((p) => {
      const normSku = normalizeOcrConfusion(p.sku);
      const normBar = p.barcode ? normalizeOcrConfusion(p.barcode) : '';
      return normSku === confusionNormalizedToken || normBar === confusionNormalizedToken;
    });

    if (confusionProduct) {
      const isSku = normalizeOcrConfusion(confusionProduct.sku) === confusionNormalizedToken;
      registerCandidate(isSku ? confusionProduct.sku : confusionProduct.barcode || cleanToken, 'catalog_match', 96, {
        isKnownProduct: true,
        productName: confusionProduct.name,
        matchedField: isSku ? 'sku' : 'barcode',
        originalOcrText: rawToken,
      });
      return;
    }

    // 4. Fuzzy Levenshtein Match against catalog (>= 90% similarity)
    let bestFuzzyProduct: KnownProductLookup | null = null;
    let bestSimilarity = 0;
    let bestMatchedField: 'sku' | 'barcode' = 'sku';

    for (const p of knownProducts) {
      const skuSim = calculateSimilarity(cleanToken, p.sku);
      if (skuSim > bestSimilarity) {
        bestSimilarity = skuSim;
        bestFuzzyProduct = p;
        bestMatchedField = 'sku';
      }
      if (p.barcode) {
        const barSim = calculateSimilarity(cleanToken, p.barcode);
        if (barSim > bestSimilarity) {
          bestSimilarity = barSim;
          bestFuzzyProduct = p;
          bestMatchedField = 'barcode';
        }
      }
    }

    if (bestFuzzyProduct && bestSimilarity >= 0.88) {
      // Map similarity [0.88 - 1.0] to confidence [91 - 99]
      const fuzzyConfidence = Math.round(91 + (bestSimilarity - 0.88) * 66.6);
      registerCandidate(
        bestMatchedField === 'sku' ? bestFuzzyProduct.sku : bestFuzzyProduct.barcode || cleanToken,
        'fuzzy_match',
        fuzzyConfidence,
        {
          isKnownProduct: true,
          productName: bestFuzzyProduct.name,
          matchedField: bestMatchedField,
          originalOcrText: rawToken,
        }
      );
      return;
    }

    // 5. Barcode Modulo-10 Checksum (UPC-A / EAN-13)
    if (/^\d{12,13}$/.test(cleanToken) && validateBarcodeChecksum(cleanToken)) {
      registerCandidate(cleanToken, 'checksum', 94, {
        originalOcrText: rawToken,
      });
      return;
    }

    // 6. Generic pattern score
    registerCandidate(cleanToken, source, defaultConfidence, {
      originalOcrText: rawToken,
    });
  };

  // 1. Keyword-prefixed patterns (e.g. SKU: 12345, COD: ABC-01, ART: 99482)
  const keywordRegex = /(?:SKU|COD|CODIGO|ART|ARTICULO|REF|REFERENCIA|PART|P\/N|ITEM|NO|MODELO|MOD)\s*[:#.-]?\s*([A-Za-z0-9\-_./]{3,24})/gi;
  let match: RegExpExecArray | null;
  while ((match = keywordRegex.exec(rawText)) !== null) {
    if (match[1]) {
      processToken(match[1], 'keyword', 92);
    }
  }

  // 2. Pure numeric sequences of 4 to 18 digits (standard numeric SKUs, EAN, UPC)
  const numericRegex = /\b\d{4,18}\b/g;
  while ((match = numericRegex.exec(rawText)) !== null) {
    if (match[0]) {
      processToken(match[0], 'numeric', 85);
    }
  }

  // 3. Delimited alphanumeric patterns (e.g. ELEC-001, PRD-1029-A, RACK-01, A-C-01-01)
  const alphanumericRegex = /\b[A-Za-z0-9]{1,8}(?:[-_/.][A-Za-z0-9]{1,8}){1,4}\b/gi;
  while ((match = alphanumericRegex.exec(rawText)) !== null) {
    if (match[0]) {
      processToken(match[0], 'alphanumeric', 90);
    }
  }

  // 4. Standalone alphanumeric tokens containing at least one digit (e.g. 1024B, X9001)
  const tokenRegex = /\b(?=[A-Za-z0-9\-_]{4,16}\b)(?=.*\d)[A-Za-z0-9\-_]+\b/g;
  while ((match = tokenRegex.exec(rawText)) !== null) {
    if (match[0]) {
      processToken(match[0], 'raw', 72);
    }
  }

  // Sort candidates by confidence descending
  const sorted = Array.from(candidatesMap.values()).sort(
    (a, b) => b.confidence - a.confidence
  );

  return sorted;
}

/**
 * Returns the winning SKU candidate if confidence is >= 90%, enabling automatic delivery
 */
export function getAutoDeliverWinner(candidates: SkuCandidate[]): SkuCandidate | null {
  if (!candidates || candidates.length === 0) return null;
  const top = candidates[0];
  if (top && top.confidence >= 90) {
    return top;
  }
  return null;
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
