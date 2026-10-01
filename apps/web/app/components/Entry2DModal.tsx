"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { apiFetch, Product, Location, resolveLocationUuid } from "../../lib/api";
import Icon from "./Icon";

import { useToast } from './Toast';

const BarcodeScanner = dynamic(
  () => import("./BarcodeScanner"),
  { ssr: false }
);

interface SlottingSuggestion {
  locationId: string;
  locationCode: string;
  zone: string;
  aisle: string;
  rack: string;
  level: number;
  position: number;
  score: number;
  abcClass: "A" | "B" | "C";
  reasons: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  selectedLocations?: Location[];
  onReturnToPlan?: () => void;
  onSuccess: (assignedLocations: Location[], mode: "CONFIRMED" | "TRANSIT") => void;
}

type AssignmentMode = "SAME_PRODUCT" | "PER_LOCATION";

type LocationAssignment = {
  productId: string;
  quantity: number;
};

export function Entry2DModal({
  isOpen,
  onClose,
  token,
  selectedLocations = [],
  onReturnToPlan,
  onSuccess,
}: Props) {
  const { showToast } = useToast();
  const safeLocations = useMemo(() => {
    return Array.isArray(selectedLocations) ? selectedLocations.filter((l): l is Location => Boolean(l && l.code)) : [];
  }, [selectedLocations]);

  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("SAME_PRODUCT");
  const [products, setProducts] = useState<Product[]>([]);
  const [searchProduct, setSearchProduct] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(10);
  const [locationAssignments, setLocationAssignments] = useState<Record<string, LocationAssignment>>({});
  const [reference, setReference] = useState<string>("");
  const [reason, setReason] = useState<string>("Entrada directa desde Layout 2D");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTargetLocation, setScannerTargetLocation] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);

  const [slottingSuggestions, setSlottingSuggestions] = useState<SlottingSuggestion[]>([]);
  const [slottingLoading, setSlottingLoading] = useState(false);

  // Load products catalog
  useEffect(() => {
    if (isOpen) {
      setLoadingProducts(true);
      setErrorMsg(null);
      setReference(`ENT-2D-${Date.now().toString().slice(-4)}`);

      const initialQty = Math.max(1, safeLocations.length * 10);
      setQuantity(initialQty);

      apiFetch<{ items: Product[] }>("/products?pageSize=200", token)
        .then((res) => {
          const rawItems = Array.isArray(res?.items) ? res.items : [];
          const list = rawItems.filter((p): p is Product => Boolean(p && p.id && p.active !== false));
          setProducts(list);
          const firstId = list[0]?.id || "";
          if (firstId) {
            setSelectedProductId((current) => current || firstId);
          }

          // Initialize per-location assignments
          const initialMap: Record<string, LocationAssignment> = {};
          safeLocations.forEach((loc) => {
            if (loc?.code) {
              initialMap[loc.code] = {
                productId: firstId,
                quantity: 10,
              };
            }
          });
          setLocationAssignments(initialMap);
        })
        .catch((err) => {
          setErrorMsg("Error al cargar catálogo de productos: " + err.message);
        })
        .finally(() => setLoadingProducts(false));
    }
  }, [isOpen, token, safeLocations.length]);

  // Keep per-location assignments in sync if safeLocations change
  useEffect(() => {
    if (products.length > 0 && safeLocations.length > 0) {
      setLocationAssignments((prev) => {
        const defaultProd = selectedProductId || products[0]?.id || "";
        let hasChanges = false;
        const next = { ...prev };
        for (const loc of safeLocations) {
          if (loc?.code && !next[loc.code]) {
            next[loc.code] = { productId: defaultProd, quantity: 10 };
            hasChanges = true;
          }
        }
        return hasChanges ? next : prev;
      });
    }
  }, [safeLocations, products, selectedProductId]);

  useEffect(() => {
    if (!selectedProductId || !token) {
      setSlottingSuggestions([]);
      return;
    }
    setSlottingLoading(true);
    apiFetch<SlottingSuggestion[]>(`/operations/slotting/suggest/${selectedProductId}`, token)
      .then((suggestions) => setSlottingSuggestions(suggestions ?? []))
      .catch(() => setSlottingSuggestions([]))
      .finally(() => setSlottingLoading(false));
  }, [selectedProductId, token]);

  const filteredProducts = useMemo(() => {
    const valid = products.filter((p): p is Product => Boolean(p && p.id));
    if (!searchProduct.trim()) return valid;
    const q = searchProduct.toLowerCase().trim();
    return valid.filter(
      (p) =>
        (p.name && String(p.name).toLowerCase().includes(q)) ||
        (p.sku && String(p.sku).toLowerCase().includes(q)) ||
        (p.barcode && String(p.barcode).toLowerCase().includes(q))
    );
  }, [products, searchProduct]);

  const selectedProduct = useMemo(
    () => products.find((p) => p && p.id === selectedProductId),
    [products, selectedProductId]
  );

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products.forEach((p) => {
      if (p?.id) m.set(p.id, p);
    });
    return m;
  }, [products]);

  if (!isOpen) return null;

  const positionsCount = safeLocations.length;
  const unitsPerLoc = positionsCount > 0 ? Math.floor(quantity / positionsCount) : 0;
  const remainderUnits = positionsCount > 0 ? quantity % positionsCount : 0;

  // Total units across all per-location assignments
  const totalPerLocationUnits = safeLocations.reduce((acc, loc) => {
    if (!loc?.code) return acc;
    const item = locationAssignments[loc.code];
    return acc + (item?.quantity || 0);
  }, 0);

  // Count distinct products in per-location mode
  const distinctProductCount = (() => {
    const ids = new Set(
      safeLocations
        .map((loc) => (loc?.code ? locationAssignments[loc.code]?.productId : null))
        .filter(Boolean)
    );
    return ids.size;
  })();

  const updateLocationAssignment = (code: string, updates: Partial<LocationAssignment>) => {
    setLocationAssignments((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] || { productId: selectedProductId || products[0]?.id || "", quantity: 10 }),
        ...updates,
      },
    }));
  };

  const copyToAll = (sourceCode: string) => {
    const source = locationAssignments[sourceCode];
    if (!source) return;
    setLocationAssignments((prev) => {
      const next = { ...prev };
      for (const loc of safeLocations) {
        if (loc?.code) {
          next[loc.code] = { ...source };
        }
      }
      return next;
    });
  };

  const handleProductScanned = (code: string) => {
    const clean = code.trim().toLowerCase();
    if (!clean) return;

    const matchedProduct = products.find(
      (p) =>
        p.sku?.toLowerCase() === clean ||
        p.barcode?.toLowerCase() === clean ||
        p.name?.toLowerCase().includes(clean)
    );

    if (matchedProduct) {
      if (scannerTargetLocation) {
        updateLocationAssignment(scannerTargetLocation, { productId: matchedProduct.id });
        setScanFeedback(`Producto asignado a ${scannerTargetLocation}: ${matchedProduct.name} (${matchedProduct.sku})`);
      } else {
        setSelectedProductId(matchedProduct.id);
        setSearchProduct(matchedProduct.sku);
        setScanFeedback(`Producto seleccionado: ${matchedProduct.name} (${matchedProduct.sku})`);
      }
    } else {
      setSearchProduct(code.trim());
      setScanFeedback(`Código escaneado: "${code.trim()}". Búsqueda aplicada en catálogo.`);
    }

    setScannerOpen(false);
    setScannerTargetLocation(null);
  };

  const handleConfirm = async (submitMode: "CONFIRMED" | "TRANSIT") => {
    if (safeLocations.length === 0) {
      setErrorMsg("No hay ubicaciones seleccionadas para almacenar.");
      return;
    }

    if (assignmentMode === "SAME_PRODUCT") {
      if (!selectedProductId) {
        setErrorMsg("Por favor selecciona un producto del catálogo.");
        return;
      }
      if (!quantity || quantity <= 0) {
        setErrorMsg("La cantidad de unidades debe ser mayor a 0.");
        return;
      }
    } else {
      // Validate per-location
      for (const loc of safeLocations) {
        const item = locationAssignments[loc.code];
        if (!item?.productId) {
          setErrorMsg(`Por favor selecciona un producto para la posición ${loc.code}.`);
          return;
        }
        if (!item?.quantity || item.quantity <= 0) {
          setErrorMsg(`La cantidad para la posición ${loc.code} debe ser mayor a 0.`);
          return;
        }
      }
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (submitMode === "CONFIRMED") {
        if (assignmentMode === "SAME_PRODUCT") {
          // Distribute single product across the chosen locations
          for (let i = 0; i < safeLocations.length; i++) {
            const loc = safeLocations[i];
            const locUuid = resolveLocationUuid(loc.id) || resolveLocationUuid(loc.code) || loc.id;
            const locQty = unitsPerLoc + (i < remainderUnits ? 1 : 0);
            if (locQty <= 0) continue;

            await apiFetch("/movements/entry", token, {
              method: "POST",
              body: JSON.stringify({
                productId: selectedProductId,
                locationId: locUuid,
                quantity: locQty,
                reference: reference.trim() || `ENT-2D-${Date.now().toString().slice(-4)}`,
                reason: reason.trim() || `Entrada en posición ${loc.code} desde Layout 2D`,
              }),
            });
          }
        } else {
          // Store distinct product and custom quantity per position
          for (const loc of safeLocations) {
            const item = locationAssignments[loc.code];
            if (!item || item.quantity <= 0) continue;

            const locUuid = resolveLocationUuid(loc.id) || resolveLocationUuid(loc.code) || loc.id;
            const prod = productMap.get(item.productId);

            await apiFetch("/movements/entry", token, {
              method: "POST",
              body: JSON.stringify({
                productId: item.productId,
                locationId: locUuid,
                quantity: item.quantity,
                reference: reference.trim() || `ENT-2D-${Date.now().toString().slice(-4)}`,
                reason:
                  reason.trim() ||
                  `Ingreso de ${prod?.name || "producto"} (${item.quantity} ${prod?.unit || "uds"}) en ${loc.code}`,
              }),
            });
          }
        }
      }

      onSuccess(safeLocations, submitMode);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Ocurrió un error al procesar el ingreso de mercadería.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-2d-modal-title"
        className="w-full max-w-2xl max-h-[94vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 dark:text-white overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-4 sm:px-6 py-3.5 sm:py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm font-bold text-base">
              📥
            </span>
            <div>
              <h3 id="entry-2d-modal-title" className="text-base font-black text-slate-900 dark:text-white">
                Confirmar Entrada de Mercancía
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Asignación de producto y cantidad a las posiciones del plano
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 border border-slate-200 transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <Icon name="warning" size={14} className="text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-rose-600 hover:text-rose-900 ml-2 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {scanFeedback && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900 flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <Icon name="scan-barcode" size={15} className="text-orange-600 shrink-0" />
                <span>{scanFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setScanFeedback(null)}
                className="text-blue-500 hover:text-blue-800 ml-2 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* 1. Selected Locations Review Card */}
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                <Icon name="locations" size={14} className="text-blue-700" />
                <span>Posiciones Seleccionadas en el Plano ({safeLocations.length})</span>
              </span>
              {onReturnToPlan && (
                <button
                  type="button"
                  onClick={onReturnToPlan}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                >
                  <span>← Modificar en el plano 2D</span>
                </button>
              )}
            </div>

            {safeLocations.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                No hay posiciones seleccionadas. Cierra este diálogo y haz clic en los casilleros del plano.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {safeLocations.map((loc, idx) => (
                  <span
                    key={loc.code}
                    className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1 font-mono text-xs font-bold text-white shadow-xs"
                  >
                    <span className="text-[10px] text-blue-200">#{idx + 1}</span>
                    <span>{loc.code}</span>
                    <span className="text-[10px] text-blue-200 font-sans">
                      (N{loc.level})
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 2. Assignment Mode Toggle (only when more than 1 location is selected) */}
          {safeLocations.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Modalidad de Asignación:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAssignmentMode("SAME_PRODUCT")}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition shadow-xs ${
                    assignmentMode === "SAME_PRODUCT"
                      ? "bg-white text-blue-900 ring-2 ring-blue-500/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>📦</span>
                  <span>Mismo producto en todas</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    (Reparto total)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAssignmentMode("PER_LOCATION")}
                  className={`flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition shadow-xs ${
                    assignmentMode === "PER_LOCATION"
                      ? "bg-white text-blue-900 ring-2 ring-blue-500/20"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                  }`}
                >
                  <span>🎯</span>
                  <span>Diferentes productos por posición</span>
                  <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-black text-blue-800">
                    Avanzado
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* 3A. MODE: SAME PRODUCT FOR ALL */}
          {assignmentMode === "SAME_PRODUCT" ? (
            <div className="space-y-4">
              {/* Product Selection */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  1. Seleccionar Producto del Catálogo *
                </label>

                {loadingProducts ? (
                  <p className="text-xs text-slate-500 py-2">Cargando catálogo de productos...</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder="Filtrar por nombre o SKU..."
                          value={searchProduct}
                          onChange={(e) => setSearchProduct(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:outline-none"
                        />
                        <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">
                          <Icon name="search" size={13} />
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setScannerTargetLocation(null);
                          setScannerOpen(true);
                        }}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white px-3 py-2 text-xs font-bold shadow-xs transition cursor-pointer active:scale-95 shrink-0"
                        title="Escanear código de barras o SKU del producto con cámara / OCR / manual"
                      >
                        <Icon name="scan-barcode" size={14} />
                        <span>Escanear</span>
                      </button>
                    </div>

                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-800 shadow-xs focus:border-blue-600 focus:outline-none"
                    >
                      {filteredProducts.length === 0 ? (
                        <option value="">No se encontraron productos</option>
                      ) : (
                        filteredProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku || ""} - {p.name || "Sin nombre"} ({p.unit || "uds"})
                          </option>
                        ))
                      )}
                    </select>

                    {selectedProduct && (
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                        <div>
                          <p className="font-bold text-slate-800">{selectedProduct.name}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            SKU: {selectedProduct.sku}{" "}
                            {selectedProduct.barcode ? `· Código: ${selectedProduct.barcode}` : ""}
                          </p>
                        </div>
                        {selectedProduct.category && (
                          <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                            {selectedProduct.category}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Sugerencias de slotting inteligente */}
                    {slottingLoading && (
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Calculando ubicaciones óptimas...</p>
                    )}
                    {!slottingLoading && slottingSuggestions.length > 0 && (
                      <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-800 dark:bg-blue-950/30">
                        <p className="mb-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                          Ubicaciones recomendadas por el sistema:
                        </p>
                        <div className="space-y-1">
                          {slottingSuggestions.slice(0, 3).map((s) => (
                            <button
                              key={s.locationId}
                              type="button"
                              onClick={() => {
                                showToast({ message: "Por favor, selecciona esta ubicación en el plano 2D principal.", type: "warning" });
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer"
                            >
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                {s.locationCode}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                Zona {s.zone} · Clase {s.abcClass}
                              </span>
                              <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 font-semibold text-white">
                                {s.score}%
                              </span>
                            </button>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                          *Las sugerencias son referenciales. Cierra este panel para seleccionar estas posiciones en el plano 2D.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Total Quantity & Distribution */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    2. Cantidad Total de Unidades que Ingresan *
                  </label>
                  <span className="text-xs text-slate-500 font-semibold">
                    Unidad: {selectedProduct?.unit || "uds"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-32 rounded-xl border border-slate-300 p-2 text-center text-sm font-black text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <div className="flex items-center gap-1 flex-wrap">
                    {[5, 10, 25, 50, 100].map((add) => (
                      <button
                        key={add}
                        type="button"
                        onClick={() => setQuantity((q) => q + add)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition"
                      >
                        +{add}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Distribution preview */}
                {positionsCount > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900">
                    <div className="flex items-center gap-2 font-bold">
                      <Icon name="boxes" className="h-4 w-4 text-emerald-700 shrink-0" />
                      <span>Reparto Automático:</span>
                      <span>
                        {remainderUnits === 0
                          ? `${unitsPerLoc} ${selectedProduct?.unit || "uds"} en cada una de las ${positionsCount} posiciones`
                          : `~${unitsPerLoc} a ${unitsPerLoc + 1} ${selectedProduct?.unit || "uds"} por posición (Total exacto: ${quantity} uds)`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 3B. MODE: PER-LOCATION DIFFERENT PRODUCTS */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Configurar Producto y Unidades por Posición:
                </label>
                <span className="text-[11px] font-bold text-slate-500">
                  {safeLocations.length} ubicaciones configurables
                </span>
              </div>

              <div className="space-y-3">
                {safeLocations.map((loc, idx) => {
                  const assignment = locationAssignments[loc.code] || {
                    productId: selectedProductId || products[0]?.id || "",
                    quantity: 10,
                  };
                  const currentProd = productMap.get(assignment.productId);

                  return (
                    <div
                      key={loc.code}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 shadow-2xs space-y-2.5 transition hover:border-blue-300 hover:bg-blue-50/20"
                    >
                      {/* Location Row Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 font-mono text-xs font-black text-white shadow-2xs">
                            #{idx + 1}
                          </span>
                          <span className="font-mono text-sm font-black text-slate-900">
                            {loc.code}
                          </span>
                          <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            Nivel {loc.level} · Pos #{loc.position}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setScannerTargetLocation(loc.code);
                              setScannerOpen(true);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-700 hover:bg-orange-100 transition shadow-2xs cursor-pointer active:scale-95"
                            title="Escanear código de producto para esta posición"
                          >
                            <Icon name="scan-barcode" className="h-3 w-3" />
                            <span>Escanear</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToAll(loc.code)}
                            className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1"
                            title="Copiar este producto y cantidad a todas las demás posiciones"
                          >
                            <Icon name="copy" className="h-3 w-3" />
                            <span>Copiar a todas</span>
                          </button>
                        </div>
                      </div>

                      {/* Product Selector and Quantity Inputs */}
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2 items-center">
                        <div>
                          <select
                            value={assignment.productId}
                            onChange={(e) =>
                              updateLocationAssignment(loc.code, { productId: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-none"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku || ""} - {p.name || "Sin nombre"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-500">Cant:</span>
                          <input
                            type="number"
                            min={1}
                            value={assignment.quantity}
                            onChange={(e) =>
                              updateLocationAssignment(loc.code, {
                                quantity: Math.max(1, parseInt(e.target.value) || 1),
                              })
                            }
                            className="w-16 rounded-xl border border-slate-300 bg-white p-1.5 text-center text-xs font-black text-slate-900 focus:border-blue-600 focus:outline-none"
                          />
                          <span className="text-[11px] font-medium text-slate-500 truncate">
                            {currentProd?.unit || "uds"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary of per-location entry */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950 font-bold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Icon name="bar-chart-2" className="h-4 w-4 text-blue-700" />
                  <span>Resumen total de la entrada:</span>
                </span>
                <span className="font-black text-blue-900">
                  {totalPerLocationUnits} unidades en total ({distinctProductCount} producto(s) diferente(s))
                </span>
              </div>
            </div>
          )}

          {/* 4. Reference & Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Referencia / Guía / Lote
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ej: GUIA-4580 o LOTE-A1"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2 text-xs font-mono focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Motivo / Observación
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo del ingreso"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2 text-xs focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 border-t border-slate-100 bg-slate-50 px-4 sm:px-6 py-3 sm:py-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition text-center cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={submitting || safeLocations.length === 0}
              onClick={() => handleConfirm("TRANSIT")}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 transition shadow-2xs disabled:opacity-50 text-center cursor-pointer"
              title="Apartar las posiciones como 'En Tránsito' temporalmente"
            >
              <Icon name="truck" className="h-3.5 w-3.5" />
              <span>Dejar en Tránsito</span>
            </button>

            <button
              type="button"
              disabled={
                submitting ||
                safeLocations.length === 0 ||
                (assignmentMode === "SAME_PRODUCT" && !selectedProductId)
              }
              onClick={() => handleConfirm("CONFIRMED")}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white shadow-md hover:bg-emerald-700 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Procesando Entrada...</span>
                </>
              ) : (
                <>
                  <Icon name="check" className="h-4 w-4" />
                  <span>Confirmar Entrada Inmediata</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Barcode / OCR Scanner Modal */}
      {scannerOpen && (
        <BarcodeScanner
          onScan={handleProductScanned}
          onClose={() => {
            setScannerOpen(false);
            setScannerTargetLocation(null);
          }}
          label={
            scannerTargetLocation
              ? `Escanear producto para posición ${scannerTargetLocation}`
              : "Escanear producto para la entrada"
          }
          catalogProducts={products.map((p) => ({
            sku: p.sku || "",
            name: p.name || "",
            barcode: p.barcode || "",
          }))}
        />
      )}
    </div>
  );
}
