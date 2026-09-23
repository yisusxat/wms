"use client";
import { useState, useEffect, useMemo } from "react";
import { apiFetch, Product, Location, resolveLocationUuid, getWarehouseSeedLocations } from "../../lib/api";

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
  // Mode: "AUTO" (automática por proximidad) | "MANUAL" (elección manual en plano 2D)
  const [selectionMode, setSelectionMode] = useState<"AUTO" | "MANUAL">("AUTO");
  // Steps in manual mode: "PICK_LAYOUT" (interacción con plano) | "CONFIRM_PRODUCTS" (selección de producto y confirmación)
  const [manualStep, setManualStep] = useState<"PICK_LAYOUT" | "CONFIRM_PRODUCTS">("PICK_LAYOUT");

  const [positionsCount, setPositionsCount] = useState<number>(1);
  const [manualSelectedCodes, setManualSelectedCodes] = useState<Set<string>>(new Set());

  // Products and quantity state
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Manual layout view filters
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "1" | "2">("all");

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

  // Handle initialLocation when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialLocation && initialLocation.status === "AVAILABLE") {
        setSelectionMode("MANUAL");
        setPositionsCount(1);
        setManualSelectedCodes(new Set([initialLocation.code]));
        setManualStep("CONFIRM_PRODUCTS");
      } else {
        setSelectionMode("AUTO");
        setPositionsCount(1);
        setManualSelectedCodes(new Set());
        setManualStep("PICK_LAYOUT");
      }
      setSearchQuery("");
      setLevelFilter("all");
    }
  }, [isOpen, initialLocation]);

  // Merge seed locations with live locations to guarantee all 148 exist
  const warehouseLocations = useMemo(() => {
    const seed = getWarehouseSeedLocations();
    const liveMap = new Map((locations || []).map((l) => [l.code, l]));
    return seed.map((loc) => liveMap.get(loc.code) ?? loc);
  }, [locations]);

  // Map locations by "Aisle-RackCode-Level-Position"
  const locationMap = useMemo(() => {
    const map = new Map<string, Location>();
    for (const loc of warehouseLocations) {
      const parts = loc.code.split("-");
      const aisle = parts[0] ?? loc.rack?.aisle?.code ?? "A";
      const rack = parts[1] ?? loc.rack?.code ?? "C";
      map.set(`${aisle}-${rack}-${loc.level}-${loc.position}`, loc);
    }
    return map;
  }, [warehouseLocations]);

  const getLocation = (aisle: string, rack: string, level: number, position: number): Location => {
    const key = `${aisle}-${rack}-${level}-${position}`;
    const found = locationMap.get(key);
    if (found) return found;

    const code = `${aisle}-${rack}-${String(level).padStart(2, "0")}-${String(position).padStart(2, "0")}`;
    const id = resolveLocationUuid(code) || `${aisle}-${rack}-${level}-${position}`;
    return { id, code, level, position, status: "AVAILABLE" };
  };

  // Row positions for layout plan
  const wallPositions = useMemo(() => Array.from({ length: 22 }, (_, i) => 22 - i), []);
  const centralPositions = useMemo(() => Array.from({ length: 15 }, (_, i) => 15 - i), []);

  // All available locations
  const availableLocations = useMemo(() => {
    return warehouseLocations.filter((l) => l.status === "AVAILABLE");
  }, [warehouseLocations]);

  // Effective locations to occupy
  const effectiveLocations: Location[] = useMemo(() => {
    if (selectionMode === "AUTO") {
      return availableLocations.slice(0, Math.max(1, positionsCount));
    } else {
      const map = new Map(warehouseLocations.map((l) => [l.code, l]));
      const list: Location[] = [];
      for (const code of manualSelectedCodes) {
        const found = map.get(code);
        if (found) list.push(found);
      }
      return list;
    }
  }, [selectionMode, availableLocations, warehouseLocations, positionsCount, manualSelectedCodes]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const availableCount = availableLocations.length;

  // Toggle selection on the 2D layout plan
  const handleSquareClick = (loc: Location) => {
    if (loc.status !== "AVAILABLE") return;

    setManualSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(loc.code)) {
        next.delete(loc.code);
      } else {
        // Si la cantidad requerida es 1, cambiar directamente a la nueva posición elegida
        if (positionsCount === 1) {
          return new Set([loc.code]);
        }
        // Si ya completó la cantidad requerida, aumentar automáticamente la meta para no bloquear al usuario
        if (next.size >= positionsCount) {
          setPositionsCount(next.size + 1);
        }
        next.add(loc.code);
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

  const handleConfirm = async (submitMode: "CONFIRMED" | "TRANSIT") => {
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
        if (submitMode === "CONFIRMED") {
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

      onSuccess(effectiveLocations, submitMode);
      onClose();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Render a clickable square in the 2D layout picker
  const renderLayoutSquare = (aisle: string, rack: string, level: number, position: number) => {
    const loc = getLocation(aisle, rack, level, position);
    const isSelected = manualSelectedCodes.has(loc.code);
    const isAvailable = loc.status === "AVAILABLE";
    const isSearchMatch = searchQuery.trim()
      ? loc.code.toLowerCase().includes(searchQuery.trim().toLowerCase())
      : false;

    let bg = "#10B981"; // Verde disponible
    let border = "#059669";
    let opacity = 1;

    if (isSelected) {
      bg = "#2563EB"; // Azul vibrante seleccionado
      border = "#1D4ED8";
    } else if (loc.status === "OCCUPIED") {
      bg = "#EF4444";
      border = "#DC2626";
      opacity = 0.35;
    } else if (loc.status === "BLOCKED") {
      bg = "#64748B";
      border = "#475569";
      opacity = 0.3;
    } else if (loc.status === "MAINTENANCE") {
      bg = "#F59E0B";
      border = "#D97706";
      opacity = 0.35;
    }

    const selectedIndex = Array.from(manualSelectedCodes).indexOf(loc.code) + 1;

    return (
      <button
        key={`${aisle}-${rack}-${level}-${position}`}
        type="button"
        disabled={!isAvailable}
        onClick={() => handleSquareClick(loc)}
        title={`${loc.code} · ${isSelected ? "✓ SELECCIONADA" : loc.status === "AVAILABLE" ? "Clic para seleccionar para almacenar" : "Posición no disponible"}`}
        style={{
          backgroundColor: bg,
          borderColor: isSelected ? "#1E3A8A" : border,
          opacity: !isAvailable ? opacity : 1,
        }}
        className={`relative flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-extrabold text-white shadow-xs transition-all duration-150 ${
          isAvailable
            ? "cursor-pointer hover:scale-125 hover:z-30 hover:shadow-lg focus:outline-none"
            : "cursor-not-allowed"
        } ${
          isSelected
            ? "z-20 scale-110 ring-4 ring-blue-300 shadow-md font-black"
            : ""
        } ${isSearchMatch ? "ring-4 ring-amber-400 scale-125 z-30 animate-pulse" : ""}`}
      >
        {isSelected ? (
          <span className="font-black text-[10px]">✓{manualSelectedCodes.size > 1 ? selectedIndex : ""}</span>
        ) : (
          <span className="select-none">{String(position).padStart(2, "0")}</span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-sm animate-fadeIn">
      <div
        className={`w-full ${
          selectionMode === "MANUAL" && manualStep === "PICK_LAYOUT" ? "max-w-5xl" : "max-w-xl"
        } max-h-[94vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden transition-all duration-200`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-emerald-50 text-emerald-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📥</span>
            <div>
              <h3 className="font-bold text-base">Entrada de Mercancía (Layout 2D)</h3>
              <p className="text-xs text-emerald-700">
                {selectionMode === "AUTO"
                  ? "Asignación automática de posiciones por cercanía a entrada"
                  : manualStep === "PICK_LAYOUT"
                  ? "Paso 1: Selecciona las posiciones requeridas directamente en el plano del layout"
                  : "Paso 2: Asigna producto, cantidad y confirma la entrada"}
              </p>
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

        {/* ============================================================== */}
        {/* CASE A: MODO MANUAL - PASO 1: SELECCIÓN EN PLANO DEL LAYOUT     */}
        {/* ============================================================== */}
        {selectionMode === "MANUAL" && manualStep === "PICK_LAYOUT" && (
          <div className="flex flex-col flex-1 min-h-0 text-sm">
            {/* Top Toolbar */}
            <div className="border-b border-slate-200 bg-slate-50/90 p-4 space-y-3 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Selector de cantidad requerida */}
                <div className="flex items-center gap-2.5 bg-white px-3.5 py-1.5 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-700">
                    ¿Cuántas posiciones requieres?
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={availableCount || 1}
                    value={positionsCount}
                    onChange={(e) => setPositionsCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 rounded-xl border border-slate-300 p-1 text-center font-black text-sm text-blue-900 focus:ring-2 focus:ring-blue-500 bg-slate-50"
                  />
                  <span className="text-xs text-slate-400">
                    de <strong className="text-emerald-600">{availableCount}</strong> disponibles
                  </span>
                </div>

                {/* Switcher a Automática */}
                <button
                  type="button"
                  onClick={() => setSelectionMode("AUTO")}
                  className="text-xs font-bold text-slate-600 hover:text-emerald-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs hover:bg-emerald-50 transition"
                >
                  Cambiar a Asignación Automática 🤖
                </button>
              </div>

              {/* Status Bar / Progress & Quick Filters */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Progress Badge */}
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black shadow-xs ${
                      manualSelectedCodes.size === positionsCount
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300 animate-pulse"
                        : manualSelectedCodes.size > positionsCount
                        ? "bg-blue-100 text-blue-900 border border-blue-300"
                        : "bg-amber-100 text-amber-900 border border-amber-300"
                    }`}
                  >
                    <span>🎯</span>
                    <span>
                      {manualSelectedCodes.size} de {positionsCount} posiciones elegidas en el plano
                    </span>
                    {manualSelectedCodes.size === positionsCount && <span>✓ ¡Meta completa!</span>}
                  </span>
                  {manualSelectedCodes.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setManualSelectedCodes(new Set())}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                {/* Niveles & Search */}
                <div className="flex items-center gap-2">
                  <div className="inline-flex rounded-xl border border-slate-200 p-0.5 bg-white text-xs shadow-xs">
                    <button
                      type="button"
                      onClick={() => setLevelFilter("all")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        levelFilter === "all" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Ambos Niveles
                    </button>
                    <button
                      type="button"
                      onClick={() => setLevelFilter("1")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        levelFilter === "1" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      N1 (Piso)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLevelFilter("2")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${
                        levelFilter === "2" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      N2 (Superior)
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar posición..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-36 sm:w-44 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs pl-7 focus:ring-2 focus:ring-blue-500 shadow-xs"
                    />
                    <span className="absolute left-2 top-1.5 text-xs text-slate-400">🔍</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Interactive 2D Layout Plan inside Modal */}
            <div className="flex-1 overflow-auto p-4 bg-slate-100/90 min-h-[380px] max-h-[58vh]">
              <div className="min-w-[840px] max-w-[960px] mx-auto rounded-3xl border-4 border-slate-800 bg-white p-5 shadow-lg">
                {/* Header banner */}
                <div className="mb-4 flex items-center justify-between border-b-2 border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Plano de Planta 2D · Haz clic en cualquier casilla verde para seleccionarla
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <span className="h-3 w-3 rounded-md bg-emerald-500" /> Disponible
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-blue-700">
                      <span className="h-3 w-3 rounded-md bg-blue-600" /> Seleccionada
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <span className="h-3 w-3 rounded-md bg-red-500 opacity-40" /> Ocupada
                    </span>
                  </div>
                </div>

                {/* 5-Column Warehouse Grid */}
                <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-3.5 items-start">
                  {/* COL 1: RACK PARED PASILLO A (A-P) */}
                  <div className="rounded-2xl border-2 border-slate-800 bg-slate-50/60 p-2.5 shadow-sm">
                    <div className="mb-2 text-center border-b border-slate-200 pb-1.5">
                      <span className="inline-block rounded-full bg-blue-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                        Rack Pared
                      </span>
                      <p className="mt-0.5 text-xs font-black text-slate-800">Pasillo A (A-P)</p>
                    </div>

                    <div className="mb-1 flex justify-between px-1 text-[9px] font-black text-slate-600">
                      {(levelFilter === "all" || levelFilter === "2") && <span className="w-8 text-center text-blue-900">N2</span>}
                      <span className="flex-1 text-center text-[8px] text-slate-400">◀ PARED | PASILLO ▶</span>
                      {(levelFilter === "all" || levelFilter === "1") && <span className="w-8 text-center text-slate-700">N1</span>}
                    </div>

                    <div className="flex gap-1.5 items-stretch">
                      {(levelFilter === "all" || levelFilter === "2") && (
                        <div className="flex flex-col gap-1.5">
                          {wallPositions.map((pos) => renderLayoutSquare("A", "P", 2, pos))}
                        </div>
                      )}

                      <div className="flex w-6 flex-col items-center justify-center rounded-lg bg-slate-200/80 py-2 border border-slate-300">
                        <span
                          style={{ writingMode: "vertical-rl" }}
                          className="rotate-180 select-none text-[10px] font-black tracking-widest text-slate-600 uppercase"
                        >
                          Nivel 2 Pasillo A
                        </span>
                      </div>

                      {(levelFilter === "all" || levelFilter === "1") && (
                        <div className="flex flex-col gap-1.5">
                          {wallPositions.map((pos) => renderLayoutSquare("A", "P", 1, pos))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* COL 2: PASILLO A */}
                  <div className="flex h-full min-h-[700px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-amber-50/20 px-2">
                    <div className="flex flex-col items-center gap-6 select-none opacity-70">
                      <span className="text-xl text-slate-400 font-black">▲</span>
                      <div
                        style={{ writingMode: "vertical-rl" }}
                        className="rotate-180 text-2xl font-black tracking-widest text-slate-400 uppercase"
                      >
                        P a s i l l o &nbsp; A
                      </div>
                      <span className="text-xl text-slate-400 font-black">▼</span>
                    </div>
                  </div>

                  {/* COL 3: RACK CENTRAL ISLA (A-C / B-C) */}
                  <div className="flex flex-col items-center">
                    <div className="rounded-2xl border-2 border-slate-800 bg-slate-50/60 p-2.5 shadow-sm">
                      <div className="mb-2 text-center border-b border-slate-200 pb-1.5">
                        <span className="inline-block rounded-full bg-emerald-800 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                          Rack Central (Isla)
                        </span>
                        <p className="mt-0.5 text-xs font-black text-slate-800">Pasillos A y B</p>
                      </div>

                      <div className="flex gap-2.5 items-stretch">
                        {/* Frente Pasillo A */}
                        <div className="flex gap-1.5 items-stretch border-r-2 border-slate-300 pr-2">
                          {(levelFilter === "all" || levelFilter === "1") && (
                            <div className="flex flex-col gap-1.5">
                              <div className="text-center text-[9px] font-black text-slate-600 mb-0.5">N1</div>
                              {centralPositions.map((pos) => renderLayoutSquare("A", "C", 1, pos))}
                            </div>
                          )}

                          <div className="flex w-5 flex-col items-center justify-center rounded-lg bg-blue-50 py-2 border border-blue-200">
                            <span
                              style={{ writingMode: "vertical-rl" }}
                              className="rotate-180 select-none text-[9px] font-black tracking-widest text-blue-900 uppercase"
                            >
                              N2 Pasillo A
                            </span>
                          </div>

                          {(levelFilter === "all" || levelFilter === "2") && (
                            <div className="flex flex-col gap-1.5">
                              <div className="text-center text-[9px] font-black text-slate-600 mb-0.5">N2</div>
                              {centralPositions.map((pos) => renderLayoutSquare("A", "C", 2, pos))}
                            </div>
                          )}
                        </div>

                        {/* Frente Pasillo B */}
                        <div className="flex gap-1.5 items-stretch pl-1">
                          {(levelFilter === "all" || levelFilter === "2") && (
                            <div className="flex flex-col gap-1.5">
                              <div className="text-center text-[9px] font-black text-blue-900 mb-0.5">N2</div>
                              {centralPositions.map((pos) => renderLayoutSquare("B", "C", 2, pos))}
                            </div>
                          )}

                          <div className="flex w-5 flex-col items-center justify-center rounded-lg bg-indigo-50 py-2 border border-indigo-200">
                            <span
                              style={{ writingMode: "vertical-rl" }}
                              className="rotate-180 select-none text-[9px] font-black tracking-widest text-indigo-900 uppercase"
                            >
                              N2 Pasillo B
                            </span>
                          </div>

                          {(levelFilter === "all" || levelFilter === "1") && (
                            <div className="flex flex-col gap-1.5">
                              <div className="text-center text-[9px] font-black text-slate-700 mb-0.5">N1</div>
                              {centralPositions.map((pos) => renderLayoutSquare("B", "C", 1, pos))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* COL 4: PASILLO B */}
                  <div className="flex h-full min-h-[700px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-amber-50/20 px-2">
                    <div className="flex flex-col items-center gap-6 select-none opacity-70">
                      <span className="text-xl text-slate-400 font-black">▲</span>
                      <div
                        style={{ writingMode: "vertical-rl" }}
                        className="rotate-180 text-2xl font-black tracking-widest text-slate-400 uppercase"
                      >
                        P a s i l l o &nbsp; B
                      </div>
                      <span className="text-xl text-slate-400 font-black">▼</span>
                    </div>
                  </div>

                  {/* COL 5: RACK PARED PASILLO B (B-P) */}
                  <div className="rounded-2xl border-2 border-slate-800 bg-slate-50/60 p-2.5 shadow-sm">
                    <div className="mb-2 text-center border-b border-slate-200 pb-1.5">
                      <span className="inline-block rounded-full bg-indigo-900 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                        Rack Pared
                      </span>
                      <p className="mt-0.5 text-xs font-black text-slate-800">Pasillo B (B-P)</p>
                    </div>

                    <div className="mb-1 flex justify-between px-1 text-[9px] font-black text-slate-600">
                      {(levelFilter === "all" || levelFilter === "1") && <span className="w-8 text-center text-slate-700">N1</span>}
                      <span className="flex-1 text-center text-[8px] text-slate-400">◀ PASILLO | PARED ▶</span>
                      {(levelFilter === "all" || levelFilter === "2") && <span className="w-8 text-center text-blue-900">N2</span>}
                    </div>

                    <div className="flex gap-1.5 items-stretch">
                      {(levelFilter === "all" || levelFilter === "1") && (
                        <div className="flex flex-col gap-1.5">
                          {wallPositions.map((pos) => renderLayoutSquare("B", "P", 1, pos))}
                        </div>
                      )}

                      <div className="flex w-6 flex-col items-center justify-center rounded-lg bg-slate-200/80 py-2 border border-slate-300">
                        <span
                          style={{ writingMode: "vertical-rl" }}
                          className="rotate-180 select-none text-[10px] font-black tracking-widest text-slate-600 uppercase"
                        >
                          Nivel 2 Pasillo B
                        </span>
                      </div>

                      {(levelFilter === "all" || levelFilter === "2") && (
                        <div className="flex flex-col gap-1.5">
                          {wallPositions.map((pos) => renderLayoutSquare("B", "P", 2, pos))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Gate: Entrada / Salida */}
                <div className="mt-6 flex justify-center">
                  <div className="w-full max-w-sm rounded-xl border-2 border-slate-800 bg-amber-300 p-2 text-center font-bold text-xs text-slate-900 shadow-sm">
                    🚪 Muelle de Entrada / Recepción
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Bar: Selection Summary and Proceed Action */}
            <div className="border-t border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex-1 min-w-[280px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-slate-700">
                    Posiciones seleccionadas ({manualSelectedCodes.size}):
                  </span>
                  {manualSelectedCodes.size < positionsCount && (
                    <span className="text-[11px] text-amber-700 font-semibold">
                      (Faltan {positionsCount - manualSelectedCodes.size} por elegir en el plano)
                    </span>
                  )}
                </div>

                {manualSelectedCodes.size === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    Haz clic en una casilla verde del plano para seleccionarla.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                    {Array.from(manualSelectedCodes).map((code) => (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1 font-mono text-[11px] font-bold bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-lg border border-blue-200 shadow-xs"
                      >
                        <span>{code}</span>
                        <button
                          type="button"
                          onClick={() => removeManualLocation(code)}
                          className="text-blue-700 hover:text-rose-600 ml-0.5 font-bold"
                          title="Quitar"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => setManualStep("CONFIRM_PRODUCTS")}
                  disabled={manualSelectedCodes.size === 0}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition ${
                    manualSelectedCodes.size >= positionsCount
                      ? "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-300 hover:scale-105 active:scale-95"
                      : manualSelectedCodes.size > 0
                      ? "bg-blue-600 text-white hover:bg-blue-700 shadow"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <span>✓</span>
                  <span>
                    Aceptar Selección ({manualSelectedCodes.size} posición{manualSelectedCodes.size > 1 ? "es" : ""}) y Continuar →
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* CASE B: MODO MANUAL - PASO 2: ASIGNAR PRODUCTO Y CONFIRMAR     */}
        {/* ============================================================== */}
        {selectionMode === "MANUAL" && manualStep === "CONFIRM_PRODUCTS" && (
          <div className="p-6 space-y-5 text-sm overflow-y-auto">
            {/* Banner de posiciones confirmadas */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                  <span>✓</span>
                  <span>Posiciones elegidas en el plano ({effectiveLocations.length}):</span>
                </span>
                <button
                  type="button"
                  onClick={() => setManualStep("PICK_LAYOUT")}
                  className="text-xs font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1"
                >
                  <span>🗺️</span>
                  <span>Cambiar en el plano</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {effectiveLocations.map((loc) => (
                  <span
                    key={loc.id}
                    className="font-mono text-xs font-extrabold bg-white text-blue-950 px-3 py-1 rounded-xl border border-blue-300 shadow-xs"
                  >
                    {loc.code} (N{loc.level})
                  </span>
                ))}
              </div>
            </div>

            {/* 2. Seleccionar Producto */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Seleccionar Producto (Catálogo Oficial)
              </label>
              {loadingProducts ? (
                <p className="text-xs text-slate-400">Cargando catálogo...</p>
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
                <div className="mt-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
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
                  <span className="text-[11px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                    Reparto: ~{Math.floor(quantity / effectiveLocations.length)} {selectedProduct?.unit || "uds"} en cada posición
                  </span>
                )}
              </div>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-base font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {effectiveLocations.length === 1
                  ? `Se almacenarán las ${quantity} unidades completas en la posición ${effectiveLocations[0].code}.`
                  : `Se distribuirán las ${quantity} unidades equitativamente entre las ${effectiveLocations.length} posiciones seleccionadas.`}
              </p>
            </div>

            {/* Footer Buttons for Step 2 */}
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setManualStep("PICK_LAYOUT")}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                <span>←</span>
                <span>Volver al Plano</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirm("TRANSIT")}
                  disabled={submitting || effectiveLocations.length === 0}
                  className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 shadow-sm transition disabled:opacity-50"
                  title="Apartar posiciones temporalmente"
                >
                  🚚 Dejar en Tránsito
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirm("CONFIRMED")}
                  disabled={submitting || effectiveLocations.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {submitting ? "Confirmando..." : "✅ Confirmar Entrada Inmediata"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* CASE C: MODO AUTOMÁTICO (ORIGINAL SIMPLE)                       */}
        {/* ============================================================== */}
        {selectionMode === "AUTO" && (
          <div className="p-6 space-y-4 text-sm overflow-y-auto">
            {/* Selector de Modo */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
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
                  className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300"
                >
                  <span>🤖</span>
                  <span>Asignación Automática</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode("MANUAL");
                    setManualStep("PICK_LAYOUT");
                  }}
                  className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 transition shadow-xs"
                >
                  <span>🎯</span>
                  <span>Elegir en el Plano 2D</span>
                </button>
              </div>

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
                  El sistema asignará automáticamente las posiciones más cercanas a la entrada.
                </p>
              </div>
            </div>

            {/* 2. Seleccionar Producto */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                2. Seleccionar Producto (Catálogo Oficial)
              </label>
              {loadingProducts ? (
                <p className="text-xs text-slate-400">Cargando catálogo...</p>
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

            {/* 3. Cantidad Total */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                3. Cantidad Total de Unidades que Ingresan
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 bg-white shadow-xs"
              />
            </div>

            {/* 4. Posiciones sugeridas */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Posiciones seleccionadas en el plano ({effectiveLocations.length}):
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                {effectiveLocations.map((loc) => (
                  <span
                    key={loc.id}
                    className="font-mono text-[11px] font-bold bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-lg border border-emerald-200 shadow-xs"
                  >
                    {loc.code}
                  </span>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
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
                >
                  🚚 Dejar en Tránsito
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirm("CONFIRMED")}
                  disabled={submitting || effectiveLocations.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {submitting ? "Confirmando..." : "✅ Confirmar Entrada Inmediata"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
