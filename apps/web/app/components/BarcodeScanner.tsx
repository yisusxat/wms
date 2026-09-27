"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import Icon from "./Icon";
import {
  preprocessCanvasForOCR,
  extractSkuCandidates,
  recognizeTextFromCanvas,
  SkuCandidate,
} from "../../lib/ocrService";

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
  label?: string;
  catalogProducts?: Array<{ sku: string; name: string; barcode?: string }>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect(imageSource: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
    };
  }
}

export default function BarcodeScanner({
  onScan,
  onClose,
  label = "SKU / Código de barras",
  catalogProducts = [],
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

  // Computer Vision & OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState("");
  const [ocrCandidates, setOcrCandidates] = useState<SkuCandidate[]>([]);
  const [invertContrast, setInvertContrast] = useState(false);
  const [continuousOcr, setContinuousOcr] = useState(false);
  const [ocrRawText, setOcrRawText] = useState("");

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

  // Handle scanned code with debouncing
  const handleDetectedCode = useCallback(
    (code: string) => {
      const clean = code.trim();
      if (!clean) return;

      const now = Date.now();
      if (now - lastScanTimeRef.current < 1500) {
        return; // Prevent duplicate reads in under 1.5s
      }
      lastScanTimeRef.current = now;

      setLastScanned(clean);
      setStatus("detected");
      triggerHaptic();
      triggerAudioBeep();

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      await video.play();

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as Record<string, unknown> | undefined;
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
                    handleDetectedCode(first.rawValue);
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
      setOcrStatusText("Capturando cuadro de cámara...");

      // Compute bounding box for reticle (middle 70% width, 35% height)
      const vWidth = video.videoWidth || 1280;
      const vHeight = video.videoHeight || 720;
      const cropWidth = Math.round(vWidth * 0.75);
      const cropHeight = Math.round(vHeight * 0.38);
      const cropX = Math.round((vWidth - cropWidth) / 2);
      const cropY = Math.round((vHeight - cropHeight) / 2);

      setOcrStatusText("Aplicando visión artificial (Otsu & contraste)...");
      setOcrProgress(30);

      // Preprocess frame via Computer Vision Canvas algorithms
      const processedCanvas = preprocessCanvasForOCR(
        video,
        { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
        {
          invert: invertContrast,
          contrast: 1.6,
          binarize: true,
          scaleFactor: 2.2,
        }
      );

      setOcrStatusText("Reconociendo formas de dígitos y texto...");
      setOcrProgress(50);

      // Execute AI OCR Character Recognition
      const ocrResult = await recognizeTextFromCanvas(processedCanvas, (pct, msg) => {
        setOcrProgress(pct);
        setOcrStatusText(msg);
      });

      setOcrRawText(ocrResult.text);

      // Extract SKU Candidates using regex & database cross-referencing
      const candidates = extractSkuCandidates(ocrResult.text, catalogProducts);
      setOcrCandidates(candidates);

      setOcrLoading(false);
      setOcrProgress(100);

      if (candidates.length === 1 && candidates[0].confidence >= 90) {
        // High confidence single match: auto-confirm
        handleDetectedCode(candidates[0].code);
      } else if (candidates.length > 0) {
        setOcrStatusText(`Se detectaron ${candidates.length} posibles códigos de SKU.`);
      } else {
        setOcrStatusText("No se detectó un SKU legible. Ajusta la distancia o iluminación.");
      }
    } catch (err: unknown) {
      console.warn("OCR recognition error:", err);
      setOcrLoading(false);
      setOcrStatusText("Error al procesar OCR. Verifica la conexión o usa ingreso manual.");
    }
  }, [catalogProducts, handleDetectedCode, invertContrast, ocrLoading]);

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

      const img = new Image();
      img.src = URL.createObjectURL(file);
      await img.decode();

      setOcrStatusText("Preprocesando imagen con filtros industriales...");
      setOcrProgress(40);

      const processedCanvas = preprocessCanvasForOCR(
        img,
        { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight },
        { invert: invertContrast, contrast: 1.5, binarize: true, scaleFactor: 1 }
      );

      const ocrResult = await recognizeTextFromCanvas(processedCanvas, (pct, msg) => {
        setOcrProgress(pct);
        setOcrStatusText(msg);
      });

      setOcrRawText(ocrResult.text);
      const candidates = extractSkuCandidates(ocrResult.text, catalogProducts);
      setOcrCandidates(candidates);

      setOcrLoading(false);
      setOcrProgress(100);

      if (candidates.length === 1 && candidates[0].confidence >= 90) {
        handleDetectedCode(candidates[0].code);
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
      handleDetectedCode(manualValue.trim());
      setManualValue("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn border border-slate-200 dark:border-slate-800">
        {/* Mobile handle indicator */}
        <div className="pt-2 pb-1 flex justify-center sm:hidden bg-slate-900">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <Icon name="scan-barcode" size={20} className="text-orange-500" />
            <div>
              <p className="font-semibold text-sm leading-tight">Escáner de Código</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
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
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 border-b border-slate-200 dark:border-slate-800">
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
            <span>Visión OCR</span>
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

        {/* 1. Barcode 2D Imager Camera Mode */}
        {mode === "camera" && (
          <div className="relative bg-black">
            {status === "error" ? (
              <div className="p-6 text-center space-y-4 bg-slate-900 text-white min-h-[240px] flex flex-col items-center justify-center">
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
                    onClick={() => startCamera()}
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
                <video ref={videoRef} className="w-full h-64 sm:h-56 object-cover" playsInline muted />
                
                {/* Aiming Reticle for Barcode / QR */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className={`w-60 h-40 border-2 rounded-xl relative shadow-2xl transition-colors duration-200 ${
                      status === "detected" ? "border-emerald-400 bg-emerald-500/10" : "border-white/80"
                    }`}
                  >
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg border-blue-500" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg border-blue-500" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg border-blue-500" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 rounded-br-lg border-blue-500" />
                    
                    {status === "scanning" && (
                      <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400 shadow-[0_0_8px_#60a5fa] animate-[scan-line_2s_linear_infinite]" />
                    )}
                  </div>
                </div>

                <div className="absolute bottom-3 inset-x-0 text-center px-4 pointer-events-none">
                  {status === "starting" && (
                    <span className="text-white text-xs bg-black/75 px-3 py-1 rounded-full font-medium inline-block">
                      Iniciando 2D Imager...
                    </span>
                  )}
                  {status === "scanning" && (
                    <span className="text-white text-xs bg-black/75 px-3 py-1 rounded-full font-medium inline-block">
                      Apunta al código de barras o QR
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
            <div className="relative overflow-hidden">
              <video ref={videoRef} className="w-full h-56 sm:h-52 object-cover" playsInline muted />

              {/* OCR Targeted Text Reticle */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-72 h-24 border-2 rounded-lg relative shadow-2xl transition-colors duration-200 ${
                    ocrLoading ? "border-orange-400 bg-orange-500/10" : "border-amber-400/90"
                  }`}
                >
                  {/* Precise Crosshair Corners */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-orange-500" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-orange-500" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-orange-500" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-orange-500" />

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
                  Enfoca el número o SKU impreso en la caja
                </span>
              </div>
            </div>

            {/* OCR Controls & Action Panel */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3">
              {/* Secondary Options Bar */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setInvertContrast((prev) => !prev)}
                  className={`px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                    invertContrast
                      ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900"
                      : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                  title="Activa si el texto es blanco sobre fondo oscuro"
                >
                  <Icon name="sliders" size={13} />
                  <span>{invertContrast ? "Fondo Oscuro (Activo)" : "Invertir Contraste"}</span>
                </button>

                <div className="flex items-center gap-2">
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
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                    title="Cargar foto desde galería o cámara nativa"
                  >
                    <Icon name="upload" size={14} />
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
                onClick={() => captureAndRecognizeOcr()}
                disabled={ocrLoading}
                className="w-full bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px] disabled:opacity-50"
              >
                {ocrLoading ? (
                  <>
                    <Icon name="refresh" size={16} className="animate-spin" />
                    <span>{ocrStatusText || "Procesando con Visión Artificial..."}</span>
                  </>
                ) : (
                  <>
                    <Icon name="camera" size={16} />
                    <span>Capturar y Reconocer SKU</span>
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

              {/* Detected Candidate Badges */}
              {ocrCandidates.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Códigos SKU detectados (Toca para seleccionar):
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {ocrCandidates.map((candidate) => (
                      <button
                        key={candidate.code}
                        type="button"
                        onClick={() => handleDetectedCode(candidate.code)}
                        className={`text-left px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
                          candidate.isKnownProduct
                            ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-300 font-bold"
                            : "bg-blue-50 dark:bg-blue-950/40 border-blue-300 text-blue-800 dark:text-blue-300"
                        }`}
                      >
                        <span className="font-bold">{candidate.code}</span>
                        {candidate.productName && (
                          <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                            ({candidate.productName})
                          </span>
                        )}
                        <span className="text-[10px] opacity-75 font-sans">
                          {candidate.confidence}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Message */}
              {ocrStatusText && !ocrLoading && ocrCandidates.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-tight">
                  {ocrStatusText}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 3. Manual Input */}
        {mode === "manual" && (
          <form onSubmit={handleManualSubmit} className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {label}
              </label>
              <input
                autoFocus
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Escribe o pega el código..."
                className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3.5 py-2.5 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all cursor-pointer"
            >
              Confirmar código
            </button>
          </form>
        )}

        {/* Last scanned feedback bar */}
        {lastScanned && (
          <div className="px-4 py-2.5 bg-blue-50 dark:bg-slate-800/80 border-t border-blue-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Último código:</span>
            <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{lastScanned}</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(0); }
          100% { transform: translateY(calc(10rem - 2px)); }
        }
        @keyframes scan-line-ocr {
          0% { transform: translateY(0); }
          100% { transform: translateY(calc(6rem - 2px)); }
        }
      `}</style>
    </div>
  );
}
