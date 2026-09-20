"use client";
import { useState } from "react";
import { apiFetch } from "../../lib/api";
import BarcodeScanner from "./BarcodeScanner";

export interface PickingItem {
  step: number;
  locationId: string;
  locationCode: string;
  aisle: string;
  rack: string;
  level: number;
  position: number;
  productId: string;
  sku: string;
  productName: string;
  quantityAvailable: number;
  requestedQuantity: number;
}

export function PickingModal({
  token,
  isOpen,
  onClose,
  products,
}: {
  token: string;
  isOpen: boolean;
  onClose: () => void;
  products: { id: string; sku: string; name: string }[];
}) {
  const [orderLines, setOrderLines] = useState<{ productId: string; quantity: number }[]>([
    { productId: products[0]?.id ?? "", quantity: 1 },
  ]);
  const [route, setRoute] = useState<PickingItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [scannerStep, setScannerStep] = useState<number | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());

  if (!isOpen) return null;

  const addLine = () => {
    setOrderLines([...orderLines, { productId: products[0]?.id ?? "", quantity: 1 }]);
  };

  const removeLine = (index: number) => {
    setOrderLines(orderLines.filter((_, i) => i !== index));
  };

  const calculateRoute = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<PickingItem[]>("/operations/picking/route", token, {
        method: "POST",
        body: JSON.stringify({ items: orderLines }),
      });
      setRoute(res);
      setCheckedSteps(new Set());
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleScanVerification = (scannedValue: string, expectedSku: string, step: number) => {
    if (scannedValue.toUpperCase().trim() === expectedSku.toUpperCase().trim()) {
      setCheckedSteps(new Set([...checkedSteps, step]));
      setScannerStep(null);
      alert(`✅ SKU verificado correctamente para el paso ${step}`);
    } else {
      alert(`⚠️ Código escaneado (${scannedValue}) no coincide con el SKU esperado (${expectedSku})`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚶</span>
            <div>
              <h3 className="font-bold text-lg">Ola de Picking Óptima (S-Shape)</h3>
              <p className="text-xs text-slate-300">Ruta optimizada en serpentina para despacho rápido</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {!route ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-gray-800">1. Seleccionar productos de la orden</h4>
                <button
                  onClick={addLine}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200"
                >
                  + Agregar línea
                </button>
              </div>

              <div className="space-y-2">
                {orderLines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      className="flex-1 rounded-lg border p-2.5 text-sm"
                      value={line.productId}
                      onChange={(e) => {
                        const next = [...orderLines];
                        next[idx].productId = e.target.value;
                        setOrderLines(next);
                      }}
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      className="w-20 rounded-lg border p-2.5 text-sm"
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...orderLines];
                        next[idx].quantity = Number(e.target.value);
                        setOrderLines(next);
                      }}
                    />
                    {orderLines.length > 1 && (
                      <button
                        onClick={() => removeLine(idx)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={calculateRoute}
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Calculando ruta óptima..." : "🧭 Generar Recorrido en Serpentina (S-Shape)"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-gray-900">Hoja de Recorrido Secuencial</h4>
                  <p className="text-xs text-gray-500">Sigue los pasos en orden para minimizar caminata</p>
                </div>
                <button
                  onClick={() => setRoute(null)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 border px-3 py-1.5 rounded-lg"
                >
                  ← Nueva Orden
                </button>
              </div>

              <div className="divide-y border rounded-xl overflow-hidden shadow-sm">
                {route.map((item) => {
                  const isDone = checkedSteps.has(item.step);
                  return (
                    <div
                      key={item.step}
                      className={`p-4 flex items-center justify-between transition ${
                        isDone ? "bg-emerald-50 text-emerald-950" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-sm ${
                            isDone ? "bg-emerald-600 text-white" : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {isDone ? "✓" : item.step}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-base text-gray-900">
                              {item.locationCode}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                              Pasillo {item.aisle} · Rack {item.rack} · Nivel {item.level}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Extraer <strong className="text-blue-700 font-bold">{item.requestedQuantity} unid.</strong> de{" "}
                            <span className="font-mono">{item.sku}</span> ({item.productName})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isDone && (
                          <button
                            onClick={() => setScannerStep(item.step)}
                            className="flex items-center gap-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100"
                          >
                            📷 Escanear SKU
                          </button>
                        )}
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={(e) => {
                            const next = new Set(checkedSteps);
                            if (e.target.checked) next.add(item.step);
                            else next.delete(item.step);
                            setCheckedSteps(next);
                          }}
                          className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {checkedSteps.size === route.length && (
                <div className="rounded-xl bg-emerald-100 p-4 text-center border border-emerald-300">
                  <p className="font-bold text-emerald-800 text-sm">🎉 ¡Recorrido de picking completado!</p>
                  <p className="text-xs text-emerald-700 mt-0.5">Todos los ítems fueron recolectados y verificados.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Barcode scanner overlay if active */}
        {scannerStep !== null && (
          <BarcodeScanner
            label={`Escanear SKU para confirmar Paso #${scannerStep}`}
            onScan={(val) => {
              const targetItem = route?.find((r) => r.step === scannerStep);
              if (targetItem) {
                handleScanVerification(val, targetItem.sku, scannerStep);
              }
            }}
            onClose={() => setScannerStep(null)}
          />
        )}
      </div>
    </div>
  );
}
