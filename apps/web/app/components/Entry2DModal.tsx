"use client";
import { useState, useEffect, useMemo } from "react";
import { apiFetch, Product, Location, resolveLocationUuid } from "../../lib/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  locations: Location[];
  initialLocation?: Location | null;
  onSuccess: (assignedLocations: Location[], mode: "CONFIRMED" | "TRANSIT") => void;
}

export function Entry2DModal({
  isOpen,
  onClose,
  token,
  locations,
  initialLocation,
  onSuccess,
}: Props) {
  // Mode: "AUTO" (automática por proximidad) | "MANUAL" (elección manual de posiciones)
  const [selectionMode, setSelectionMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [positionsCount, setPositionsCount] = useState<number>(1);
  const [manualSelectedCodes, setManualSelectedCodes] = useState<Set<string>>(new Set());

  // Products and quantity state
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Manual filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAisle, setSelectedAisle] = useState<string>("ALL");
  const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
  const [selectedRackType, setSelectedRackType] = useState<string>("ALL");

  // Load products catalog
  useEffect(() => {
    if (isOpen) {
      setLoadingProducts(true);
      apiFetch<{ items: Product[] }>("/products?pageSize=200", token)
        .then((res) => {
          const list = res.items || [];
          setProducts(list);
          if (list.length > 0) {
            setSelectedProductId((current) => current || list[0].id);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingProducts(false));
    }
  }, [isOpen, token]);

  // Handle initialLocation when opening modal
  useEffect(() => {
    if (isOpen) {
      if (initialLocation && initialLocation.status === "AVAILABLE") {
        setSelectionMode("MANUAL");
        setManualSelectedCodes(new Set([initialLocation.code]));
      } else {
        setSelectionMode("AUTO");
        setManualSelectedCodes(new Set());
      }
      setSearchQuery("");
      setSelectedAisle("ALL");
      setSelectedLevel("ALL");
      setSelectedRackType("ALL");
    }
  }, [isOpen, initialLocation]);

  // All available locations
  const availableLocations = useMemo(() => {
    return locations.filter((l) => l.status === "AVAILABLE");
  }, [locations]);

  // Filtered available locations for manual picker
  const filteredAvailableLocations = useMemo(() => {
    return availableLocations.filter((loc) => {
      const parts = loc.code.split("-");
      const aisle = parts[0] || "A";
      const rack = parts[1] || "P";
      const level = String(loc.level);

      if (selectedAisle !== "ALL" && aisle !== selectedAisle) return false;
      if (selectedLevel !== "ALL" && level !== selectedLevel) return false;
      if (selectedRackType !== "ALL") {
        if (selectedRackType === "Pared" && rack !== "P") return false;
        if (selectedRackType === "Central" && rack !== "C") return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!loc.code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [availableLocations, selectedAisle, selectedLevel, selectedRackType, searchQuery]);

  // Effective locations to store into
  const effectiveLocations: Location[] = useMemo(() => {
    if (selectionMode === "AUTO") {
      return availableLocations.slice(0, Math.max(1, positionsCount));
    } else {
      const map = new Map(availableLocations.map((l) => [l.code, l]));
      const list: Location[] = [];
      for (const code of manualSelectedCodes) {
        const found = map.get(code);
        if (found) list.push(found);
      }
      return list;
    }
  }, [selectionMode, availableLocations, positionsCount, manualSelectedCodes]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const availableCount = availableLocations.length;

  const toggleManualLocation = (code: string) => {
    setManualSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const removeManualLocation = (code: string) => {
    setManualSelectedCodes((prev) => {
      const next = new Set(prev);
      next.delete(code);
      return next;
    });
  };

  const handleConfirm = async (mode: "CONFIRMED" | "TRANSIT") => {
    if (effectiveLocations.length === 0) {
      alert("Por favor selecciona al menos una posición disponible donde almacenar.");
      return;
    }
    if (!selectedProductId) {
      alert("Por favor selecciona un producto.");
      return;
    }
    if (!quantity || quantity <= 0) {
      alert("La cantidad debe ser mayor a 0.");
      return;
    }

    setSubmitting(true);
    try {
      const qtyPerLocation = Math.max(1, Math.floor(quantity / effectiveLocations.length));

      for (const loc of effectiveLocations) {
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

      onSuccess(effectiveLocations, mode);
      onClose();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-emerald-50 text-emerald-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📥</span>
            <div>
              <h3 className="font-bold text-base">Entrada de Mercancía (Layout 2D)</h3>
              <p className="text-xs text-emerald-700">Asignación automática o selección manual de posiciones</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-emerald-800 hover:bg-emerald-100 transition"
            title="Cerrar ventana"
          >
            ✕
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <div className="p-6 space-y-5 text-sm overflow-y-auto">
          {/* 1. Selector de Modo: Automático vs Manual */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                1. Modo de Asignación de Posición
              </label>
              <span className="text-[11px] text-slate-500">
                Disponibles en bodega: <strong className="text-emerald-600 font-bold">{availableCount}</strong>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectionMode("AUTO")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition shadow-xs ${
                  selectionMode === "AUTO"
                    ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span>🤖</span>
                <span>Asignación Automática</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectionMode("MANUAL")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition shadow-xs ${
                  selectionMode === "MANUAL"
                    ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-300"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span>🎯</span>
                <span>Elegir Posición Manualmente</span>
              </button>
            </div>

            {/* Configuración Modo Automático */}
            {selectionMode === "AUTO" && (
              <div className="pt-2 border-t border-slate-200 flex items-center gap-3">
                <div className="shrink-0">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Cantidad de racks:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={availableCount || 1}
                    value={positionsCount}
                    onChange={(e) => setPositionsCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-24 rounded-xl border p-2 font-black text-center text-base focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  El sistema asignará automáticamente las posiciones disponibles más cercanas a la zona de entrada.
                </p>
              </div>
            )}

            {/* Configuración Modo Manual con Filtros y Grid */}
            {selectionMode === "MANUAL" && (
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    Selecciona las posiciones en la lista o filtra por pasillo/nivel:
                  </span>
                  {manualSelectedCodes.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setManualSelectedCodes(new Set())}
                      className="text-[11px] font-semibold text-rose-600 hover:underline"
                    >
                      Limpiar selección ({manualSelectedCodes.size})
                    </button>
                  )}
                </div>

                {/* Filtros rápidos de Pasillo */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-bold text-slate-500">Pasillo:</span>
                  {["ALL", "A", "B", "C", "D", "E", "F"].map((aisle) => (
                    <button
                      key={aisle}
                      type="button"
                      onClick={() => setSelectedAisle(aisle)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold transition ${
                        selectedAisle === aisle
                          ? "bg-slate-800 text-white"
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {aisle === "ALL" ? "Todos" : aisle}
                    </button>
                  ))}

                  <span className="text-[11px] font-bold text-slate-500 ml-2">Nivel:</span>
                  {["ALL", "1", "2"].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSelectedLevel(lvl)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-bold transition ${
                        selectedLevel === lvl
                          ? "bg-slate-800 text-white"
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {lvl === "ALL" ? "Ambos" : `N${lvl}`}
                    </button>
                  ))}
                </div>

                {/* Búsqueda rápida por texto */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar código específico (ej: B-C-02-14 o 05)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs pl-8 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute left-2.5 top-2 text-xs text-slate-400">🔍</span>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1.5 text-xs font-bold text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Grilla interactiva de posiciones disponibles */}
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                  {filteredAvailableLocations.length === 0 ? (
                    <p className="text-center py-4 text-xs text-slate-400">
                      No se encontraron posiciones disponibles con los filtros aplicados.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                      {filteredAvailableLocations.map((loc) => {
                        const isChosen = manualSelectedCodes.has(loc.code);
                        return (
                          <button
                            key={loc.id}
                            type="button"
                            onClick={() => toggleManualLocation(loc.code)}
                            className={`flex flex-col items-center justify-center p-1.5 rounded-lg text-xs font-bold transition border ${
                              isChosen
                                ? "bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300 scale-95"
                                : "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100 hover:scale-105"
                            }`}
                          >
                            <span className="font-mono text-[11px]">{loc.code}</span>
                            <span className="text-[9px] opacity-80">
                              N{loc.level} · Pos {loc.position} {isChosen ? "✓" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Seleccionar Producto */}
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
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">
                3. Cantidad Total de Unidades que Ingresan
              </label>
              {effectiveLocations.length > 1 && (
                <span className="text-[11px] text-blue-600 font-semibold">
                  ~{Math.floor(quantity / effectiveLocations.length)} {selectedProduct?.unit || "uds"} por posición
                </span>
              )}
            </div>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
            />
          </div>

          {/* 4. Resumen de Posiciones que se van a ocupar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">
                Posiciones seleccionadas en el plano ({effectiveLocations.length}):
              </label>
              <span className="text-[11px] text-slate-400">
                {selectionMode === "MANUAL" ? "Selección Manual Activa" : "Asignación Automática"}
              </span>
            </div>

            {effectiveLocations.length === 0 ? (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 text-center">
                ⚠️ Ninguna posición seleccionada. Por favor elige al menos una posición disponible en la lista superior.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                {effectiveLocations.map((loc) => (
                  <span
                    key={loc.id}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-bold bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg border border-emerald-200 shadow-xs"
                  >
                    <span>{loc.code}</span>
                    {selectionMode === "MANUAL" && (
                      <button
                        type="button"
                        onClick={() => removeManualLocation(loc.code)}
                        className="text-emerald-700 hover:text-rose-600 ml-0.5 font-bold"
                        title={`Quitar ${loc.code}`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-4 bg-slate-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleConfirm("TRANSIT")}
              disabled={submitting || effectiveLocations.length === 0}
              className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 shadow-sm transition disabled:opacity-50"
              title="Asigna temporalmente las posiciones sin bloquearlas permanentemente"
            >
              🚚 Dejar en Tránsito
            </button>
            <button
              type="button"
              onClick={() => handleConfirm("CONFIRMED")}
              disabled={submitting || effectiveLocations.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            >
              {submitting ? "Confirmando..." : "✅ Confirmar Entrada Inmediata"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
