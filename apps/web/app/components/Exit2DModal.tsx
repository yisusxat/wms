"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { apiFetch, Location } from "../../lib/api";
import { Icon } from "./Icon";
import { useToast } from "./Toast";

const BarcodeScanner = dynamic(
  () => import("./BarcodeScanner").then((mod) => mod.BarcodeScanner),
  { ssr: false }
);

interface InventoryLocationItem {
  id: string;
  quantity: number;
  product: { id: string; sku: string; name: string; unit: string; category?: string; barcode?: string };
  location: Location;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
  initialSelectedLocationCodes?: Set<string>;
  onOpenPickingWave?: () => void;
  onOpenVisualPlanMode?: () => void;
}

interface DispatchedItemRecord {
  orderIndex: number;
  sku: string;
  name: string;
  unit: string;
  category?: string;
  quantity: number;
  locationCode: string;
  level: number;
  position: number;
  aisle: string;
  rackName: string;
  distanceCategory: string;
}

interface GeneratedReport {
  id: string;
  timestamp: string;
  totalProducts: number;
  totalUnits: number;
  items: DispatchedItemRecord[];
}

// Proximity comparison: Lower position number is closest to the entrance gate (01 is closest, 22 is farthest)
// Level 1 (ground access) is prioritized before Level 2 (upper shelf)
function compareProximity(
  a: { location?: Location; locationCode?: string; position?: number; level?: number },
  b: { location?: Location; locationCode?: string; position?: number; level?: number }
): number {
  const aCode = a.location?.code || a.locationCode || "";
  const bCode = b.location?.code || b.locationCode || "";
  const aParts = aCode.split("-");
  const bParts = bCode.split("-");

  const aPos = a.location?.position ?? a.position ?? parseInt(aParts[3] || "99", 10);
  const bPos = b.location?.position ?? b.position ?? parseInt(bParts[3] || "99", 10);
  if (aPos !== bPos) return aPos - bPos;

  const aLevel = a.location?.level ?? a.level ?? parseInt(aParts[2] || "1", 10);
  const bLevel = b.location?.level ?? b.level ?? parseInt(bParts[2] || "1", 10);
  if (aLevel !== bLevel) return aLevel - bLevel;

  return aCode.localeCompare(bCode);
}

