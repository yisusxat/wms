"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import Icon from "./Icon";
import {
  preprocessCanvasForOCR,
  extractSkuCandidates,
  recognizeTextFromCanvas,
  getAutoDeliverWinner,
  filterInventoryByScan,
  getAutoDeliverInventoryWinner,
  cleanOcrText,
  OcrWordDetail,
  SkuCandidate,
  KnownProductLookup,
  ScannedInventoryProduct,
} from "../../lib/ocrService";

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
  label?: string;
  catalogProducts?: Array<{ sku: string; name: string; barcode?: string }>;
  inventoryProducts?: Array<ScannedInventoryProduct>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect(imageSource: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
    };
  }
}

const DEFAULT_INVENTORY_SEED: ScannedInventoryProduct[] = [
  {
    id: "inv-seed-1",
    sku: "ARR-DIA-001",
    name: "Arroz Diana Especial 1kg",
    barcode: "7702010010015",
    quantity: 85,
    locationCode: "A-C-01-01",
    category: "Granos y Abarrotes",
    unit: "kg",
  },
  {
    id: "inv-seed-2",
    sku: "ACE-PRE-002",
    name: "Aceite Premier 1000ml",
    barcode: "7702010010022",
    quantity: 42,
    locationCode: "A-C-01-02",
    category: "Aceites y Grasas",
    unit: "litro",
  },
  {
    id: "inv-seed-3",
    sku: "BEV-001",
    name: "Cerveza Artesanal IPA 330ml",
    barcode: "7702010010039",
    quantity: 120,
    locationCode: "A-P-02-04",
    category: "Bebidas",
    unit: "botella",
  },
  {
    id: "inv-seed-4",
    sku: "HAR-PAN-002",
    name: "Harina PAN 1kg",
    barcode: "7702010010046",
    quantity: 64,
    locationCode: "A-C-01-05",
    category: "Harinas",
    unit: "paquete",
  },
];

