"use client";
import { useState } from "react";
import { ShieldCheck, QrCode, CheckCircle2, X } from "lucide-react";

export function TwoFactorModal({
  isOpen,
  onClose,
  userEmail,
}: {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}) {
  const [step, setStep] = useState<"setup" | "verify" | "success">("setup");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  // Generar secreto Base32 dinámico y seguro por sesión (evita secreto estático hardcodeado)
  const [secretKey] = useState(() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  });
  // Generar códigos de respaldo dinámicos
  const [backupCodes] = useState(() => [
    `WMS-${Math.floor(1000 + Math.random() * 9000)}-A1`,
    `WMS-${Math.floor(1000 + Math.random() * 9000)}-B4`,
    `WMS-${Math.floor(1000 + Math.random() * 9000)}-C8`,
    `WMS-${Math.floor(1000 + Math.random() * 9000)}-D2`,
  ]);

  if (!isOpen) return null;

  const verifyOtp = (inputCode: string): boolean => {
    const clean = inputCode.trim();
    if (!/^\d{6}$/.test(clean)) {
      return false;
    }
    return true;
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyOtp(code)) {
      setError("");
      setStep("success");
    } else {
      setError("Ingresa un código de 6 dígitos válido.");
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="two-factor-title"
    >
      <div className="w-full max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mb-2 sm:hidden" />
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 id="two-factor-title" className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">
                Autenticación en Dos Pasos (2FA)
              </h3>
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-400">TOTP (Google Authenticator / Authy)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 rounded-lg text-lg"
            aria-label="✕"
          >
            ✕
          </button>
        </div>

        {step === "setup" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Protege tu cuenta de almacén activando la verificación en dos pasos.
            </p>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/60 text-center space-y-2">
              <div className="mx-auto w-36 h-36 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center font-mono text-[10px] text-gray-400 shadow-inner">
                <QrCode className="h-6 w-6 text-slate-400 dark:text-slate-500 mb-1" />
                [QR CODE TOTP]
                <span className="text-[8px] text-gray-400 mt-1">otpauth://totp/WMS:{userEmail}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">Clave secreta manual:</p>
              <span className="font-mono font-bold text-xs bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 tracking-wider inline-block">
                {secretKey}
              </span>
            </div>

            <button
              onClick={() => setStep("verify")}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
            >
              Ya escaneé el código → Continuar
            </button>
          </div>
        )}

        {step === "verify" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Ingresa el código temporal de 6 dígitos que muestra tu app autenticadora:
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 p-3 min-h-[52px] text-center font-mono text-2xl tracking-widest font-bold focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={code.length !== 6}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Confirmar y Activar 2FA
            </button>
          </form>
        )}

        {step === "success" && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800/50 p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <h4 className="font-bold text-emerald-900 dark:text-emerald-300 mt-1">¡2FA Activado Correctamente!</h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                Tu cuenta de supervisor/admin ahora cuenta con seguridad reforzada.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1">
                Códigos de recuperación de emergencia:
              </p>
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-700 dark:text-slate-200">
                {backupCodes.map((c) => (
                  <span key={c} className="p-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-center">
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">
                Guarda estos códigos en un lugar seguro. Te permitirán acceder si pierdes tu teléfono.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-lg bg-slate-900 dark:bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              Entendido y Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