function getProximityLabel(position: number): { label: string; badgeClass: string } {
  if (position <= 5) {
    return { label: "Cerca de Entrada", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  }
  if (position <= 12) {
    return { label: "Zona Media", badgeClass: "bg-sky-100 text-sky-800 border-sky-200" };
  }
  if (position <= 17) {
    return { label: "Zona Media Alta", badgeClass: "bg-amber-100 text-amber-800 border-amber-200" };
  }
  return { label: "Fondo de Bodega", badgeClass: "bg-rose-100 text-rose-800 border-rose-200" };
}

export function Exit2DModal({
  isOpen,
  onClose,
  token,
  onSuccess,
  initialSelectedLocationCodes,
  onOpenPickingWave,
  onOpenVisualPlanMode,
}: Props) {
  const { showToast } = useToast();
  const [items, setItems] = useState<InventoryLocationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"SELECT" | "PRE_REPORT" | "SUCCESS">("SELECT");
  const [submitting, setSubmitting] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);

  // Scanner & Search State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scanFeedback, setScanFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setStep("SELECT");
      setSelectedItemIds(new Set());
      setGeneratedReport(null);

      apiFetch<{ items: any[] }>("/inventory?pageSize=200", token)
        .then((res) => {
          const rawItems = Array.isArray(res?.items) ? res.items : [];
          const list = rawItems
            .filter((i: any) => i && (i.quantity || 0) > 0 && i.location)
            .map((i: any) => ({
              id: i.id,
              quantity: i.quantity,
              product: {
                id: i.product?.id || "",
                sku: i.product?.sku || "SKU-N/D",
                name: i.product?.name || "Producto sin nombre",
                unit: i.product?.unit || "uds",
                category: i.product?.category || "",
              },
              location: i.location,
            }));

          // Sort inventory items by proximity from closest to farthest
          list.sort(compareProximity);
          setItems(list);

          // Pre-select items if initialSelectedLocationCodes was passed from 2D view
          if (initialSelectedLocationCodes && initialSelectedLocationCodes.size > 0) {
            const preselectedIds = new Set<string>();
            list.forEach((item) => {
              if (initialSelectedLocationCodes.has(item.location.code)) {
                preselectedIds.add(item.id);
              }
            });
            if (preselectedIds.size > 0) {
              setSelectedItemIds(preselectedIds);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, token, initialSelectedLocationCodes]);

  // Filtered items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.location.code.toLowerCase().includes(q) ||
        item.product.sku.toLowerCase().includes(q) ||
        item.product.name.toLowerCase().includes(q) ||
        (item.product.barcode && item.product.barcode.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  // Catalog products for BarcodeScanner matcher
  const catalogProducts = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ sku: string; name: string; barcode?: string }> = [];
    items.forEach((it) => {
      if (!seen.has(it.product.id)) {
        seen.add(it.product.id);
        list.push({
          sku: it.product.sku,
          name: it.product.name,
          barcode: it.product.barcode || "",
        });
      }
    });
    return list;
  }, [items]);

  const handleCodeScanned = (scannedRaw: string) => {
    const raw = (scannedRaw || "").trim();
    if (!raw) return;

    // 1. Check if it matches location code
    const matchingLocationItems = items.filter(
      (item) => item.location.code.toUpperCase() === raw.toUpperCase()
    );

    if (matchingLocationItems.length > 0) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        matchingLocationItems.forEach((it) => next.add(it.id));
        return next;
      });
      setScanFeedback({
        type: "success",
        message: `Ubicación ${matchingLocationItems[0].location.code} seleccionada (${matchingLocationItems[0].product.name}, ${matchingLocationItems[0].quantity} uds)`,
      });
      setTimeout(() => setScanFeedback(null), 4000);
      setScannerOpen(false);
      return;
    }

    // 2. Check if it matches product SKU or barcode or name
    const matchingProductItems = items.filter((item) => {
      const p = item.product;
      const cleanSku = (p.sku || "").toUpperCase();
      const cleanRaw = raw.toUpperCase();
      return (
        cleanSku === cleanRaw ||
        (p.barcode && p.barcode.toUpperCase() === cleanRaw) ||
        p.name.toUpperCase().includes(cleanRaw)
      );
    });

    if (matchingProductItems.length > 0) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        matchingProductItems.forEach((it) => next.add(it.id));
        return next;
      });
      setScanFeedback({
        type: "success",
        message: `Producto ${matchingProductItems[0].product.sku} (${matchingProductItems[0].product.name}) seleccionado en ${matchingProductItems.length} posición(es)`,
      });
      setTimeout(() => setScanFeedback(null), 4000);
      setScannerOpen(false);
      return;
    }

    // 3. Not found in occupied locations
    setScanFeedback({
      type: "error",
      message: `No se encontró inventario disponible para el código o ubicación "${raw}".`,
    });
    setTimeout(() => setScanFeedback(null), 5000);
    setScannerOpen(false);
  };

  // Selected items sorted from closest to farthest
  const sortedSelectedItems = useMemo(() => {
    const list = items.filter((i) => selectedItemIds.has(i.id));
    return list.sort(compareProximity);
  }, [items, selectedItemIds]);

  const totalUnitsToExit = useMemo(() => {
    return sortedSelectedItems.reduce((acc, i) => acc + (i.quantity || 0), 0);
  }, [sortedSelectedItems]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedItemIds(new Set(items.map((i) => i.id)));
  };

  const clearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const handleProceedToPreReport = () => {
    if (sortedSelectedItems.length === 0) {
      showToast({ message: "Por favor selecciona al menos un producto o posición para dar salida.", type: "warning" });
      return;
    }
    setStep("PRE_REPORT");
  };

  const handleConfirmExit = async () => {
    setSubmitting(true);
    try {
      const now = new Date();
      const exitRecords: DispatchedItemRecord[] = [];

      for (let i = 0; i < sortedSelectedItems.length; i++) {
        const item = sortedSelectedItems[i];
        await apiFetch("/movements/exit", token, {
          method: "POST",
          body: JSON.stringify({
            productId: item.product.id,
            locationId: item.location.id,
            quantity: item.quantity,
            reference: `SALIDA-2D-${now.getTime().toString().slice(-4)}`,
            reason: `Salida de mercadería en posición ${item.location.code} desde Layout 2D`,
          }),
        });

        const codeParts = (item.location.code || "").split("-");
        const aisle = codeParts[0] || "A";
        const rackCode = codeParts[1] || "C";
        const level = item.location.level || parseInt(codeParts[2] || "1", 10);
        const position = item.location.position || parseInt(codeParts[3] || "1", 10);

        exitRecords.push({
          orderIndex: i + 1,
          sku: item.product.sku,
          name: item.product.name,
          unit: item.product.unit || "uds",
          category: item.product.category,
          quantity: item.quantity,
          locationCode: item.location.code,
          level,
          position,
          aisle,
          rackName: rackCode === "C" ? "Rack Central" : "Rack Pared",
          distanceCategory: getProximityLabel(position).label,
        });
      }

      setGeneratedReport({
        id: `REP-SALIDA-${now.getTime().toString().slice(-6)}`,
        timestamp: now.toLocaleString(),
        totalProducts: sortedSelectedItems.length,
        totalUnits: totalUnitsToExit,
        items: exitRecords,
      });

      setStep("SUCCESS");
      onSuccess();
    } catch (err: any) {
      showToast({ message: err?.message || "Ocurrió un error al procesar la salida de mercadería.", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* GLOBAL PRINT STYLES */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          body * {
            visibility: hidden;
          }
          #printable-exit-report,
          #printable-exit-report * {
            visibility: visible !important;
          }
          #printable-exit-report {
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
      <div className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-2d-modal-title"
          className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 dark:text-white overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b dark:border-slate-800 px-4 sm:px-6 py-3.5 sm:py-4 bg-orange-50 dark:bg-slate-900 text-orange-950 dark:text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white shadow-xs font-bold shrink-0">
                <Icon name="arrow-left-right" className="h-5 w-5" />
              </span>
              <div>
                <h3 id="exit-2d-modal-title" className="font-black text-sm sm:text-base">Salida y Despacho de Productos (Layout 2D)</h3>
                <p className="text-[11px] sm:text-xs text-orange-800 dark:text-slate-400">
                  {step === "SELECT" && "Selección de posiciones con inventario · Orden de picking optimizado"}
                  {step === "PRE_REPORT" && "Verificación de ruta y orden de extracción antes de confirmar"}
                  {step === "SUCCESS" && "Reporte oficial emitido · Listo para imprimir orden de picking"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-orange-800 hover:bg-orange-200/60 transition cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* STEP 1: SELECT ITEMS */}
          {step === "SELECT" && (
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-sm">
              {/* Quick Mode Switches: 2D Visual Map and S-Shape Wave Picking */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenVisualPlanMode?.();
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-orange-200 dark:border-orange-800/60 bg-orange-50/80 dark:bg-orange-950/30 text-orange-950 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition text-left cursor-pointer shadow-2xs"
                >
                  <span className="p-2 rounded-lg bg-orange-600 text-white shrink-0 shadow-xs">
                    <Icon name="layers" size={16} />
                  </span>
                  <div>
                    <p className="text-xs font-black">1. Selección Visual en Plano 2D</p>
                    <p className="text-[10px] text-orange-800 dark:text-orange-300">
                      Haz clic directamente en los casilleros del mapa en tiempo real
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPickingWave?.();
                  }}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/80 dark:bg-purple-950/30 text-purple-950 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition text-left cursor-pointer shadow-2xs"
                >
                  <span className="p-2 rounded-lg bg-purple-600 text-white shrink-0 shadow-xs">
                    <Icon name="boxes" size={16} />
                  </span>
                  <div>
                    <p className="text-xs font-black">2. Ola de Picking (S-Shape)</p>
                    <p className="text-[10px] text-purple-800 dark:text-purple-300">
                      Ruta óptima en serpentina, descuento y PDF
                    </p>
                  </div>
                </button>
              </div>

              {initialSelectedLocationCodes && initialSelectedLocationCodes.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-2.5 text-xs text-amber-900 dark:text-amber-200 font-bold">
                  <span>
                    📍 Se cargaron {initialSelectedLocationCodes.size} posición(es) seleccionadas previamente desde el Plano 2D.
                  </span>
                  <span className="text-[11px] font-mono text-amber-700 dark:text-amber-400">
                    {Array.from(initialSelectedLocationCodes).join(", ")}
                  </span>
                </div>
              )}

              {/* Scan Feedback Notification */}
              {scanFeedback && (
                <div
                  className={`flex items-center gap-2 rounded-xl p-3 text-xs font-bold border transition animate-fadeIn ${
                    scanFeedback.type === "success"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : scanFeedback.type === "error"
                      ? "border-rose-300 bg-rose-50 text-rose-900"
                      : "border-blue-300 bg-blue-50 text-blue-900"
                  }`}
                >
                  <Icon
                    name={
                      scanFeedback.type === "success"
                        ? "check"
                        : scanFeedback.type === "error"
                        ? "alert-triangle"
                        : "info"
                    }
                    className="h-4 w-4 shrink-0"
                  />
                  <span>{scanFeedback.message}</span>
                </div>
              )}

              {/* Search & Code Scanner Bar */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Icon
                    name="search"
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar por posición (ej. A-C-1-05), SKU o producto..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-8 py-2 text-xs focus:bg-white focus:border-orange-500 focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition cursor-pointer active:scale-95 shrink-0"
                  title="Escanear etiqueta de rack o código de barras del producto"
                >
                  <Icon name="scan-barcode" size={14} />
                  <span>Escanear Código</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Posiciones con inventario disponible:
                  </span>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Icon name="map-pin" className="h-3 w-3 text-orange-600 shrink-0" />
                    <span>Listadas en orden de proximidad: desde la entrada (01) hasta el fondo.</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Seleccionar todas
                  </button>
                  {selectedItemIds.size > 0 && (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                  <span className="text-xs font-black text-orange-800 bg-orange-100 px-3 py-1 rounded-xl border border-orange-200">
                    {selectedItemIds.size} seleccionadas ({totalUnitsToExit} u)
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12 space-y-2">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-600 border-t-transparent mx-auto" />
                  <p className="text-xs text-slate-400">Cargando inventario ocupado...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed text-slate-500 text-xs">
                  No hay stock disponible en los racks actualmente para despachar.
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed text-slate-500 text-xs space-y-1">
                  <p className="font-bold text-slate-700">No se encontraron posiciones ni productos que coincidan.</p>
                  <p className="text-[11px] text-slate-400">Prueba con otro código, SKU o limpia el buscador.</p>
                </div>
              ) : (
                <div className="divide-y border rounded-2xl overflow-hidden max-h-[380px] overflow-y-auto">
                  {filteredItems.map((item, index) => {
                    const isChecked = selectedItemIds.has(item.id);
                    const pos = item.location.position;
                    const prox = getProximityLabel(pos);

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSelect(item.id)}
                        className={`p-3.5 flex items-center justify-between cursor-pointer transition ${
                          isChecked ? "bg-orange-50/70" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                          />
                          <span className="font-mono text-xs font-black text-slate-400 w-6">
                            #{index + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
                                {item.location.code}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${prox.badgeClass}`}>
                                {prox.label} · Pos #{pos}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500">
                                (Nivel {item.location.level})
                              </span>
                            </div>
                            <div className="mt-1 flex items-baseline gap-2">
                              <span className="font-bold text-slate-800 text-xs">
                                {item.product.name}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500">
                                SKU: {item.product.sku}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-orange-800 bg-orange-100 px-3 py-1 rounded-xl">
                            {item.quantity} {item.product.unit || "u"}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1">Stock a extraer</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PRE-REPORT (REVIEW SORTED ROUTE) */}
          {step === "PRE_REPORT" && (
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-sm">
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <Icon name="alert-triangle" className="h-4 w-4 text-amber-700 shrink-0" />
                  <span>Confirmación de Salida Física y Ruta de Picking:</span>
                </div>
                <p>
                  Estás a punto de confirmar el despacho de{" "}
                  <strong>{totalUnitsToExit} unidades</strong> distribuidas en{" "}
                  <strong>{sortedSelectedItems.length} posiciones</strong>.
                </p>
                <p className="font-semibold text-amber-800 flex items-center gap-1">
                  <Icon name="map-pin" className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                  <span>La tabla está organizada en orden de recorrido óptimo: desde la posición más cercana a la entrada hasta la más profunda.</span>
                </p>
              </div>

              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-700">
                  Ruta de Picking de Extracción ({sortedSelectedItems.length} ítems):
                </h4>
                <span className="text-xs font-bold text-slate-500">
                  Total: {totalUnitsToExit} unidades
                </span>
              </div>

              <div className="overflow-x-auto border rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b">
                    <tr>
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">Ubicación</th>
                      <th className="p-3">Proximidad</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3 text-right">Cant. Salida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedSelectedItems.map((item, idx) => {
                      const prox = getProximityLabel(item.location.position);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 text-center font-bold text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="p-3 font-mono font-black text-blue-700">
                            {item.location.code}
                            <span className="block text-[10px] text-slate-400 font-sans font-normal">
                              Nivel {item.location.level} · Pos #{item.location.position}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${prox.badgeClass}`}>
                              {prox.label}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-700">
                            {item.product.sku}
                          </td>
                          <td className="p-3 font-semibold text-slate-900">
                            {item.product.name}
                          </td>
                          <td className="p-3 text-right font-black text-orange-700 text-sm">
                            {item.quantity} {item.product.unit || "u"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS REPORT */}
          {step === "SUCCESS" && generatedReport && (
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-center">
                <Icon name="check-circle" className="h-9 w-9 text-emerald-600 mx-auto mb-1" />
                <h4 className="font-black text-emerald-900 text-base mt-1">
                  ¡Salida y Despacho Registrados con Éxito!
                </h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  El stock ha sido descontado y las posiciones han sido liberadas en el plano 2D.
                </p>
              </div>

              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Folio:</span>
                  <p className="font-mono font-black text-blue-800 text-sm truncate">{generatedReport.id}</p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Fecha y Hora:</span>
                  <p className="font-bold text-slate-800 text-xs truncate">{generatedReport.timestamp}</p>
                </div>
                <div className="rounded-xl border bg-slate-50 p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Líneas / Posiciones:</span>
                  <p className="font-black text-slate-900 text-sm">{generatedReport.totalProducts}</p>
                </div>
                <div className="rounded-xl border bg-orange-50 border-orange-200 p-3">
                  <span className="text-[10px] font-bold uppercase text-orange-700">Total Unidades:</span>
                  <p className="font-black text-orange-700 text-sm">{generatedReport.totalUnits} u</p>
                </div>
              </div>

              {/* Detail Table in Modal */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-700">
                    Detalle de Posiciones y Productos Despachados:
                  </h4>
                  <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                    <Icon name="map-pin" className="h-3 w-3 text-blue-700 shrink-0" />
                    <span>Ordenado desde la más cercana (Entrada) hasta la más lejana (Fondo)</span>
                  </span>
                </div>

                <div className="overflow-x-auto border rounded-2xl max-h-[260px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase border-b sticky top-0 z-10">
                      <tr>
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3">Ubicación</th>
                        <th className="p-3">Proximidad</th>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-right">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {generatedReport.items.map((row) => (
                        <tr key={row.orderIndex} className="hover:bg-slate-50">
                          <td className="p-3 text-center font-bold text-slate-400">
                            {row.orderIndex}
                          </td>
                          <td className="p-3 font-mono font-black text-blue-700">
                            {row.locationCode}
                            <span className="block text-[10px] text-slate-400 font-sans font-normal">
                              {row.rackName} · Nivel {row.level} · Pos #{row.position}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                              {row.distanceCategory}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-800">
                            {row.sku}
                          </td>
                          <td className="p-3 font-medium text-slate-800">
                            {row.name}
                          </td>
                          <td className="p-3 text-right font-black text-orange-700">
                            {row.quantity} {row.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 border-t px-4 sm:px-6 py-3 sm:py-4 bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 text-center cursor-pointer"
            >
              {step === "SUCCESS" ? "Cerrar" : "Cancelar"}
            </button>

            {step === "SELECT" && (
              <button
                type="button"
                onClick={handleProceedToPreReport}
                disabled={sortedSelectedItems.length === 0}
                className="w-full sm:w-auto rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-700 shadow-xs transition disabled:opacity-50 text-center cursor-pointer"
              >
                Continuar a Verificación de Ruta ({sortedSelectedItems.length}) →
              </button>
            )}

            {step === "PRE_REPORT" && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setStep("SELECT")}
                  className="w-full sm:w-auto px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 text-center cursor-pointer"
                >
                  ← Modificar Selección
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExit}
                  disabled={submitting}
                  className="w-full sm:w-auto rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-700 shadow-xs transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Procesando Salida...</span>
                    </>
                  ) : (
                    <span>✓ Confirmar Salida y Generar Reporte</span>
                  )}
                </button>
              </div>
            )}

            {step === "SUCCESS" && (
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700 shadow-xs transition hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Icon name="printer" className="h-4 w-4" />
                <span>Imprimir Reporte Oficial (Hoja de Picking)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PRINT-ONLY OFFICIAL PICKING / DISPATCH REPORT */}
      {generatedReport && (
        <div id="printable-exit-report" className="hidden print:block p-8 bg-white text-black font-sans">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                  Reporte Oficial de Salida y Despacho de Mercancía
                </h1>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mt-0.5">
                  WMS Enterprise · Hoja de Picking y Extracción de Bodega (Ruta Optimizada)
                </p>
              </div>
              <div className="text-right">
                <span className="font-mono text-base font-black text-slate-900">
                  {generatedReport.id}
                </span>
                <p className="text-[11px] text-slate-500">{generatedReport.timestamp}</p>
              </div>
            </div>

            {/* Information Grid */}
            <div className="mt-4 grid grid-cols-4 gap-4 rounded-xl border border-slate-300 p-3 text-xs bg-slate-50">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Folio Despacho:</span>
                <p className="font-mono font-bold text-slate-900">{generatedReport.id}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Fecha y Hora:</span>
                <p className="font-bold text-slate-900">{generatedReport.timestamp}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Posiciones / Racks:</span>
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
                CRITERIO DE RUTA: Ordenado por proximidad desde el portón de entrada (Casillero 01) hasta el fondo del almacén.
              </span>
              <span className="text-[11px] text-slate-600">Total ítems: {generatedReport.items.length}</span>
            </div>
          </div>

          {/* Picking Table */}
          <div className="mb-6">
            <table className="w-full text-left text-xs border border-slate-400 border-collapse">
              <thead>
                <tr className="bg-slate-200 text-slate-900 font-black uppercase text-[11px] border-b border-slate-400">
                  <th className="p-2 border-r border-slate-400 w-10 text-center">#</th>
                  <th className="p-2 border-r border-slate-400 w-28">Ubicación</th>
                  <th className="p-2 border-r border-slate-400 w-32">Nivel / Casillero</th>
                  <th className="p-2 border-r border-slate-400 w-28">SKU</th>
                  <th className="p-2 border-r border-slate-400">Producto / Descripción</th>
                  <th className="p-2 border-r border-slate-400 w-24 text-right">Cantidad</th>
                  <th className="p-2 w-16 text-center">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {generatedReport.items.map((row) => (
                  <tr key={row.orderIndex} className="border-b border-slate-300">
                    <td className="p-2 border-r border-slate-300 text-center font-bold text-slate-700">
                      {row.orderIndex}
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono font-black text-slate-900 text-sm">
                      {row.locationCode}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-slate-700">
                      Nivel {row.level} · Pos #{row.position}
                      <span className="block text-[10px] text-slate-500 font-sans">
                        {row.distanceCategory}
                      </span>
                    </td>
                    <td className="p-2 border-r border-slate-300 font-mono font-bold text-slate-800">
                      {row.sku}
                    </td>
                    <td className="p-2 border-r border-slate-300 font-medium text-slate-900">
                      {row.name}
                      {row.category && (
                        <span className="text-[10px] text-slate-500 block">
                          Cat: {row.category}
                        </span>
                      )}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-right font-black text-slate-900 text-sm">
                      {row.quantity} {row.unit}
                    </td>
                    <td className="p-2 text-center">
                      <div className="h-5 w-5 border border-slate-400 rounded-sm mx-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-900">
                  <td colSpan={5} className="p-2.5 text-right uppercase text-xs">
                    Total General Despachado:
                  </td>
                  <td className="p-2.5 text-right text-sm">
                    {generatedReport.totalUnits} uds
                  </td>
                  <td className="p-2.5 text-center text-[10px] text-slate-500">
                    {generatedReport.totalProducts} locs
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signatures Area */}
          <div className="mt-12 pt-6 border-t border-slate-300 grid grid-cols-3 gap-8 text-center text-xs">
            <div className="space-y-1">
              <div className="border-b border-slate-900 h-16" />
              <p className="font-bold text-slate-900 mt-2">Operador / Despachador</p>
              <p className="text-[10px] text-slate-500">Firma y RUT (Bodega)</p>
            </div>
            <div className="space-y-1">
              <div className="border-b border-slate-900 h-16" />
              <p className="font-bold text-slate-900 mt-2">Supervisor de Calidad</p>
              <p className="text-[10px] text-slate-500">Firma y Aprobación</p>
            </div>
            <div className="space-y-1">
              <div className="border-b border-slate-900 h-16" />
              <p className="font-bold text-slate-900 mt-2">Transporte / Receptor</p>
              <p className="text-[10px] text-slate-500">Firma, Nombre y Patente</p>
            </div>
          </div>
        </div>
      )}

      {/* Barcode / OCR Scanner Modal */}
      {scannerOpen && (
        <BarcodeScanner
          onScan={handleCodeScanned}
          onClose={() => setScannerOpen(false)}
          label="Escanear etiqueta de posición o SKU de producto para salida"
          catalogProducts={catalogProducts}
          inventoryProducts={items.map((i) => ({
            id: i.id,
            sku: i.product.sku,
            name: i.product.name,
            barcode: i.product.barcode,
            quantity: i.quantity,
            locationCode: i.location.code,
            category: i.product.category,
            unit: i.product.unit,
          }))}
        />
      )}
    </>
  );
}
