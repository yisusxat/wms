"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { BrowserMultiFormatReader, BarcodeFormat } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";

interface Props {
  onScan: (value: string) => void;
  onClose: () => void;
  label?: string;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect(imageSource: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
    };
  }
}

export default function BarcodeScanner({ onScan, onClose, label = "SKU / Código de barras" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScanTimeRef = useRef<number>(0);

  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualValue, setManualValue] = useState("");
  const [status, setStatus] = useState<"starting" | "scanning" | "detected" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Haptic feedback
  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100]);
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
      // Audio might be blocked before explicit user interaction
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
      setErrorMsg("Tu navegador no soporta acceso a la cámara o requiere una conexión segura (HTTPS). Usa el modo manual.");
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

      // 1. Try native BarcodeDetector if available and functional
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
              // Ignore single frame detection errors
            }
          }, 250);
        } catch {
          nativeDetectorWorked = false;
        }
      }

      // 2. Fallback to universal ZXing decoder (works in iOS Safari, desktop Chrome, Firefox, etc.)
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
    } catch (e: unknown) {
      setStatus("error");
      const err = e as { name?: string; message?: string };
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setErrorMsg("Permiso de cámara denegado. Permite el acceso a la cámara en los ajustes de tu navegador o usa el modo manual.");
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        setErrorMsg("No se encontró ninguna cámara disponible en tu dispositivo. Usa el modo manual.");
      } else {
        setErrorMsg(err?.message || "No se pudo acceder a la cámara. Usa el modo manual.");
      }
    }
  }, [facingMode, handleDetectedCode, stopCamera]);

  useEffect(() => {
    if (mode === "camera") {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [mode, startCamera, stopCamera]);

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
      onScan(manualValue.trim());
      setManualValue("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn">
        {/* Mobile handle indicator */}
        <div className="pt-2 pb-1 flex justify-center sm:hidden bg-slate-900">
          <div className="w-10 h-1 rounded-full bg-slate-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <span className="text-xl">📷</span>
            <div>
              <p className="font-semibold text-sm">Escáner de Código</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === "camera" && status !== "error" && (
              <button
                type="button"
                onClick={toggleFacingMode}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center text-sm"
                title="Cambiar cámara"
              >
                🔄
              </button>
            )}
            {hasTorch && mode === "camera" && status !== "error" && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center ${
                  torchOn ? "bg-yellow-400 text-slate-900" : "bg-slate-700 text-white"
                }`}
                title="Linterna"
              >
                🔦
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-white min-h-[40px] min-w-[40px] flex items-center justify-center text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-slate-100 p-1 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setMode("camera")}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors min-h-[44px] flex items-center justify-center gap-1.5 ${
              mode === "camera" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📷 Cámara
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setMode("manual");
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors min-h-[44px] flex items-center justify-center gap-1.5 ${
              mode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⌨️ Manual
          </button>
        </div>

        {/* Camera view */}
        {mode === "camera" && (
          <div className="relative bg-black">
            {status === "error" ? (
              <div className="p-6 text-center space-y-4 bg-slate-900 text-white min-h-[240px] flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-2xl">
                  ⚠️
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-sm text-red-300">Cámara no disponible</p>
                  <p className="text-xs text-slate-300 max-w-xs leading-relaxed">{errorMsg}</p>
                </div>
                <div className="flex gap-2 w-full pt-2">
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="flex-1 py-2.5 px-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-semibold text-white transition-colors min-h-[44px]"
                  >
                    🔄 Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setMode("manual");
                    }}
                    className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-semibold text-white transition-colors min-h-[44px]"
                  >
                    ⌨️ Modo manual
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video ref={videoRef} className="w-full h-64 sm:h-56 object-cover" playsInline muted />
                {/* Scan overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className={`w-60 h-40 border-2 rounded-xl relative shadow-2xl transition-colors duration-200 ${
                      status === "detected" ? "border-green-400 bg-green-500/10" : "border-white/80"
                    }`}
                  >
                    <div
                      className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 rounded-tl-lg ${
                        status === "detected" ? "border-green-400" : "border-blue-400"
                      }`}
                    />
                    <div
                      className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 rounded-tr-lg ${
                        status === "detected" ? "border-green-400" : "border-blue-400"
                      }`}
                    />
                    <div
                      className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 rounded-bl-lg ${
                        status === "detected" ? "border-green-400" : "border-blue-400"
                      }`}
                    />
                    <div
                      className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 rounded-br-lg ${
                        status === "detected" ? "border-green-400" : "border-blue-400"
                      }`}
                    />
                    {status === "scanning" && (
                      <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400 shadow-[0_0_8px_#60a5fa] animate-[scan-line_2s_linear_infinite]" />
                    )}
                  </div>
                </div>

                <div className="absolute bottom-3 inset-x-0 text-center px-4 pointer-events-none">
                  {status === "starting" && (
                    <span className="text-white text-xs bg-black/70 backdrop-blur-xs px-3.5 py-1.5 rounded-full font-medium inline-block">
                      Iniciando cámara...
                    </span>
                  )}
                  {status === "scanning" && (
                    <span className="text-white text-xs bg-black/70 backdrop-blur-xs px-3.5 py-1.5 rounded-full font-medium inline-block">
                      Apunta al código de barras o QR
                    </span>
                  )}
                  {status === "detected" && (
                    <span className="text-green-300 text-xs bg-green-950/80 border border-green-500/50 backdrop-blur-xs px-3.5 py-1.5 rounded-full font-semibold inline-block animate-pulse">
                      ¡Código detectado!
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Manual input */}
        {mode === "manual" && (
          <form onSubmit={handleManualSubmit} className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                {label}
              </label>
              <input
                autoFocus
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Escribe o pega el código..."
                className="w-full border border-slate-300 rounded-xl px-4 py-3 min-h-[48px] text-base focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[48px] py-3 rounded-xl text-base font-bold shadow-md transition-all active:scale-98"
            >
              Confirmar código
            </button>
          </form>
        )}

        {/* Last scanned */}
        {lastScanned && (
          <div className="px-4 py-3 bg-blue-50/70 border-t border-blue-100 text-center">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Último escaneado:</p>
            <p className="font-mono font-bold text-blue-800 text-base mt-0.5">{lastScanned}</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(0); }
          100% { transform: translateY(calc(10rem - 2px)); }
        }
      `}</style>
    </div>
  );
}
