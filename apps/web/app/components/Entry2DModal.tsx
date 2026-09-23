"use client";

import { useState, useEffect, useMemo } from "react";
import { apiFetch, Product, Location, resolveLocationUuid } from "../../lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  selectedLocations: Location[];
  onReturnToPlan?: () => void;
  onSuccess: (assignedLocations: Location[], mode: "CONFIRMED" | "TRANSIT") => void;
}

export function Entry2DModal({
  isOpen,
  onClose,
  token,
  selectedLocations,
  onReturnToPlan,
  onSuccess,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchProduct, setSearchProduct] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(10);
  const [reference, setReference] = useState<string>("");
  const [reason, setReason] = useState<string>("Entrada directa desde Layout 2D");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load products catalog
  useEffect(() => {
    if (isOpen) {
      setLoadingProducts(true);
      setErrorMsg(null);
      setReference(`ENT-2D-${Date.now().toString().slice(-4)}`);

      // Set initial quantity proportional to positions selected
      const initialQty = Math.max(1, selectedLocations.length * 10);
      setQuantity(initialQty);

      apiFetch<{ items: Product[] }>("/products?pageSize=200", token)
        .then((res) => {
          const list = (res.items || []).filter((p) => p.active !== false);
          setProducts(list);
          if (list.length > 0) {
            setSelectedProductId((current) => current || list[0].id);
          }
        })
        .catch((err) => {
          setErrorMsg("Error al cargar catálogo de productos: " + err.message);
        })
        .finally(() => setLoadingProducts(false));
    }
  }, [isOpen, token, selectedLocations.length]);

  const filteredProducts = useMemo(() => {
    if (!searchProduct.trim()) return products;
    const q = searchProduct.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }, [products, searchProduct]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  if (!isOpen) return null;

  const positionsCount = selectedLocations.length;
  const unitsPerLoc = positionsCount > 0 ? Math.floor(quantity / positionsCount) : 0;
  const remainderUnits = positionsCount > 0 ? quantity % positionsCount : 0;

  const handleConfirm = async (submitMode: "CONFIRMED" | "TRANSIT") => {
    if (selectedLocations.length === 0) {
      setErrorMsg("No hay ubicaciones seleccionadas para almacenar.");
      return;
    }
    if (!selectedProductId) {
      setErrorMsg("Por favor selecciona un producto del catálogo.");
      return;
    }
    if (!quantity || quantity <= 0) {
      setErrorMsg("La cantidad de unidades debe ser mayor a 0.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      if (submitMode === "CONFIRMED") {
        // Distribute units across the chosen locations
        for (let i = 0; i < selectedLocations.length; i++) {
          const loc = selectedLocations[i];
          const locUuid = resolveLocationUuid(loc.id) || resolveLocationUuid(loc.code) || loc.id;
          // Allocate base units + 1 for remaining units on the first locations
          const locQty = unitsPerLoc + (i < remainderUnits ? 1 : 0);
          if (locQty <= 0) continue;

          await apiFetch("/movements/entry", token, {
            method: "POST",
            body: JSON.stringify({
              productId: selectedProductId,
              locationId: locUuid,
              quantity: locQty,
              reference: reference.trim() || `ENT-2D-${Date.now().toString().slice(-4)}`,
              reason: reason.trim() || "Entrada directa confirmada desde Layout 2D",
            }),
          });
        }
      }

      onSuccess(selectedLocations, submitMode);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Ocurrió un error al procesar el ingreso de mercadería.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm font-bold text-base">
              📥
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Confirmar Entrada de Mercancía
              </h3>
              <p className="text-xs text-slate-500">
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
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-center justify-between">
              <span>⚠️ {errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-rose-600 hover:text-rose-900 ml-2 font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* 1. Selected Locations Review Card */}
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                <span>📍</span>
                <span>Posiciones Seleccionadas en el Plano ({selectedLocations.length})</span>
              </span>
              {onReturnToPlan && (
                <button
                  type="button"
                  onClick={onReturnToPlan}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline"
                >
                  <span>← Modificar en el plano 2D</span>
                </button>
              )}
            </div>

            {selectedLocations.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                No hay posiciones seleccionadas. Cierra este diálogo y haz clic en los casilleros del plano.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedLocations.map((loc, idx) => (
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

          {/* 2. Product Selection */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
              1. Seleccionar Producto del Catálogo *
            </label>

            {loadingProducts ? (
              <p className="text-xs text-slate-500 py-2">Cargando catálogo de productos...</p>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Filtrar por nombre o SKU..."
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-2 text-xs focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
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
                        {p.sku} - {p.name} ({p.unit || "uds"})
                      </option>
                    ))
                  )}
                </select>

                {selectedProduct && (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{selectedProduct.name}</p>
                      <p className="text-[11px] font-mono text-slate-500">
                        SKU: {selectedProduct.sku} {selectedProduct.barcode ? `· Código: ${selectedProduct.barcode}` : ""}
                      </p>
                    </div>
                    {selectedProduct.category && (
                      <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                        {selectedProduct.category}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Total Quantity & Distribution */}
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
              <div className="flex items-center gap-1">
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
                  <span>📦 Reparto Automático:</span>
                  <span>
                    {remainderUnits === 0
                      ? `${unitsPerLoc} ${selectedProduct?.unit || "uds"} en cada una de las ${positionsCount} posiciones`
                      : `~${unitsPerLoc} a ${unitsPerLoc + 1} ${selectedProduct?.unit || "uds"} por posición (Total exacto: ${quantity} uds)`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 4. Reference & Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting || selectedLocations.length === 0}
              onClick={() => handleConfirm("TRANSIT")}
              className="rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100 transition shadow-xs disabled:opacity-50"
              title="Apartar las posiciones como 'En Tránsito' temporalmente"
            >
              🚚 Dejar en Tránsito
            </button>

            <button
              type="button"
              disabled={submitting || selectedLocations.length === 0 || !selectedProductId}
              onClick={() => handleConfirm("CONFIRMED")}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white shadow-md hover:bg-emerald-700 hover:scale-105 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Procesando Entrada...</span>
                </>
              ) : (
                <>
                  <span>✅</span>
                  <span>Confirmar Entrada Inmediata</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
