"use client";
import { useState } from "react";

export interface LabelModalData {
  code: string;
  type: "LOCATION" | "PALLET" | "PRODUCT";
  title: string;
  subtitle?: string;
  barcode: string;
  zpl: string;
}

export function LabelModal({
  data,
  onClose,
}: {
  data: LabelModalData | null;
  onClose: () => void;
}) {
  const [copiedZpl, setCopiedZpl] = useState(false);

  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  const copyZpl = () => {
    navigator.clipboard.writeText(data.zpl);
    setCopiedZpl(true);
    setTimeout(() => setCopiedZpl(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏷️</span>
            <div>
              <h3 className="font-bold text-gray-900">Etiqueta Identificadora</h3>
              <p className="text-xs text-gray-500">PDF / Imprimible & ZPL Industrial Zebra</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Printable Card Area */}
        <div
          id="printable-label"
          className="rounded-xl border-2 border-dashed border-gray-300 p-5 bg-white text-center space-y-3"
        >
          <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-widest font-semibold border-b pb-1">
            <span>WMS Enterprise</span>
            <span>{data.type}</span>
          </div>

          <div className="py-2">
            <p className="text-xs font-semibold text-blue-600 tracking-wide uppercase">
              {data.type === "LOCATION" ? "Ubicación en Rack" : "Identificador de Stock"}
            </p>
            <h2 className="text-2xl font-black text-gray-900 font-mono mt-0.5">{data.code}</h2>
            {data.subtitle && <p className="text-xs text-gray-500 mt-1">{data.subtitle}</p>}
          </div>

          {/* Barcode representation */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col items-center">
            <div className="font-mono text-xl tracking-[0.25em] font-bold text-slate-800">
              ||| | |||| | || | |||
            </div>
            <span className="text-xs font-mono text-gray-600 mt-1 font-semibold">{data.barcode}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm"
          >
            🖨️ Imprimir
          </button>
          <button
            onClick={copyZpl}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            {copiedZpl ? "✓ ¡Copiado!" : "📋 Copiar ZPL (Zebra)"}
          </button>
        </div>
      </div>
    </div>
  );
}