export default function BarcodeScanner({
  onScan,
  onClose,
  label = "SKU / Código de barras",
  catalogProducts = [],
  inventoryProducts = [],
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ocrContinuousIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScanTimeRef = useRef<number>(0);

  const [mode, setMode] = useState<"camera" | "ocr" | "manual">("camera");
  const [manualValue, setManualValue] = useState("");
  const [status, setStatus] = useState<"starting" | "scanning" | "detected" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Autofocus state
  const [hasAutofocus, setHasAutofocus] = useState(false);
  const [focusIndicator, setFocusIndicator] = useState<{ x: number; y: number; active: boolean } | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active product catalog (auto-hydrated from API if caller provided none)
  const [activeCatalog, setActiveCatalog] = useState<KnownProductLookup[]>(catalogProducts);

  // Active inventory products loaded in warehouse
  const [inventoryList, setInventoryList] = useState<ScannedInventoryProduct[]>(
    inventoryProducts && inventoryProducts.length > 0 ? inventoryProducts : DEFAULT_INVENTORY_SEED
  );
  const [liveScannedQuery, setLiveScannedQuery] = useState("");

  // Computer Vision & OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState("");
  const [ocrCandidates, setOcrCandidates] = useState<SkuCandidate[]>([]);
  const [invertContrast, setInvertContrast] = useState(false);
  const [continuousOcr, setContinuousOcr] = useState(false);
  const [binarizationMethod, setBinarizationMethod] = useState<"auto" | "adaptive" | "otsu">("auto");
  const [ocrWords, setOcrWords] = useState<OcrWordDetail[]>([]);
  const [ocrRawText, setOcrRawText] = useState("");
  const [autoDeliveredWinner, setAutoDeliveredWinner] = useState<{
    code: string;
    confidence: number;
    productName?: string;
    locationCode?: string;
    quantity?: number;
  } | null>(null);

  // Auto-hydrate product catalog from backend if not provided
  useEffect(() => {
    if (catalogProducts && catalogProducts.length > 0) {
      setActiveCatalog(catalogProducts);
      return;
    }

    let isMounted = true;
    const fetchCatalog = async () => {
      try {
        const res = await fetch("/api/products?pageSize=100");
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json && Array.isArray(json.items)) {
            setActiveCatalog(
              json.items.map((p: { sku: string; name: string; barcode?: string }) => ({
                sku: p.sku,
                name: p.name,
                barcode: p.barcode,
              }))
            );
          }
        }
      } catch {
        // Non-blocking fallback
      }
    };

    void fetchCatalog();
    return () => {
      isMounted = false;
    };
  }, [catalogProducts]);

  // Auto-hydrate warehouse inventory items if not provided
  useEffect(() => {
    if (inventoryProducts && inventoryProducts.length > 0) {
      setInventoryList(inventoryProducts);
      return;
    }

    let isMounted = true;
    const fetchInventory = async () => {
      try {
        const res = await fetch("/api/inventory");
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json && Array.isArray(json.items) && json.items.length > 0) {
            const normalized = json.items.map((it: any) => ({
              id: it.id || `inv-${it.sku || it.product?.sku}`,
              sku: it.sku || it.product?.sku || "",
              name: it.name || it.product?.name || "Producto",
              barcode: it.barcode || it.product?.barcode,
              quantity: it.quantity ?? it.product?.quantity ?? 0,
              locationCode: it.locationCode || it.location?.code || "",
              category: it.category || it.product?.category,
              unit: it.unit || it.product?.unit || "uds",
            }));
            setInventoryList(normalized);
          }
        }
      } catch {
        // Non-blocking fallback
      }
    };

    void fetchInventory();
    return () => {
      isMounted = false;
    };
  }, [inventoryProducts]);



  // Haptic feedback
  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch {
      // Ignore vibration error
    }
  }, []);

  // Audio feedback (safe Web Audio API beep)
  const triggerAudioBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        try {
          osc.stop();
          ctx.close();
        } catch {
          // Ignore audio cleanup error
        }
      }, 120);
    } catch {
      // Audio might be blocked before user interaction
    }
  }, []);

  // Handle scanned code with debouncing and instant delivery
  const handleDetectedCode = useCallback(
    (code: string, force = false, extra?: { productName?: string; locationCode?: string; quantity?: number; score?: number }) => {
      const clean = code.trim();
      if (!clean) return;

      const now = Date.now();
      if (!force && now - lastScanTimeRef.current < 1500) {
        return; // Prevent duplicate reads in under 1.5s
      }
      lastScanTimeRef.current = now;

      setLastScanned(clean);
      setStatus("detected");
      triggerHaptic();
      triggerAudioBeep();

      if (extra) {
        setAutoDeliveredWinner({
          code: clean,
          confidence: extra.score || 95,
          productName: extra.productName,
          locationCode: extra.locationCode,
          quantity: extra.quantity,
        });
      }

      // Return to scanning state after short visual indicator
      setTimeout(() => {
        setStatus("scanning");
      }, 1200);

      onScan(clean);
    },
    [onScan, triggerAudioBeep, triggerHaptic]
  );

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (ocrContinuousIntervalRef.current) {
      clearInterval(ocrContinuousIntervalRef.current);
      ocrContinuousIntervalRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        // Ignore stop error
      }
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop error
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setHasTorch(false);
    setHasAutofocus(false);
    setFocusIndicator(null);
  }, []);

  // Autofocus trigger function (supports coordinates or center)
  const triggerAutofocus = useCallback(async (x?: number, y?: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }

    setFocusIndicator({
      x: x ?? 140,
      y: y ?? 100,
      active: true,
    });

    if (track) {
      try {
        const caps = (track.getCapabilities?.() || {}) as Record<string, unknown>;
        if (caps && "focusMode" in caps) {
          // Cycle auto then continuous to force immediate hardware lens refocus
          await track.applyConstraints({
            advanced: [{ focusMode: "auto" } as MediaTrackConstraintSet],
          } as MediaTrackConstraints);

          setTimeout(async () => {
            try {
              await track.applyConstraints({
                advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
              } as MediaTrackConstraints);
            } catch {}
          }, 600);
        }
      } catch {
        // Ignore constraint application error
      }
    }

    focusTimeoutRef.current = setTimeout(() => {
      setFocusIndicator((prev) => (prev ? { ...prev, active: false } : null));
    }, 1200);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setStatus("starting");
    setErrorMsg("");

    if (!navigator?.mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorMsg("Tu navegador no soporta acceso a la cámara o requiere conexión segura (HTTPS). Usa el modo manual.");
      return;
    }

    try {
      // Configure camera with continuous autofocus, continuous exposure, and high resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          advanced: [
            {
              focusMode: "continuous",
              exposureMode: "continuous",
              whiteBalanceMode: "continuous",
            } as any,
          ],
        },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() || {}) as Record<string, unknown>;

      // Check and apply hardware continuous autofocus
      if (caps && "focusMode" in caps) {
        setHasAutofocus(true);
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          } as MediaTrackConstraints);
        } catch {
          // Ignore constraint error
        }
      }

      // Check torch capability
      if (caps && "torch" in caps) {
        setHasTorch(true);
      }

      setStatus("scanning");

      // In Barcode mode, initiate ZXing or native detector
      if (mode === "camera") {
        let nativeDetectorWorked = false;
        if (typeof window !== "undefined" && "BarcodeDetector" in window && window.BarcodeDetector) {
          try {
            const detector = new window.BarcodeDetector({
              formats: ["qr_code", "code_128", "ean_13", "code_39", "data_matrix", "ean_8", "upc_a"],
            });
            nativeDetectorWorked = true;

            intervalRef.current = setInterval(async () => {
              if (!videoRef.current || videoRef.current.readyState < 2) return;
              try {
                const results = await detector.detect(videoRef.current);
                if (results && results.length > 0) {
                  const first = results[0];
                  if (first?.rawValue) {
                    const code = first.rawValue.trim();
                    setLiveScannedQuery(code);
                    handleDetectedCode(code);
                  }
                }
              } catch {
                // Ignore detection errors in single frame
              }
            }, 250);
          } catch {
            nativeDetectorWorked = false;
          }
        }

        // Universal ZXing fallback
        if (!nativeDetectorWorked) {
          const hints = new Map<DecodeHintType, any>();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.QR_CODE,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.DATA_MATRIX,
            BarcodeFormat.ITF,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);

          const reader = new BrowserMultiFormatReader(hints, {
            delayBetweenScanAttempts: 250,
            delayBetweenScanSuccess: 1200,
          });

          const controls = await reader.decodeFromVideoElement(video, (result) => {
            if (result) {
              const text = result.getText();
              if (text) {
                setLiveScannedQuery(text.trim());
                handleDetectedCode(text);
              }
            }
          });
          zxingControlsRef.current = controls;
        }
      }
    } catch (e: unknown) {
      setStatus("error");
      const err = e as { name?: string; message?: string };
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setErrorMsg("Permiso de cámara denegado. Habilita el acceso en tu navegador o usa el modo manual.");
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        setErrorMsg("No se encontró ninguna cámara disponible en tu dispositivo. Usa el modo manual.");
      } else {
        setErrorMsg(err?.message || "No se pudo acceder a la cámara. Usa el modo manual.");
      }
    }
  }, [facingMode, handleDetectedCode, mode, stopCamera]);

  useEffect(() => {
    if (mode === "camera" || mode === "ocr") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [mode, startCamera, stopCamera]);

  // Execute Computer Vision & OCR pipeline on targeted camera frame
  const captureAndRecognizeOcr = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || ocrLoading) return;

    try {
      setOcrLoading(true);
      setOcrProgress(15);
      setOcrStatusText("Enfocando y capturando cuadro...");
      setAutoDeliveredWinner(null);

      // Trigger automatic lens refocus before capturing frame
      await triggerAutofocus();

      // Compute bounding box for reticle (middle 75% width, 38% height)
      const vWidth = video.videoWidth || 1280;
      const vHeight = video.videoHeight || 720;
      const cropWidth = Math.round(vWidth * 0.75);
      const cropHeight = Math.round(vHeight * 0.38);
      const cropX = Math.round((vWidth - cropWidth) / 2);
      const cropY = Math.round((vHeight - cropHeight) / 2);

      setOcrStatusText(
        `Aplicando filtros industriales (DPI 300+, Deskew, ${
          binarizationMethod === "adaptive"
            ? "Adaptativo Anti-sombras"
            : binarizationMethod === "otsu"
            ? "Otsu Uniforme"
            : "Auto-Filtro"
        })...`
      );
      setOcrProgress(30);

      // Preprocess frame via Computer Vision Canvas algorithms with image-ocr skill pipeline
      const processedCanvas = preprocessCanvasForOCR(
        video,
        { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
        {
          invert: invertContrast,
          contrast: 1.8,
          binarize: true,
          binarizationMethod,
          sharpen: true,
          deskew: true,
          morphClose: true,
        }
      );

      setOcrStatusText("Analizando patrones con motor OCR...");
      setOcrProgress(50);

      // Convert canvas to image base64 for API transmission
      const dataUrl = processedCanvas.toDataURL("image/jpeg", 0.88);

      let apiWinner: any = null;
      let apiCandidates: SkuCandidate[] = [];

      // 1. Check with backend OCR API Route (sending catalog + inventory)
      try {
        const apiResponse = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: dataUrl,
            catalog: activeCatalog,
            inventory: inventoryList,
          }),
        });

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          if (apiData.candidates && Array.isArray(apiData.candidates) && apiData.candidates.length > 0) {
            apiCandidates = apiData.candidates;
            apiWinner = apiData.winner || null;
            if (apiData.rawText) {
              setOcrRawText(apiData.rawText);
              setLiveScannedQuery(apiData.rawText);
            }
          }
        }
      } catch (apiErr) {
        console.warn("[BarcodeScanner] API OCR fallback to local worker:", apiErr);
      }

      // 2. If API didn't return high confidence, run client-side Tesseract.js with full fuzzy engine
      let finalCandidates = apiCandidates;
      let winner = apiWinner;

      if (!winner || winner.confidence < 90) {
        setOcrProgress(65);
        setOcrStatusText("Refinando reconocimiento neuronal en cliente...");

        const ocrResult = await recognizeTextFromCanvas(processedCanvas, (pct, msg) => {
          setOcrProgress(Math.round(65 + pct * 0.3));
          setOcrStatusText(msg);
        });

        if (ocrResult.words && ocrResult.words.length > 0) {
          setOcrWords(ocrResult.words);
        }

        const recognizedText = ocrResult.text;
        setOcrRawText(recognizedText);
        setLiveScannedQuery(recognizedText);

        // Extract SKU Candidates using regex, location validation, confusion correction & catalog
        const localCandidates = extractSkuCandidates(recognizedText, activeCatalog);
        const localWinner = getAutoDeliverWinner(localCandidates);

        // Filter inventory against extracted text
        const localFilteredInv = filterInventoryByScan(inventoryList, recognizedText, localCandidates);
        const localInvWinner = getAutoDeliverInventoryWinner(localFilteredInv);

        if (localInvWinner) {
          winner = {
            code: localInvWinner.sku,
            confidence: localInvWinner.matchScore || 92,
            productName: localInvWinner.name,
            locationCode: localInvWinner.locationCode,
            quantity: localInvWinner.quantity,
          };
        } else if (localWinner && (!winner || localWinner.confidence > winner.confidence)) {
          winner = localWinner;
        }

        // Merge candidates uniquely
        const mergedMap = new Map<string, SkuCandidate>();
        for (const c of [...localCandidates, ...apiCandidates]) {
          const ex = mergedMap.get(c.code);
          if (!ex || ex.confidence < c.confidence) {
            mergedMap.set(c.code, c);
          }
        }
        finalCandidates = Array.from(mergedMap.values()).sort((a, b) => b.confidence - a.confidence);
      }

      setOcrCandidates(finalCandidates);
      setOcrLoading(false);
      setOcrProgress(100);

      // 3. AUTO-ENTREGA AL SUPERAR EL 90% DE ACIERTO EN INVENTARIO O CATÁLOGO
      if (winner && winner.confidence >= 90) {
        setAutoDeliveredWinner(winner);
        setOcrStatusText(
          `✓ ${winner.confidence}% Precisión · Auto-entregado: ${winner.code}${winner.productName ? ` (${winner.productName})` : ""}`
        );
        handleDetectedCode(winner.code, true, {
          productName: winner.productName,
          locationCode: winner.locationCode,
          quantity: winner.quantity,
          score: winner.confidence,
        });
      } else if (finalCandidates.length > 0) {
        const topAcc = finalCandidates[0].confidence;
        setOcrStatusText(
          `Se detectaron ${finalCandidates.length} posibles códigos (${topAcc}% de acierto máx). Toca para seleccionar.`
        );
      } else {
        setOcrStatusText("No se detectó un SKU legible. Toca la pantalla para re-enfocar.");
      }
    } catch (err: unknown) {
      console.warn("OCR recognition error:", err);
      setOcrLoading(false);
      setOcrStatusText("Error al procesar OCR. Toca para enfocar o usa ingreso manual.");
    }
  }, [activeCatalog, handleDetectedCode, inventoryList, invertContrast, ocrLoading, triggerAutofocus]);

  // Continuous OCR interval listener
  useEffect(() => {
    if (mode === "ocr" && continuousOcr && !ocrLoading) {
      ocrContinuousIntervalRef.current = setInterval(() => {
        captureAndRecognizeOcr();
      }, 2500);
    } else {
      if (ocrContinuousIntervalRef.current) {
        clearInterval(ocrContinuousIntervalRef.current);
        ocrContinuousIntervalRef.current = null;
      }
    }
    return () => {
      if (ocrContinuousIntervalRef.current) {
        clearInterval(ocrContinuousIntervalRef.current);
        ocrContinuousIntervalRef.current = null;
      }
    };
  }, [captureAndRecognizeOcr, continuousOcr, mode, ocrLoading]);

  // Handle uploaded image file for high-res OCR
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setOcrLoading(true);
      setOcrStatusText("Cargando fotografía de alta resolución...");
      setOcrProgress(20);
      setAutoDeliveredWinner(null);

      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();

      setOcrStatusText("Preprocesando imagen con filtros industriales...");
      setOcrProgress(40);

      const processedCanvas = preprocessCanvasForOCR(
        img,
        { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight },
        {
          invert: invertContrast,
          contrast: 1.8,
          binarize: true,
          binarizationMethod,
          scaleFactor: 1,
          sharpen: true,
          deskew: true,
          morphClose: true,
        }
      );

      // Check API route first
      const dataUrl = processedCanvas.toDataURL("image/jpeg", 0.9);
      let candidates: SkuCandidate[] = [];
      let winner: any = null;

      try {
        const apiResponse = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: dataUrl,
            catalog: activeCatalog,
            inventory: inventoryList,
          }),
        });

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          if (apiData.candidates && Array.isArray(apiData.candidates) && apiData.candidates.length > 0) {
            candidates = apiData.candidates;
            winner = apiData.winner;
            if (apiData.rawText) {
              setLiveScannedQuery(apiData.rawText);
            }
          }
        }
      } catch {}

      if (!winner || winner.confidence < 90) {
        const ocrResult = await recognizeTextFromCanvas(processedCanvas, (pct, msg) => {
          setOcrProgress(pct);
          setOcrStatusText(msg);
        });

        if (ocrResult.words && ocrResult.words.length > 0) {
          setOcrWords(ocrResult.words);
        }

        const recognizedText = ocrResult.text;
        setOcrRawText(recognizedText);
        setLiveScannedQuery(recognizedText);

        const localCandidates = extractSkuCandidates(recognizedText, activeCatalog);
        candidates = localCandidates;
        winner = getAutoDeliverWinner(localCandidates);

        const localFilteredInv = filterInventoryByScan(inventoryList, recognizedText, localCandidates);
        const invWinner = getAutoDeliverInventoryWinner(localFilteredInv);
        if (invWinner) {
          winner = {
            code: invWinner.sku,
            confidence: invWinner.matchScore || 92,
            productName: invWinner.name,
            locationCode: invWinner.locationCode,
            quantity: invWinner.quantity,
          };
        }
      }

      setOcrCandidates(candidates);
      setOcrLoading(false);
      setOcrProgress(100);

      // AUTO-ENTREGA >= 90%
      if (winner && winner.confidence >= 90) {
        setAutoDeliveredWinner(winner);
        setOcrStatusText(`✓ ${winner.confidence}% Precisión · Auto-entregado: ${winner.code}`);
        handleDetectedCode(winner.code, true, {
          productName: winner.productName,
          locationCode: winner.locationCode,
          quantity: winner.quantity,
          score: winner.confidence,
        });
      }
    } catch {
      setOcrLoading(false);
      setOcrStatusText("No se pudo procesar la fotografía cargada.");
    }
  };

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const newVal = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: newVal } as MediaTrackConstraintSet],
      } as MediaTrackConstraints);
      setTorchOn(newVal);
    } catch {
      // Ignore torch error
    }
  }, [torchOn]);

  const toggleFacingMode = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualValue.trim()) {
      handleDetectedCode(manualValue.trim(), true);
      setManualValue("");
    }
  };

  // Viewfinder tap-to-focus handler
  const handleViewfinderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    void triggerAutofocus(x, y);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-fadeIn border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh]">
        {/* Mobile handle indicator */}
        <div className="pt-2 pb-1 flex justify-center sm:hidden bg-slate-900">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Auto-delivery banner when >= 90% match detected */}
        {autoDeliveredWinner && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 flex items-center justify-between text-xs animate-fadeIn border-b border-emerald-500 shadow-md shrink-0">
            <div className="flex items-center gap-2">
              <Icon name="check-circle" size={16} className="text-emerald-100" />
              <div>
                <span className="font-bold">{autoDeliveredWinner.confidence}% Coincidencia</span>
                <span className="mx-1.5 opacity-75">·</span>
                <span className="font-mono font-semibold">{autoDeliveredWinner.code}</span>
                {autoDeliveredWinner.productName && (
                  <span className="ml-1 opacity-90 truncate max-w-[160px] inline-block align-bottom font-sans">
                    ({autoDeliveredWinner.productName})
                  </span>
                )}
                {autoDeliveredWinner.locationCode && (
                  <span className="ml-1.5 bg-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                    📍 {autoDeliveredWinner.locationCode}
                  </span>
                )}
              </div>
            </div>
            <span className="bg-emerald-800/80 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
              Auto-entregado
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Icon name="scan-barcode" size={20} className="text-orange-500" />
            <div>
              <p className="font-semibold text-sm leading-tight">Escáner de Código & Inventario</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Autofocus manual trigger button */}
            {(mode === "camera" || mode === "ocr") && status !== "error" && (
              <button
                type="button"
                onClick={() => void triggerAutofocus()}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer"
                title="Autofoco continuo / Re-enfocar lente"
              >
                <Icon name="focus" size={16} className="text-amber-400" />
              </button>
            )}

            {(mode === "camera" || mode === "ocr") && status !== "error" && (
              <button
                type="button"
                onClick={toggleFacingMode}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer"
                title="Cambiar cámara"
              >
                <Icon name="refresh" size={16} />
              </button>
            )}
            {hasTorch && (mode === "camera" || mode === "ocr") && status !== "error" && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-lg transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer ${
                  torchOn ? "bg-amber-500 text-slate-950 font-bold" : "bg-slate-800 text-slate-200 hover:text-white"
                }`}
                title="Linterna"
              >
                <Icon name="sliders" size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200 hover:text-white min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer"
              title="Cerrar escáner"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Mode Toggle (Tabs Swiss Enterprise) */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setMode("camera")}
            className={`flex-1 py-2 px-1.5 rounded-md text-xs font-semibold transition-colors min-h-[38px] flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === "camera"
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Icon name="scan-barcode" size={15} />
            <span>Cámara</span>
          </button>

          <button
            type="button"
            onClick={() => setMode("ocr")}
            className={`flex-1 py-2 px-1.5 rounded-md text-xs font-semibold transition-colors min-h-[38px] flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === "ocr"
                ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-xs font-bold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Icon name="ocr" size={15} />
            <span>Visión OCR API</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              setMode("manual");
            }}
            className={`flex-1 py-2 px-1.5 rounded-md text-xs font-semibold transition-colors min-h-[38px] flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === "manual"
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Icon name="keyboard" size={15} />
            <span>Manual</span>
          </button>
        </div>

        {/* Scrollable Scanner Body */}
        <div className="overflow-y-auto flex-1">
          {/* 1. Barcode 2D Imager Camera Mode */}
          {mode === "camera" && (
            <div className="relative bg-black" onClick={handleViewfinderClick}>
              {status === "error" ? (
                <div className="p-6 text-center space-y-4 bg-slate-900 text-white min-h-[220px] flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                    <Icon name="warning" size={22} />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-red-300">Cámara no disponible</p>
                    <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{errorMsg}</p>
                  </div>
                  <div className="flex gap-2 w-full pt-2">
                    <button
                      type="button"
                      onClick={() => void startCamera()}
                      className="flex-1 py-2 px-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium text-white transition-colors min-h-[40px] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="refresh" size={14} /> Reintentar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setMode("manual");
                      }}
                      className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium text-white transition-colors min-h-[40px] flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="keyboard" size={14} /> Digitar código
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <video ref={videoRef} className="w-full h-48 sm:h-52 object-cover cursor-crosshair" playsInline muted />

                  {/* Tap-to-Focus Indicator Ring */}
                  {focusIndicator && focusIndicator.active && (
                    <div
                      className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 border-2 border-emerald-400 rounded-lg w-14 h-14 flex items-center justify-center animate-ping"
                      style={{ left: focusIndicator.x, top: focusIndicator.y }}
                    >
                      <span className="text-[10px] text-emerald-300 font-mono font-bold bg-black/60 px-1 rounded">
                        AF
                      </span>
                    </div>
                  )}

                  {/* Aiming Reticle for Barcode / QR */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className={`w-56 h-32 border-2 rounded-xl relative shadow-2xl transition-colors duration-200 ${
                        status === "detected" ? "border-emerald-400 bg-emerald-500/10" : "border-white/80"
                      }`}
                    >
                      <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 rounded-tl-lg border-blue-500" />
                      <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 rounded-tr-lg border-blue-500" />
                      <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 rounded-bl-lg border-blue-500" />
                      <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 rounded-br-lg border-blue-500" />

                      {status === "scanning" && (
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400 shadow-[0_0_8px_#60a5fa] animate-[scan-line_2s_linear_infinite]" />
                      )}
                    </div>
                  </div>

                  <div className="absolute bottom-2 inset-x-0 text-center px-4 pointer-events-none">
                    {status === "starting" && (
                      <span className="text-white text-xs bg-black/75 px-3 py-1 rounded-full font-medium inline-block">
                        Iniciando 2D Imager & Autofoco...
                      </span>
                    )}
                    {status === "scanning" && (
                      <span className="text-white text-xs bg-black/75 px-3 py-1 rounded-full font-medium inline-block">
                        Apunta al código · Filtra inventario en tiempo real
                      </span>
                    )}
                    {status === "detected" && (
                      <span className="text-emerald-300 text-xs bg-emerald-950/90 border border-emerald-500/50 px-3 py-1 rounded-full font-semibold inline-block">
                        ¡Código detectado!
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 2. Computer Vision & OCR Mode (Printed Numbers / Non-barcoded SKUs) */}
          {mode === "ocr" && (
            <div className="relative bg-black flex flex-col">
              <div className="relative overflow-hidden cursor-crosshair" onClick={handleViewfinderClick}>
                <video ref={videoRef} className="w-full h-44 sm:h-48 object-cover" playsInline muted />

                {/* Tap-to-Focus Indicator Ring */}
                {focusIndicator && focusIndicator.active && (
                  <div
                    className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 border-2 border-amber-400 rounded-lg w-14 h-14 flex items-center justify-center animate-ping"
                    style={{ left: focusIndicator.x, top: focusIndicator.y }}
                  >
                    <span className="text-[10px] text-amber-300 font-mono font-bold bg-black/60 px-1 rounded">
                      AF
                    </span>
                  </div>
                )}

                {/* OCR Targeted Text Reticle */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className={`w-64 h-20 border-2 rounded-lg relative shadow-2xl transition-colors duration-200 ${
                      ocrLoading ? "border-orange-400 bg-orange-500/10" : "border-amber-400/90"
                    }`}
                  >
                    {/* Precise Crosshair Corners */}
                    <div className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-orange-500" />
                    <div className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-orange-500" />
                    <div className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-orange-500" />
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-orange-500" />

                    {/* Horizontal Alignment Laser Line */}
                    <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 border-t border-dashed border-orange-400/60" />

                    {ocrLoading && (
                      <div className="absolute inset-x-0 top-0 h-0.5 bg-orange-500 shadow-[0_0_8px_#ea580c] animate-[scan-line-ocr_1.5s_linear_infinite]" />
                    )}
                  </div>
                </div>

                {/* Overlay Guidance */}
                <div className="absolute top-2 inset-x-0 text-center px-4 pointer-events-none">
                  <span className="text-white text-[11px] bg-slate-900/85 px-2.5 py-1 rounded-md font-medium inline-block border border-slate-700">
                    Enfoque continuo activo · Toca para re-enfocar
                  </span>
                </div>
              </div>

              {/* OCR Controls & Action Panel */}
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                {/* Secondary Options Bar */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setInvertContrast((prev) => !prev)}
                      className={`px-2 py-1 rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer text-xs ${
                        invertContrast
                          ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      }`}
                      title="Activa si el texto es blanco sobre fondo oscuro"
                    >
                      <Icon name="sliders" size={12} />
                      <span>{invertContrast ? "Fondo Oscuro" : "Invertir"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setBinarizationMethod((prev) =>
                          prev === "auto" ? "adaptive" : prev === "adaptive" ? "otsu" : "auto"
                        )
                      }
                      className="px-2 py-1 rounded-lg border transition-colors flex items-center gap-1 cursor-pointer text-xs bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      title="Método de umbralización: Auto, Adaptativo (Anti-sombras) u Otsu (Uniforme)"
                    >
                      <Icon name="sliders" size={12} />
                      <span>
                        {binarizationMethod === "auto"
                          ? "Auto-Filtro"
                          : binarizationMethod === "adaptive"
                          ? "Adaptativo"
                          : "Otsu"}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void triggerAutofocus()}
                      className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700/50 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors text-xs"
                      title="Forzar re-enfoque de cámara"
                    >
                      <Icon name="focus" size={12} />
                      <span>Autofoco</span>
                    </button>

                    <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={continuousOcr}
                        onChange={(e) => setContinuousOcr(e.target.checked)}
                        className="rounded text-orange-600 focus:ring-orange-500"
                      />
                      <span>Continuo</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                      title="Cargar foto desde galería o cámara nativa"
                    >
                      <Icon name="upload" size={13} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                </div>

                {/* Primary OCR Capture Trigger Button (Industrial CTA Orange) */}
                <button
                  type="button"
                  onClick={() => void captureAndRecognizeOcr()}
                  disabled={ocrLoading}
                  className="w-full bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-semibold py-2 px-3 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[40px] disabled:opacity-50 text-xs"
                >
                  {ocrLoading ? (
                    <>
                      <Icon name="refresh" size={15} className="animate-spin" />
                      <span>{ocrStatusText || "Procesando con Visión Artificial..."}</span>
                    </>
                  ) : (
                    <>
                      <Icon name="camera" size={15} />
                      <span>Capturar y Auto-Entregar (&ge; 90%)</span>
                    </>
                  )}
                </button>

                {/* Progress Bar during OCR calculation */}
                {ocrLoading && (
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-orange-600 h-full transition-all duration-300"
                      style={{ width: `${ocrProgress}%` }}
                    />
                  </div>
                )}

                {/* Detected High-Confidence Words (>70%) from Skill */}
                {ocrWords.length > 0 && (
                  <div className="p-2 bg-amber-50/80 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-900/60 space-y-1.5 animate-fadeIn">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                      <span className="flex items-center gap-1">
                        <Icon name="sparkles" size={12} className="text-amber-600 dark:text-amber-400" />
                        Tokens Extraídos (&gt;70% Precisión):
                      </span>
                      <span className="text-[10px] bg-amber-200/80 dark:bg-amber-900/80 px-1.5 py-0.5 rounded font-mono font-bold">
                        {ocrWords.length} tokens
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {ocrWords.slice(0, 10).map((word, wIdx) => (
                        <button
                          key={`${word.text}-${wIdx}`}
                          type="button"
                          onClick={() => handleDetectedCode(word.text, true)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-900/70 border border-amber-300 dark:border-amber-700 text-xs font-mono font-medium text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                          title={`Confianza: ${word.confidence}% - Toca para entregar`}
                        >
                          <span>{word.text}</span>
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-sans font-bold">
                            {word.confidence}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Candidate list if detected without >= 90% single winner */}
                {ocrCandidates.length > 0 && !autoDeliveredWinner && (
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1 animate-fadeIn">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      <span>Candidatos SKU evaluados:</span>
                      <span className="text-[10px] font-mono text-orange-600 dark:text-orange-400 font-bold">
                        {ocrCandidates.length} sugerencias
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {ocrCandidates.slice(0, 8).map((cand) => (
                        <button
                          key={cand.code}
                          type="button"
                          onClick={() =>
                            handleDetectedCode(cand.code, true, {
                              productName: cand.productName,
                              score: cand.confidence,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono border bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-blue-500 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                        >
                          <span>{cand.code}</span>
                          <span className="text-[10px] text-slate-400 font-sans font-bold">
                            {cand.confidence}%
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Manual Input */}
          {mode === "manual" && (
            <form onSubmit={handleManualSubmit} className="p-3.5 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {label}
                </label>
                <input
                  autoFocus
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder="Escribe o pega el código..."
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 min-h-[40px] text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[38px] py-2 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                Confirmar código
              </button>
            </form>
          )}
        </div>

        {/* Last scanned feedback bar */}
        {lastScanned && (
          <div className="px-4 py-2 bg-blue-50 dark:bg-slate-800/80 border-t border-blue-100 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Último código escaneado:</span>
            <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{lastScanned}</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(0); }
          100% { transform: translateY(calc(8rem - 2px)); }
        }
        @keyframes scan-line-ocr {
          0% { transform: translateY(0); }
          100% { transform: translateY(calc(5rem - 2px)); }
        }
      `}</style>
    </div>
  );
}

export { BarcodeScanner };
