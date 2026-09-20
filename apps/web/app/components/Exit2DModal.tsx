"use client";
import { useState, useEffect } from "react";
import { apiFetch, Location } from "../../lib/api";

interface InventoryLocationItem {
  id: string;
  quantity: number;
  product: { id: string; sku: string; name: string; unit: string };
  location: Location;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
}

export function Exit2DModal({ isOpen, onClose, token, onSuccess }: Props) {
  const [items, setItems] = useState<InventoryLocationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"SELECT" | "PRE_REPORT" | "SUCCESS">("SELECT");
  const [submitting, setSubmitting] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setStep("SELECT");
      setSelectedItemIds(new Set());
      apiFetch<{ items: any[] }>("/inventory?pageSize=200", token)
        .then((res) => {
          const list = (res.items || []).filter((i: any) => (i.quantity || 0) > 0);
          setItems(list);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, token]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedItemIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedItemIds(next);
  };

  const selectedItems = items.filter((i) => selectedItemIds.has(i.id));
  const totalUnitsToExit = selectedItems.reduce((acc, i) => acc + i.quantity, 0);

  const handleProceedToPreReport = () => {
    if (selectedItems.length === 0) {
      alert("Selecciona al menos un producto o posición para dar salida.");
      return;
    }
    setStep("PRE_REPORT");
  };

  const handleConfirmExit = async () => {
    setSubmitting(true);
    try {
      const now = new Date();
      const exitRecords = [];

      for (const item of selectedItems) {
        await apiFetch("/movements/exit", token, {
          method: "POST",
          body: JSON.stringify({
            productId: item.product.id,
            locationId: item.location.id,
            quantity: item.quantity,
            reference: `SALIDA-2D-${now.getTime().toString().slice(-4)}`,
            reason: "Salida gestionada desde Layout 2D",
          }),
        });

        exitRecords.push({
          sku: item.product.sku,
          name: item.product.name,
          quantity: item.quantity,
          locationCode: item.location.code,
        });
      }

      setGeneratedReport({
        id: `REP-SALIDA-${now.getTime().toString().slice(-6)}`,
        timestamp: now.toLocaleString(),
        totalProducts: selectedItems.length,
        totalUnits: totalUnitsToExit,
        items: exitRecords,
      });

      setStep("SUCCESS");
      onSuccess();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-orange-50 text-orange-950">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📤</span>
            <div>
              <h3 className="font-bold text-base">Salida y Despacho de Productos (Layout 2D)</h3>
              <p className="text-xs text-orange-700">
                {step === "SELECT" && "Selección de posiciones con inventario para salida"}
                {step === "PRE_REPORT" && "Pre-Reporte de confirmación de despacho"}
                {step === "SUCCESS" && "Reporte oficial de salida generado exitosamente"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-orange-800 hover:bg-orange-100">
            ✕
          </button>
        </div>

        {/* Step 1: Select Products & Locations */}
        {step === "SELECT" && (
          <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                Selecciona las posiciones/productos a despachar:
              </span>
              <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2.5 py-0.5 rounded-full">
                {selectedItemIds.size} seleccionados ({totalUnitsToExit} u)
              </span>
            </div>

            {loading ? (
              <p className="text-center py-8 text-slate-400">Cargando inventario ocupado...</p>
            ) : items.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed text-slate-500">
                No hay stock disponible en los racks actualmente.
              </div>
            ) : (
              <div className="divide-y border rounded-2xl overflow-hidden max-h-[360px] overflow-y-auto">
                {items.map((item) => {
                  const isChecked = selectedItemIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleSelect(item.id)}
                      className={`p-3.5 flex items-center justify-between cursor-pointer transition ${
                        isChecked ? "bg-orange-50/80" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">
                              {item.location.code}
                            </span>
                            <span className="font-bold text-slate-900">{item.product.name}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            SKU: <span className="font-mono font-semibold">{item.product.sku}</span> · Disponible:{" "}
                            <strong className="text-slate-800">{item.quantity} {item.product.unit}</strong>
                          </p>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-xl">
                        {item.quantity} u
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Pre-Report */}
        {step === "PRE_REPORT" && (
          <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 text-xs">
              ⚠️ <strong>Verificación previa:</strong> Estás a punto de confirmar la salida física de{" "}
              <strong>{totalUnitsToExit} unidades</strong> distribuidas en <strong>{selectedItems.length} posiciones</strong>. Al confirmar, el stock se descontará de inmediato y la posición cambiará a DISPONIBLE si queda en 0.
            </div>

            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
              Detalle de Productos a Despachar:
            </h4>

            <div className="overflow-x-auto border rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase">
                  <tr>
                    <th className="p-3">Posición</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Producto</th>
                    <th className="p-3 text-right">Cant. Salida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedItems.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3 font-mono font-bold text-blue-700">{item.location.code}</td>
                      <td className="p-3 font-mono">{item.product.sku}</td>
                      <td className="p-3 font-medium text-slate-800">{item.product.name}</td>
                      <td className="p-3 text-right font-bold text-orange-700">{item.quantity} u</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 3: Success Report */}
        {step === "SUCCESS" && generatedReport && (
          <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm">
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center">
              <span className="text-3xl">🎉</span>
              <h4 className="font-bold text-emerald-900 text-base mt-1">
                ¡Salida y Despacho Registrados con Éxito!
              </h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                Las posiciones han sido actualizadas en el plano 2D de la bodega.
              </p>
            </div>

            <div className="rounded-2xl border p-4 bg-slate-50 space-y-2 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span className="font-bold text-slate-700">Folio de Despacho:</span>
                <span className="font-mono font-bold text-blue-700">{generatedReport.id}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="font-bold text-slate-700">Fecha y Hora de Emisión:</span>
                <span className="text-slate-600">{generatedReport.timestamp}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="font-bold text-slate-700">Líneas de Producto:</span>
                <span className="text-slate-600">{generatedReport.totalProducts}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-700">Total Unidades Despachadas:</span>
                <span className="font-bold text-orange-700 text-sm">{generatedReport.totalUnits} u</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t px-6 py-4 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            {step === "SUCCESS" ? "Cerrar" : "Cancelar"}
          </button>

          {step === "SELECT" && (
            <button
              type="button"
              onClick={handleProceedToPreReport}
              disabled={selectedItems.length === 0}
              className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-700 shadow transition disabled:opacity-50"
            >
              Continuar al Pre-Reporte →
            </button>
          )}

          {step === "PRE_REPORT" && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("SELECT")}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
              >
                ← Volver a Selección
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                disabled={submitting}
                className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-700 shadow transition disabled:opacity-50"
              >
                {submitting ? "Gestionando salida..." : "✓ Confirmar Salida y Generar Reporte"}
              </button>
            </div>
          )}

          {step === "SUCCESS" && (
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 shadow"
            >
              🖨️ Imprimir Reporte Oficial
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
