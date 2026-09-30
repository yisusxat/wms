"use client";
import { useState } from "react";
import { Tag, Printer, X, Clipboard, Check } from "lucide-react";

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
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs"
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="label-modal-title"
    >
      <div className="w-full max-w-md max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-900 dark:border dark:border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="mx-auto w-12 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mb-2 sm:hidden" />
        <div className="flex items-center justify-between border-b dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h3 id="label-modal-title" className="font-bold text-gray-900 dark:text-white">Etiqueta Identificadora</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">PDF / Imprimible & ZPL Industrial Zebra</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-gray-300 text-lg"
            aria-label="✕"
          >
            ✕
          </button>
        </div>

        {/* Printable Card Area */}
        <div
          id="printable-label"
          className="rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-700 p-4 sm:p-5 bg-white dark:bg-slate-800 text-center space-y-3"
        >
          <div className="flex justify-between items-center text-[10px] text-gray-400 dark:text-slate-500 uppercase tracking-widest font-semibold border-b dark:border-slate-700 pb-1">
            <span>WMS Enterprise</span>
            <span>{data.type}</span>
          </div>

          <div className="py-2">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tracking-wide uppercase">
              {data.type === "LOCATION" ? "Ubicación en Rack" : "Identificador de Stock"}
            </p>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white font-mono mt-0.5 truncate">{data.code}</h2>
            {data.subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{data.subtitle}</p>}
          </div>

          {/* Barcode representation */}
          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center">
            <div className="font-mono text-lg sm:text-xl tracking-[0.2em] sm:tracking-[0.25em] font-bold text-slate-800 dark:text-slate-200">
              ||| | |||| | || | |||
            </div>
            <span className="text-xs font-mono text-gray-600 dark:text-slate-400 mt-1 font-semibold">{data.barcode}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 min-h-[48px] text-sm font-bold text-white hover:bg-blue-700 transition shadow-sm cursor-pointer active:scale-98"
          >
            🖨️ Imprimir
          </button>
          <button
            onClick={copyZpl}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 min-h-[48px] text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition cursor-pointer active:scale-98"
          >
            {copiedZpl ? '✓ ¡Copiado!' : 'Copiar ZPL (Zebra)'}
          </button>
        </div>
      </div>
    </div>
  );
}
