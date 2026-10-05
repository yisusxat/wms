"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";
import BarcodeScanner from "./BarcodeScanner";
import { useToast } from "./Toast";
import {
  Route,
  X,
  Trash2,
  Compass,
  Camera,
  CheckCircle,
  Printer,
  FileText,
  Boxes,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { notifyWmsDataChanged } from "../../lib/syncEvents";

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

export interface PickingReport {
  id: string;
  timestamp: string;
  totalProducts: number;
  totalUnits: number;
  items: PickingItem[];
  operatorName: string;
  warehouseName: string;
}

export function PickingModal({
  token,
  isOpen,
  onClose,
  products = [],
  onSuccess,
}: {
  token: string;
  isOpen: boolean;
  onClose: () => void;
  products?: { id: string; sku: string; name: string }[];
  onSuccess?: () => void;
}) {
  const { showToast } = useToast();

  const [catalog, setCatalog] = useState<{ id: string; sku: string; name: string }[]>(
    products || []
  );
  const [orderLines, setOrderLines] = useState<{ productId: string; quantity: number }[]>([
    { productId: products?.[0]?.id ?? "", quantity: 1 },
  ]);
  const [route, setRoute] = useState<PickingItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scannerStep, setScannerStep] = useState<number | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [generatedReport, setGeneratedReport] = useState<PickingReport | null>(null);
  const [showReportView, setShowReportView] = useState(false);

  // Sync or fetch products if empty
  useEffect(() => {
    if (products && products.length > 0) {
      setCatalog(products);
      if (!orderLines[0]?.productId) {
        setOrderLines([{ productId: products[0].id, quantity: 1 }]);
      }
      return;
    }

    if (isOpen && token) {
      apiFetch<any>("/products?pageSize=200", token)
        .then((res) => {
          const list = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
          if (list.length > 0) {
            const mapped = list.map((p: any) => ({
              id: p.id,
              sku: p.sku || "SKU-N/D",
              name: p.name || "Sin nombre",
            }));
            setCatalog(mapped);
            if (!orderLines[0]?.productId) {
              setOrderLines([{ productId: mapped[0].id, quantity: 1 }]);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen, token, products]);

  if (!isOpen) return null;

  const addLine = () => {
    setOrderLines([
      ...orderLines,
      { productId: catalog[0]?.id ?? "", quantity: 1 },
    ]);
  };

  const removeLine = (index: number) => {
    setOrderLines(orderLines.filter((_, i) => i !== index));
  };

  const calculateRoute = async () => {
    if (orderLines.some((l) => !l.productId || l.quantity <= 0)) {
      showToast({
        message: "Por favor selecciona un producto y cantidad válida para cada línea.",
        type: "warning",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<PickingItem[]>("/operations/picking/route", token, {
        method: "POST",
        body: JSON.stringify({ items: orderLines }),
      });
      setRoute(res || []);
      setCheckedSteps(new Set());
      setGeneratedReport(null);
      setShowReportView(false);
    } catch (err) {
      showToast({ message: (err as Error).message || "Error al calcular ruta", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleScanVerification = (scannedValue: string, expectedSku: string, step: number) => {
    if (scannedValue.toUpperCase().trim() === expectedSku.toUpperCase().trim()) {
      setCheckedSteps(new Set([...checkedSteps, step]));
      setScannerStep(null);
      showToast({ message: `SKU verificado correctamente para el paso ${step}`, type: "success" });
    } else {
      showToast({
        message: `Código escaneado (${scannedValue}) no coincide con el SKU esperado (${expectedSku})`,
        type: "warning",
      });
    }
  };

  // Requirement: Approve / Collect and deduct products automatically from DB + Generate official printable PDF report
  const handleApproveAndGenerateReport = async () => {
    if (!route || route.length === 0) {
      showToast({ message: "No hay pasos en la ruta de picking para procesar.", type: "warning" });
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const folio = `OLA-PICK-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

      // Execute exit movements in DB for all route items
      for (const item of route) {
        await apiFetch("/movements/exit", token, {
          method: "POST",
          body: JSON.stringify({
            productId: item.productId,
            locationId: item.locationId,
            quantity: item.requestedQuantity,
            reference: folio,
            reason: `Salida aprobada por Ola de Picking (S-Shape) en posición ${item.locationCode}`,
          }),
        });
      }

      // Mark all steps as collected
      setCheckedSteps(new Set(route.map((r) => r.step)));

      const totalUnits = route.reduce((sum, item) => sum + item.requestedQuantity, 0);
      const report: PickingReport = {
        id: folio,
        timestamp: now.toLocaleString(),
        totalProducts: route.length,
        totalUnits,
        items: [...route],
        operatorName: "Operador de Despacho",
        warehouseName: "Bodega Central",
      };

      setGeneratedReport(report);
      setShowReportView(true);

      // Trigger realtime updates
      notifyWmsDataChanged({ type: "movement", action: "exit" });
      onSuccess?.();

      showToast({
        message: `¡Ola de picking aprobada! Stock descontado (${totalUnits} uds) e informe generado exitosamente.`,
        type: "success",
      });
    } catch (err: any) {
      showToast({
        message: err?.message || "Ocurrió un error al procesar el descuento de stock de la ola.",
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* GLOBAL PRINT STYLES FOR OFFICIAL PICKING REPORT */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          body * {
            visibility: hidden;
          }
          #printable-picking-report,
          #printable-picking-report * {
            visibility: visible !important;
          }
          #printable-picking-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: white !important;
            color: #0f172a !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* SCREEN MODAL DIALOG */}
      <div
        className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="picking-modal-title"
      >
        <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 dark:border dark:border-slate-800 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b dark:border-slate-800 px-6 py-4 bg-slate-900 text-white">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-purple-600 text-white shadow-xs">
                <Boxes className="h-5 w-5" />
              </span>
              <div>
                <h3 id="picking-modal-title" className="font-bold text-lg">
                  Ola de Picking Óptima (S-Shape)
                </h3>
                <p className="text-xs text-slate-300">
                  Ruta optimizada en serpentina para despacho rápido con aprobación y descuento automático
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 dark:text-white">
            {showReportView && generatedReport ? (
              /* REPORT SUMMARY & PRINT PREVIEW VIEW */
              <div className="space-y-6 animate-fadeIn">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/40 p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-base text-emerald-950 dark:text-emerald-200">
                        ¡Ola de Picking Aprobada y Stock Descontado!
                      </h4>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300">
                        Los productos fueron descontados automáticamente del inventario. El informe oficial de
                        despacho está listo para imprimir o guardar en PDF.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Report Key Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Folio de Ola</span>
                    <p className="font-mono font-black text-slate-900 dark:text-white text-sm">
                      {generatedReport.id}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Fecha / Hora</span>
                    <p className="font-bold text-slate-900 dark:text-white text-xs">
                      {generatedReport.timestamp}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Posiciones Visitadas</span>
                    <p className="font-black text-slate-900 dark:text-white text-sm">
                      {generatedReport.totalProducts} casilleros
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Total Unidades</span>
                    <p className="font-black text-purple-600 dark:text-purple-400 text-sm">
                      {generatedReport.totalUnits} uds
                    </p>
                  </div>
                </div>

                {/* Step List in Report */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-slate-800">
                  <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex justify-between">
                    <span>Detalle de Líneas Descontadas</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">Estado: REGISTRADO EN DB</span>
                  </div>
                  {generatedReport.items.map((item) => (
                    <div
                      key={item.step}
                      className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-6 w-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[11px]">
                          ✓
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {item.locationCode}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              (Pasillo {item.aisle} · Rack {item.rack} · Nivel {item.level})
                            </span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                            <strong className="text-slate-800 dark:text-slate-200">{item.sku}</strong> — {item.productName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-purple-700 dark:text-purple-400 text-sm">
                          {item.requestedQuantity} uds
                        </span>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          Descontado
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Report Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowReportView(false)}
                    className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border dark:border-slate-700 px-3.5 py-2 rounded-lg cursor-pointer"
                  >
                    ← Volver a la Ruta
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 px-5 py-2.5 text-xs font-black text-white shadow-md transition active:scale-95 cursor-pointer"
                    >
                      <Printer className="h-4 w-4" />
                      <span>🖨️ Imprimir / Guardar como PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cerrar y Continuar
                    </button>
                  </div>
                </div>
              </div>
            ) : !route ? (
              /* ORDER LINE CREATION VIEW */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-gray-800 dark:text-white">
                    1. Seleccionar productos de la orden
                  </h4>
                  <button
                    onClick={addLine}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800/50 cursor-pointer"
                  >
                    + Agregar línea
                  </button>
                </div>

                <div className="space-y-2">
                  {orderLines.map((line, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        className="flex-1 rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm dark:text-white"
                        value={line.productId}
                        onChange={(e) => {
                          const next = [...orderLines];
                          next[idx].productId = e.target.value;
                          setOrderLines(next);
                        }}
                      >
                        {catalog.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        className="w-20 rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-sm dark:text-white"
                        value={line.quantity}
                        onChange={(e) => {
                          const next = [...orderLines];
                          next[idx].quantity = Math.max(1, Number(e.target.value));
                          setOrderLines(next);
                        }}
                      />
                      {orderLines.length > 1 && (
                        <button
                          onClick={() => removeLine(idx)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={calculateRoute}
                  disabled={loading}
                  className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer transition"
                >
                  {loading ? (
                    "Calculando ruta óptima..."
                  ) : (
                    <>
                      <Compass className="w-4 h-4" />
                      <span>Generar Recorrido en Serpentina (S-Shape)</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* GENERATED SEQUENTIAL S-SHAPE ROUTE VIEW */
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-white">Hoja de Recorrido Secuencial</h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Ruta S-Shape: {route.length} paradas · {route.reduce((s, r) => s + r.requestedQuantity, 0)} unidades a recolectar
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRoute(null)}
                      className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border dark:border-slate-700 px-3 py-1.5 rounded-lg cursor-pointer"
                    >
                      ← Nueva Orden
                    </button>
                  </div>
                </div>

                <div className="divide-y dark:divide-slate-800 border dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  {route.map((item) => {
                    const isDone = checkedSteps.has(item.step);
                    return (
                      <div
                        key={item.step}
                        className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                          isDone
                            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-950 dark:text-emerald-100"
                            : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-sm ${
                              isDone
                                ? "bg-emerald-600 text-white"
                                : "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300"
                            }`}
                          >
                            {isDone ? "✓" : item.step}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold text-base text-gray-900 dark:text-white">
                                {item.locationCode}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                                Pasillo {item.aisle} · Rack {item.rack} · Nivel {item.level}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                              Extraer{" "}
                              <strong className="text-blue-700 dark:text-blue-400 font-bold">
                                {item.requestedQuantity} unid.
                              </strong>{" "}
                              de <span className="font-mono">{item.sku}</span> ({item.productName})
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                          {!isDone && (
                            <button
                              onClick={() => setScannerStep(item.step)}
                              className="flex items-center gap-1 text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer"
                            >
                              <Camera className="h-4 w-4" /> Escanear SKU
                            </button>
                          )}
                          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:text-transparent cursor-pointer">
                            <span className="sm:hidden">Confirmado:</span>
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={(e) => {
                                const next = new Set(checkedSteps);
                                if (e.target.checked) next.add(item.step);
                                else next.delete(item.step);
                                setCheckedSteps(next);
                              }}
                              className="h-5 w-5 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-700 text-emerald-600 focus:ring-emerald-500"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* APPROVAL, AUTOMATIC STOCK DEDUCTION AND PDF REPORT GENERATION BUTTON */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleApproveAndGenerateReport}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 py-3.5 px-4 text-sm font-black text-white shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Descontando stock y aprobando ola de picking...</span>
                      </div>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        <span>Aprobar Despacho, Descontar Stock y Generar Informe (PDF)</span>
                      </>
                    )}
                  </button>
                  <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    * Este botón aprueba y recolecta la ola, descuenta el stock en la base de datos y genera el PDF oficial imprimible.
                  </p>
                </div>
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

      {/* PRINTABLE OFFICIAL PICKING REPORT DOCUMENT (FOR PDF / PRINTER) */}
      {generatedReport && (
        <div id="printable-picking-report" className="hidden print:block p-8 bg-white text-slate-900">
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  WMS ENTERPRISE · LOGÍSTICA & DESPACHO
                </h1>
                <p className="text-sm font-bold text-slate-700">
                  INFORME OFICIAL DE OLA DE PICKING (S-SHAPE) & DESPACHO
                </p>
                <p className="text-xs text-slate-500">
                  Sistema de Gestión de Almacén · {generatedReport.warehouseName}
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono text-lg font-black text-slate-900">
                  {generatedReport.id}
                </span>
                <p className="text-xs text-slate-500">{generatedReport.timestamp}</p>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-slate-900 text-white font-black text-[10px] tracking-wider uppercase">
                  APROBADO Y DESCONTADO EN DB
                </span>
              </div>
            </div>

            {/* Information Grid */}
            <div className="mt-4 grid grid-cols-4 gap-4 rounded-xl border border-slate-300 p-3 text-xs bg-slate-50">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Folio de Ola:</span>
                <p className="font-mono font-bold text-slate-900">{generatedReport.id}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Fecha y Hora:</span>
                <p className="font-bold text-slate-900">{generatedReport.timestamp}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Total Paradas:</span>
                <p className="font-bold text-slate-900">{generatedReport.totalProducts} casilleros</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Total Unidades:</span>
                <p className="font-black text-slate-900 text-sm">{generatedReport.totalUnits} uds</p>
              </div>
            </div>

            {/* Picking Route Instruction */}
            <div className="mt-3 rounded-lg border border-slate-400 bg-slate-100 p-2 text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>
                CRITERIO DE RECORRIDO: Algoritmo S-Shape (Serpentina óptima) para minimización de distancia en pasillos.
              </span>
              <span className="text-[11px] text-slate-600">Total pasos: {generatedReport.items.length}</span>
            </div>
          </div>

          {/* Picking Items Table */}
          <table className="w-full text-left text-xs border border-slate-400 border-collapse mb-6">
            <thead>
              <tr className="bg-slate-200 text-slate-900 font-black uppercase text-[11px] border-b border-slate-400">
                <th className="p-2 border-r border-slate-400 w-10 text-center">Paso</th>
                <th className="p-2 border-r border-slate-400 w-28">Ubicación</th>
                <th className="p-2 border-r border-slate-400 w-32">Pasillo / Nivel</th>
                <th className="p-2 border-r border-slate-400 w-28">SKU</th>
                <th className="p-2 border-r border-slate-400">Producto / Descripción</th>
                <th className="p-2 border-r border-slate-400 w-24 text-right">Cantidad</th>
                <th className="p-2 w-20 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {generatedReport.items.map((row) => (
                <tr key={row.step} className="border-b border-slate-300">
                  <td className="p-2 border-r border-slate-300 text-center font-bold text-slate-700">
                    #{row.step}
                  </td>
                  <td className="p-2 border-r border-slate-300 font-mono font-black text-slate-900 text-sm">
                    {row.locationCode}
                  </td>
                  <td className="p-2 border-r border-slate-300 text-slate-700">
                    Pasillo {row.aisle} · Rack {row.rack} · Nivel {row.level}
                  </td>
                  <td className="p-2 border-r border-slate-300 font-mono font-bold text-slate-800">
                    {row.sku}
                  </td>
                  <td className="p-2 border-r border-slate-300 font-medium text-slate-900">
                    {row.productName}
                  </td>
                  <td className="p-2 border-r border-slate-300 text-right font-black text-slate-900 text-sm">
                    {row.requestedQuantity} uds
                  </td>
                  <td className="p-2 text-center font-bold text-emerald-800 text-[10px]">
                    DESCONTADO
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-900">
                <td colSpan={5} className="p-2.5 text-right uppercase text-xs">
                  Total General Recolectado y Descontado:
                </td>
                <td className="p-2.5 text-right text-sm">
                  {generatedReport.totalUnits} uds
                </td>
                <td className="p-2.5 text-center text-[10px] text-slate-600">
                  {generatedReport.totalProducts} ítems
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures Area */}
          <div className="mt-12 pt-6 border-t border-slate-300 grid grid-cols-2 gap-12 text-center text-xs">
            <div className="space-y-1">
              <div className="border-b border-slate-900 h-14" />
              <p className="font-bold text-slate-900 mt-2">Operador de Picking</p>
              <p className="text-[10px] text-slate-500">Firma y RUT (Recolección física)</p>
            </div>
            <div className="space-y-1">
              <div className="border-b border-slate-900 h-14" />
              <p className="font-bold text-slate-900 mt-2">Supervisor de Despacho</p>
              <p className="text-[10px] text-slate-500">Firma y Aprobación de Salida</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
