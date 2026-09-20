"use client";
import { useRef, useState, useEffect, useCallback } from "react";

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
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualValue, setManualValue] = useState("");
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setStatus("starting");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as Record<string, unknown> | undefined;
      if (caps && "torch" in caps) setHasTorch(true);

      if (typeof window.BarcodeDetector === "undefined") {
        setMode("manual");
        setStatus("error");
        setErrorMsg("Tu navegador no soporta detección de códigos de barras nativa. Usa el modo manual.");
        stopCamera();
        return;
      }

      const detector = new window.BarcodeDetector({
        formats: ["qr_code", "code_128", "ean_13", "code_39", "data_matrix", "ean_8", "upc_a"],
      });

      setStatus("scanning");

      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0) {
            const code = results[0].rawValue;
            setLastScanned(code);
            // Haptic + beep feedback
            if (navigator.vibrate) navigator.vibrate([100]);
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            osc.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.start();
            setTimeout(() => { osc.stop(); ctx.close(); }, 120);
            onScan(code);
          }
        } catch {/* detection frame error, skip */}
      }, 300);
    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "No se pudo acceder a la cámara");
    }
  }, [onScan, stopCamera]);

  useEffect(() => {
    if (mode === "camera") startCamera();
    return stopCamera;
  }, [mode, startCamera, stopCamera]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const newVal = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: newVal } as MediaTrackConstraintSet] } as MediaTrackConstraints);
    setTorchOn(newVal);
  }, [torchOn]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualValue.trim()) {
      onScan(manualValue.trim());
      setManualValue("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
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
            {hasTorch && mode === "camera" && (
              <button onClick={toggleTorch} className={`p-1.5 rounded-lg transition-colors ${torchOn ? "bg-yellow-400 text-slate-900" : "bg-slate-700 text-white"}`} title="Linterna">
                🔦
              </button>
            )}
            <button onClick={onClose} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-white">✕</button>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-slate-100">
          <button
            onClick={() => setMode("camera")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "camera" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
          >
            📷 Cámara
          </button>
          <button
            onClick={() => { stopCamera(); setMode("manual"); }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "manual" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
          >
            ⌨️ Manual
          </button>
        </div>

        {/* Camera view */}
        {mode === "camera" && (
          <div className="relative bg-black">
            <video ref={videoRef} className="w-full h-56 object-cover" playsInline muted />
            {/* Scan overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-32 border-2 border-white/80 rounded-lg relative">
                <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-blue-400 rounded-tl" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-blue-400 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-blue-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-blue-400 rounded-br" />
                {status === "scanning" && (
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400 animate-[scan-line_2s_linear_infinite]" />
                )}
              </div>
            </div>
            <div className="absolute bottom-2 inset-x-0 text-center">
              {status === "starting" && <span className="text-white text-xs bg-black/50 px-3 py-1 rounded-full">Iniciando cámara...</span>}
              {status === "scanning" && <span className="text-white text-xs bg-black/50 px-3 py-1 rounded-full">Apunta al código de barras o QR</span>}
              {status === "error" && <span className="text-red-300 text-xs bg-black/50 px-3 py-1 rounded-full">{errorMsg}</span>}
            </div>
          </div>
        )}

        {/* Manual input */}
        {mode === "manual" && (
          <form onSubmit={handleManualSubmit} className="p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input
                autoFocus
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="Escribe o pega el código..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              Confirmar código
            </button>
          </form>
        )}

        {/* Last scanned */}
        {lastScanned && (
          <div className="px-4 pb-3 text-center">
            <p className="text-xs text-slate-500">Último escaneado:</p>
            <p className="font-mono font-semibold text-blue-700 text-sm">{lastScanned}</p>
          </div>
        )}
      </div>
      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(0); }
          100% { transform: translateY(calc(8rem - 2px)); }
        }
      `}</style>
    </div>
  );
}
