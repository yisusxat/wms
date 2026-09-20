"use client";
import { useState } from "react";

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
  const [secretKey] = useState("JBSWY3DPEHPK3PXP");
  const [backupCodes] = useState([
    "WMS-9402-A1",
    "WMS-7821-B4",
    "WMS-3319-C8",
    "WMS-5520-D2",
  ]);

  if (!isOpen) return null;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6) {
      setStep("success");
    } else {
      alert("Ingresa un código de 6 dígitos válido.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔐</span>
            <div>
              <h3 className="font-bold text-gray-900">Autenticación en Dos Pasos (2FA)</h3>
              <p className="text-xs text-gray-500">TOTP (Google Authenticator / Authy)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg">
            ✕
          </button>
        </div>

        {step === "setup" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Protege tu cuenta de almacén activando la verificación en dos pasos.
            </p>

            <div className="rounded-xl border p-4 bg-slate-50 text-center space-y-2">
              <div className="mx-auto w-36 h-36 bg-white p-2 rounded-lg border flex flex-col items-center justify-center font-mono text-[10px] text-gray-400 shadow-inner">
                <span className="text-3xl mb-1">📱</span>
                [QR CODE TOTP]
                <span className="text-[8px] text-gray-400 mt-1">otpauth://totp/WMS:{userEmail}</span>
              </div>
              <p className="text-xs text-gray-500">Clave secreta manual:</p>
              <span className="font-mono font-bold text-xs bg-white px-2 py-1 rounded border text-slate-800 tracking-wider">
                {secretKey}
              </span>
            </div>

            <button
              onClick={() => setStep("verify")}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700"
            >
              Ya escaneé el código → Continuar
            </button>
          </div>
        )}

        {step === "verify" && (
          <form onSubmit={handleVerify} className="space-y-4">
            <p className="text-sm text-gray-600">
              Ingresa el código temporal de 6 dígitos que muestra tu app autenticadora:
            </p>
            <input
              type="text"
              maxLength={6}
              autoFocus
              className="w-full rounded-xl border p-3 text-center font-mono text-2xl tracking-widest font-bold focus:ring-2 focus:ring-blue-500"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button
              type="submit"
              disabled={code.length !== 6}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
            >
              Confirmar y Activar 2FA
            </button>
          </form>
        )}

        {step === "success" && (
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-300 p-4 text-center">
              <span className="text-3xl">🎉</span>
              <h4 className="font-bold text-emerald-900 mt-1">¡2FA Activado Correctamente!</h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                Tu cuenta de supervisor/admin ahora cuenta con seguridad reforzada.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">
                Códigos de recuperación de emergencia:
              </p>
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border font-mono text-xs text-slate-700">
                {backupCodes.map((c) => (
                  <span key={c} className="p-1 bg-white rounded border text-center">
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                Guarda estos códigos en un lugar seguro. Te permitirán acceder si pierdes tu teléfono.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Entendido y Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
