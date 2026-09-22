"use client";
import { useState, useEffect } from "react";
import { apiFetch, Product, Location, resolveLocationUuid } from "../../lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  locations: Location[];
  onSuccess: (assignedLocations: Location[], mode: "CONFIRMED" | "TRANSIT") => void;
}

export function Entry2DModal({ isOpen, onClose, token, locations, onSuccess }: Props) {
  const [positionsCount, setPositionsCount] = useState<number>(1);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [suggestedLocations, setSuggestedLocations] = useState<Location[]>([]);

  useEffect(() => {
    if (isOpen) {
      setLoadingProducts(true);
      apiFetch<{ items: Product[] }>("/products?pageSize=100", token)
        .then((res) => {
          const list = res.items || [];
          setProducts(list);
          if (list.length > 0) setSelectedProductId(list[0].id);
        })
        .catch(() => {})
        .finally(() => setLoadingProducts(false));
    }
  }, [isOpen, token]);

  // Recalcular posiciones sugeridas disponibles cuando cambia el count
  useEffect(() => {
    if (!isOpen) return;
    const available = locations.filter((l) => l.status === "AVAILABLE");
    setSuggestedLocations(available.slice(0, Math.max(1, positionsCount)));
  }, [isOpen, positionsCount, locations]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const availableCount = locations.filter((l) => l.status === "AVAILABLE").length;

  const handleConfirm = async (mode: "CONFIRMED" | "TRANSIT") => {
    if (suggestedLocations.length === 0) {
      alert("No hay suficientes posiciones disponibles.");
      return;
    }
    if (!selectedProductId) {
      alert("Por favor selecciona un producto.");
      return;
    }

    setSubmitting(true);
    try {
      // Registrar transaccionalmente la recepción o asignación
      const qtyPerLocation = Math.max(1, Math.floor(quantity / suggestedLocations.length));

      for (const loc of suggestedLocations) {
        if (mode === "CONFIRMED") {
          const locUuid = resolveLocationUuid(loc.id) || resolveLocationUuid(loc.code) || loc.id;
          await apiFetch("/movements/entry", token, {
            method: "POST",
            body: JSON.stringify({
              productId: selectedProductId,
              locationId: locUuid,
              quantity: qtyPerLocation,
              reference: `ENTRADA-2D-${Date.now().toString().slice(-4)}`,
              reason: "Entrada de mercancía directa desde Plano 2D",
            }),
          });
        }
      }

      onSuccess(suggestedLocations, mode);
      onClose();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-emerald-50 text-emerald-950">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📥</span>
            <div>
              <h3 className="font-bold text-base">Entrada de Mercancía (Layout 2D)</h3>
              <p className="text-xs text-emerald-700">Asignación dinámica de posiciones en racks</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-emerald-800 hover:bg-emerald-100">
            ✕
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 text-sm">
          {/* 1. Cantidad de Posiciones requeridas */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">
                1. ¿Cuántas posiciones en rack necesitas?
              </label>
              <span className="text-[11px] text-slate-400">
                Disponibles en bodega: <strong className="text-emerald-600 font-bold">{availableCount}</strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={availableCount || 1}
                value={positionsCount}
                onChange={(e) => setPositionsCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-28 rounded-xl border p-2.5 font-bold text-center text-base focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-xs text-slate-500">
                Se asignarán automáticamente las posiciones más cercanas a la entrada.
              </span>
            </div>
          </div>

          {/* 2. Seleccionar Producto desde la Base de Datos */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              2. Seleccionar Producto (Catálogo Oficial)
            </label>
            {loadingProducts ? (
              <p className="text-xs text-slate-400">Cargando productos de la base de datos...</p>
            ) : (
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full rounded-xl border p-2.5 text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} ({p.unit})
                  </option>
                ))}
              </select>
            )}

            {selectedProduct && (
              <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <p>
                  <strong className="text-slate-700">SKU:</strong>{" "}
                  <span className="font-mono font-bold text-blue-700">{selectedProduct.sku}</span>
                </p>
                <p>
                  <strong className="text-slate-700">Nombre:</strong> {selectedProduct.name}
                </p>
                <p>
                  <strong className="text-slate-700">Unidad de Manejo:</strong> {selectedProduct.unit}
                </p>
              </div>
            )}
          </div>

          {/* 3. Cantidad Total de Unidades */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              3. Cantidad Total de Unidades que Ingresan
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full rounded-xl border p-2.5 text-sm font-semibold focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* 4. Posiciones sugeridas a ocupar */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Posiciones seleccionadas en el plano ({suggestedLocations.length}):
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-xl border">
              {suggestedLocations.map((loc) => (
                <span
                  key={loc.id}
                  className="font-mono text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg"
                >
                  {loc.code}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-4 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleConfirm("TRANSIT")}
              disabled={submitting || suggestedLocations.length === 0}
              className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 shadow-sm transition disabled:opacity-50"
              title="Asigna temporalmente las posiciones sin bloquearlas permanentemente"
            >
              🚚 Dejar en Tránsito
            </button>
            <button
              type="button"
              onClick={() => handleConfirm("CONFIRMED")}
              disabled={submitting || suggestedLocations.length === 0}
              className="flex items-center gap-1 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow transition disabled:opacity-50"
            >
              {submitting ? "Confirmando..." : "✅ Confirmar Entrada Inmediata"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
