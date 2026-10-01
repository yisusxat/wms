"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, CurrentUser, Location, Movement, Page, Product, getWarehouseSeedLocations } from "../../lib/api";
import { useWmsRealtimeSync, notifyWmsDataChanged } from "../../lib/syncEvents";
import BarcodeScanner from "./BarcodeScanner";
import { LabelModal, LabelModalData } from "./LabelModal";
import { PickingModal } from "./PickingModal";
import { queueOfflineMovement, getPendingMovements, syncOfflineMovements, PendingMovement } from "../../lib/offlineSync";
import { playSuccessSound, playErrorSound, playClickSound } from "../../lib/audioCues";
import Icon from "./Icon";
import { useToast } from './Toast';
import { useHardwareScanner } from "../../lib/hooks/useHardwareScanner";

type Mode = "entry" | "exit" | "transfer" | "adjustment";

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

export function MovementsPanel({
  token,
  role,
  onError,
  onDataChanged,
  refreshKey,
}: {
  token: string;
  role?: CurrentUser["role"];
  onError: (value: string) => void;
  onDataChanged?: () => void;
  refreshKey?: number;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("entry");
  const [isGuidedMode, setIsGuidedMode] = useState(false);
  const [guidedStep, setGuidedStep] = useState<1 | 2 | 3>(1);
  const [tableDensity, setTableDensity] = useState<"comfortable" | "compact">("comfortable");
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [movements, setMovements] = useState<Page<Movement> | null>(null);
  const [form, setForm] = useState({
    productId: "",
    locationId: "",
    destinationLocationId: "",
    quantity: 1,
    delta: 1,
    reason: "",
    reference: "",
  });

  // Slotting state
  const [slottingSuggestions, setSlottingSuggestions] = useState<SlottingSuggestion[]>([]);
  const [loadingSlotting, setLoadingSlotting] = useState(false);

  // FIFO State
  const [fifoSuggestion, setFifoSuggestion] = useState<any>(null);
  const [loadingFifo, setLoadingFifo] = useState(false);
  const [fifoRefreshKey, setFifoRefreshKey] = useState(0);

  // Scanner modal state
  const [scannerTarget, setScannerTarget] = useState<"product" | "location" | null>(null);

  // Labels & Picking state
  const [labelData, setLabelData] = useState<LabelModalData | null>(null);
  const [pickingOpen, setPickingOpen] = useState(false);

  // Offline queue state
  const [pendingOffline, setPendingOffline] = useState<PendingMovement[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Form submission feedback states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const loadMovements = () =>
    apiFetch<Page<Movement>>("/movements?pageSize=100", token)
      .then(setMovements)
      .catch((e: Error) => onError(e.message));

  useEffect(() => {
    void Promise.all([
      apiFetch<Page<Product>>("/products?pageSize=500", token),
      apiFetch<Page<Location>>("/locations?pageSize=500", token),
      loadMovements(),
    ])
      .then(([productPage, locationPage]) => {
        setProducts(Array.isArray(productPage?.items) ? productPage.items : []);
        setLocations(Array.isArray(locationPage?.items) ? locationPage.items : []);
        setForm((current) => ({
          ...current,
          productId: current.productId || productPage?.items?.[0]?.id || "",
          locationId: current.locationId || locationPage?.items?.[0]?.id || "",
          destinationLocationId: current.destinationLocationId || locationPage?.items?.[1]?.id || "",
        }));
      })
      .catch((e: Error) => onError(e.message));
  }, [token, refreshKey]);

  // Sincronización en tiempo real con 2D, 3D y Mapeo
  useWmsRealtimeSync(() => {
    void Promise.all([
      apiFetch<Page<Product>>("/products?pageSize=500", token).catch(() => null),
      apiFetch<Page<Location>>("/locations?pageSize=500", token).catch(() => null),
      loadMovements(),
    ]).then(([productPage, locationPage]) => {
      if (productPage?.items) setProducts(productPage.items);
      if (locationPage?.items) setLocations(locationPage.items);
    });
  }, [token]);

  // Lista unificada de ubicaciones: combina las 148 de bodega, las traídas por API y las sugerencias
  const allLocations = useMemo(() => {
    const map = new Map<string, Location>();
    // 1. Agregar seed locations de la bodega (148 posiciones completas)
    const seed = getWarehouseSeedLocations() || [];
    for (const s of seed) {
      map.set(s.id, s);
    }
    // 2. Agregar ubicaciones traídas de la API (con estados actualizados)
    if (Array.isArray(locations)) {
      for (const loc of locations) {
        map.set(loc.id, loc);
      }
    }
    // 3. Agregar sugerencias de Smart Slotting
    if (Array.isArray(slottingSuggestions)) {
      for (const sug of slottingSuggestions) {
        if (sug?.locationId && !map.has(sug.locationId)) {
          map.set(sug.locationId, {
            id: sug.locationId,
            code: sug.locationCode,
            status: "AVAILABLE",
            level: sug.level,
            position: sug.position,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [locations, slottingSuggestions]);

  // Consultar Smart Slotting cuando cambia el producto en modo entrada
  useEffect(() => {
    if (mode === "entry" && form.productId) {
      setLoadingSlotting(true);
      apiFetch<SlottingSuggestion[]>(`/operations/slotting/suggest/${form.productId}`, token)
        .then((suggs) => {
          setSlottingSuggestions(suggs);
        })
        .catch(() => {
          setSlottingSuggestions([]);
        })
        .finally(() => setLoadingSlotting(false));
    } else {
      setSlottingSuggestions([]);
    }
  }, [mode, form.productId, token]);

  // Consultar Sugerencia FIFO cuando cambia el producto o cantidad en modo salida
  useEffect(() => {
    if (mode === "exit" && form.productId && form.quantity > 0) {
      setLoadingFifo(true);
      apiFetch<any>(`/operations/fifo/suggest/${form.productId}/${form.quantity}`, token)
        .then((data) => {
          setFifoSuggestion(data);
          // Si hay sugerencias y la posición actual no tiene stock, pre-seleccionar la mejor ubicación FIFO
          if (data && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
            setForm((current) => {
              const hasMatchingLoc = data.suggestions.some((s: any) => s.locationId === current.locationId);
              if (!hasMatchingLoc) {
                return { ...current, locationId: data.suggestions[0].locationId };
              }
              return current;
            });
          }
        })
        .catch(() => {
          setFifoSuggestion(null);
        })
        .finally(() => setLoadingFifo(false));
    } else {
      setFifoSuggestion(null);
    }
  }, [mode, form.productId, form.quantity, token, fifoRefreshKey]);

  // Cargar cola offline al inicio y escuchar estado de red
  useEffect(() => {
    getPendingMovements().then(setPendingOffline).catch(() => {});
    const onOnline = () => handleSyncOffline();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const handleSyncOffline = async () => {
    if (!navigator.onLine) return;
    setIsSyncing(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "https://wms-api-service.onrender.com";
      const result = await syncOfflineMovements(token, apiBase);
      if (result.synced > 0) {
        await loadMovements();
        notifyWmsDataChanged({ type: "movement", action: "sync" });
        onDataChanged?.();
        showToast({ message: `Sincronizados ${result.synced} movimientos pendientes de la cola offline.`, type: 'success' });
      }
      const updated = await getPendingMovements();
      setPendingOffline(updated);
    } catch {
      // Ignorar errores de sync silencioso
    } finally {
      setIsSyncing(false);
    }
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSuccessMsg(null);
    setLocalError(null);

    if (!form.productId) {
      setLocalError("Por favor selecciona un producto.");
      return;
    }
    if (!form.locationId) {
      setLocalError("Por favor selecciona una ubicación.");
      return;
    }
    if (mode === "transfer" && !form.destinationLocationId) {
      setLocalError("Por favor selecciona una ubicación de destino.");
      return;
    }
    if (mode === "transfer" && form.locationId === form.destinationLocationId) {
      setLocalError("La ubicación de origen y destino no pueden ser la misma.");
      return;
    }
    if (mode !== "adjustment" && (!form.quantity || form.quantity <= 0)) {
      setLocalError("La cantidad debe ser mayor a 0.");
      return;
    }

    if (mode === "exit" && fifoSuggestion && Array.isArray(fifoSuggestion.suggestions) && fifoSuggestion.suggestions.length === 0) {
      setLocalError("No es posible despachar: este producto no cuenta con existencias registradas en ninguna posición de la bodega.");
      return;
    }

    const payload =
      mode === "transfer"
        ? {
            productId: form.productId,
            sourceLocationId: form.locationId,
            destinationLocationId: form.destinationLocationId,
            quantity: form.quantity,
            reason: form.reason || "Transferencia registrada desde sistema",
            reference: form.reference || `TRF-${Date.now().toString().slice(-6)}`,
          }
        : mode === "adjustment"
        ? {
            productId: form.productId,
            locationId: form.locationId,
            delta: form.delta,
            reason: form.reason || "Ajuste registrado desde sistema",
            reference: form.reference || `ADJ-${Date.now().toString().slice(-6)}`,
          }
        : {
            productId: form.productId,
            locationId: form.locationId,
            quantity: form.quantity,
            reason: form.reason || (mode === "entry" ? "Entrada registrada desde sistema" : "Salida registrada desde sistema"),
            reference: form.reference || (mode === "entry" ? `REC-${Date.now().toString().slice(-6)}` : `ISS-${Date.now().toString().slice(-6)}`),
          };

    setIsSubmitting(true);

    // Si no hay conexión a internet, guardar en cola local IndexedDB
    if (!navigator.onLine) {
      try {
        await queueOfflineMovement({
          mode,
          payload,
          timestamp: new Date().toISOString(),
        });
        const updated = await getPendingMovements();
        setPendingOffline(updated);
        setSuccessMsg("Estás sin conexión: el movimiento fue guardado en IndexedDB local y se sincronizará automáticamente al recuperar señal.");
      } catch (err: any) {
        setLocalError("Error guardando en cola offline: " + err.message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    try {
      await apiFetch(`/movements/${mode}`, token, { method: "POST", body: JSON.stringify(payload) });
      const [updatedLocations] = await Promise.all([
        apiFetch<Page<Location>>("/locations?pageSize=500", token).catch(() => null),
        loadMovements(),
      ]);
      if (updatedLocations?.items) {
        setLocations(updatedLocations.items);
      }
      setFifoRefreshKey((k) => k + 1);
      onDataChanged?.();

      const prodObj = products.find((p) => p.id === form.productId);
      const locObj = allLocations.find((l) => l.id === form.locationId);
      const prodName = prodObj ? `${prodObj.sku} — ${prodObj.name}` : "Producto";
      const locCode = locObj ? locObj.code : form.locationId;

      notifyWmsDataChanged({ type: "movement", action: mode, locationCode: locCode, sku: prodObj?.sku });

      const actionText =
        mode === "entry"
          ? `Entrada confirmada: ${form.quantity} unidades de ${prodName} en ubicación ${locCode}`
          : mode === "exit"
          ? `Salida confirmada: ${form.quantity} unidades de ${prodName} despachadas desde ${locCode}`
          : mode === "transfer"
          ? `Transferencia confirmada: ${form.quantity} unidades de ${prodName} movidas a ${locationLabel(form.destinationLocationId)}`
          : `Ajuste de inventario aplicado (${form.delta > 0 ? "+" : ""}${form.delta}) en ${locCode}`;

      setSuccessMsg(`${actionText}.`);
      playSuccessSound();
      if (isGuidedMode) setGuidedStep(1);

      // Limpiar campos para permitir la siguiente operación de forma limpia
      setForm((prev) => ({
        ...prev,
        quantity: 1,
        delta: 1,
        reference: "",
        reason: "",
      }));
    } catch (e: any) {
      playErrorSound();
      // Si falló por desconexión de red repentina
      if (!navigator.onLine || (e as Error).message.includes("Failed to fetch") || (e as Error).message.includes("NetworkError")) {
        try {
          await queueOfflineMovement({
            mode,
            payload,
            timestamp: new Date().toISOString(),
          });
          const updated = await getPendingMovements();
          setPendingOffline(updated);
          setSuccessMsg("Conexión perdida: el movimiento se guardó localmente en la cola offline y se sincronizará al reconectar.");
        } catch {
          setLocalError("Error al encolar movimiento offline.");
        }
      } else {
        const errorMsg = (e as Error).message || "Error al registrar el movimiento";
        setLocalError(errorMsg);
        onError(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleScanCode = (code: string) => {
    if (scannerTarget === "product") {
      const match = products.find(
        (p) => p.sku.toUpperCase() === code.toUpperCase() || p.barcode === code
      );
      if (match) {
        setForm({ ...form, productId: match.id });
        setScannerTarget(null);
      } else {
        showToast({ message: `No se encontró producto con SKU/código: ${code}`, type: 'warning' });
      }
    } else if (scannerTarget === "location") {
      const match = locations.find((l) => l.code.toUpperCase() === code.toUpperCase());
      if (match) {
        setForm({ ...form, locationId: match.id });
        setScannerTarget(null);
      } else {
        showToast({ message: `No se encontró ubicación con código: ${code}`, type: 'warning' });
      }
    }
  };

  const showLocationLabel = async (locationId: string) => {
    try {
      const data = await apiFetch<LabelModalData>(`/operations/labels/location/${locationId}`, token);
      setLabelData(data);
    } catch {
      // Fallback local garantizado desde la topología física cargada en memoria
      const loc = allLocations.find((l) => l.id === locationId || l.code === locationId);
      if (loc) {
        const parts = (loc.code || "").split("-");
        const aisle = parts[0] || "A";
        const rack = parts[1] || "C";
        const rackLabel = rack === "P" ? "Rack Pared" : "Rack Central";
        const title = `Posición ${loc.code}`;
        const subtitle = `Bodega Central · Pasillo ${aisle} · ${rackLabel} · Nivel ${loc.level}`;
        const zpl = `^XA\n^PW812\n^LL406\n^FO50,40^A0N,36,36^FDWMS ENTERPRISE^FS\n^FO50,85^A0N,28,28^FDLOCATION: ${title}^FS\n^FO50,120^A0N,22,22^FD${subtitle}^FS\n^FO50,160^BCN,100,Y,N,N^FD${loc.code}^FS\n^FO550,160^BQN,2,5^FDQA,${loc.code}^FS\n^XZ`;
        setLabelData({
          code: loc.code,
          type: "LOCATION",
          title,
          subtitle,
          barcode: loc.code,
          zpl,
        });
      } else {
        onError("No fue posible cargar la información de la ubicación");
      }
    }
  };

  const showProductLabel = async (productId: string) => {
    try {
      const data = await apiFetch<LabelModalData>(`/operations/labels/product/${productId}`, token);
      setLabelData(data);
    } catch {
      // Fallback local garantizado desde el catálogo de productos cargado
      const prod = products.find((p) => p.id === productId || p.sku === productId);
      if (prod) {
        const title = prod.name;
        const subtitle = `SKU: ${prod.sku} · Unidad: ${prod.unit} · Cat: ${prod.category ?? "General"}`;
        const zpl = `^XA\n^PW812\n^LL406\n^FO50,40^A0N,36,36^FDWMS ENTERPRISE^FS\n^FO50,85^A0N,28,28^FDPRODUCT: ${title}^FS\n^FO50,120^A0N,22,22^FD${subtitle}^FS\n^FO50,160^BCN,100,Y,N,N^FD${prod.sku}^FS\n^FO550,160^BQN,2,5^FDQA,${prod.sku}^FS\n^XZ`;
        setLabelData({
          code: prod.sku,
          type: "PRODUCT",
          title,
          subtitle,
          barcode: prod.sku,
          zpl,
        });
      } else {
        onError("No fue posible cargar la información del producto");
      }
    }
  };

  const locationLabel = (id: string) =>
    allLocations.find((location) => location.id === id)?.code ?? "Seleccionar ubicación";
  const canOperate = role === "ADMIN" || role === "SUPERVISOR" || role === "OPERATOR";
  const canAdjust = role === "ADMIN" || role === "SUPERVISOR";
  const availableModes = ["entry", "exit", "transfer", ...(canAdjust ? ["adjustment"] : [])] as Mode[];

  // TODO: conectar con flujo de escaneo activo
  useHardwareScanner({
    enabled: false, 
    onScan: (code) => {
      handleScanCode(code);
    },
    minLength: 4,
  });

  return (
    <section className="space-y-5">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          {availableModes.map((item) => {
            const activeColor =
              item === "entry"
                ? "bg-emerald-600 text-white"
                : item === "exit"
                ? "bg-red-600 text-white"
                : item === "transfer"
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-white";

            const iconName =
              item === "entry"
                ? "plus"
                : item === "exit"
                ? "arrow-right"
                : item === "transfer"
                ? "movements"
                : "sliders";

            const label =
              item === "entry"
                ? "Entrada"
                : item === "exit"
                ? "Salida"
                : item === "transfer"
                ? "Transferencia"
                : "Ajuste";

            return (
              <button
                type="button"
                key={item}
                onClick={() => setMode(item)}
                className={`rounded-lg px-3.5 py-2 min-h-[40px] text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
                  mode === item
                    ? `${activeColor} shadow-xs`
                    : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                <Icon name={iconName as any} size={15} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick vs Guided Mode Toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => {
                setIsGuidedMode(false);
                playClickSound();
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition flex items-center gap-1 cursor-pointer ${
                !isGuidedMode ? "bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Icon name="refresh" size={13} />
              <span>Rápido</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsGuidedMode(true);
                setGuidedStep(1);
                playClickSound();
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition flex items-center gap-1 cursor-pointer ${
                isGuidedMode ? "bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              <Icon name="arrow-right" size={13} />
              <span>Modo Guiado</span>
            </button>
          </div>

          {pendingOffline.length > 0 && (
            <button
              type="button"
              onClick={handleSyncOffline}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 transition animate-pulse cursor-pointer"
              title="Movimientos guardados en IndexedDB pendientes de subir"
            >
              <Icon name="refresh" size={14} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? "Sincronizando..." : `Sincronizar (${pendingOffline.length} offline)`}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setPickingOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/40 px-3 py-2 text-xs font-semibold text-purple-900 dark:text-purple-300 hover:bg-purple-100 transition cursor-pointer"
          >
            <Icon name="boxes" size={14} />
            <span>Ola de Picking (S-Shape)</span>
          </button>
          <button
            type="button"
            onClick={() => showProductLabel(form.productId)}
            disabled={!form.productId}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
          >
            <Icon name="print" size={14} />
            <span>Etiqueta Producto</span>
          </button>
          <button
            type="button"
            onClick={() => showLocationLabel(form.locationId)}
            disabled={!form.locationId}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
          >
            <Icon name="print" size={14} />
            <span>Etiqueta Posición</span>
          </button>
        </div>
      </div>

      {/* Smart Slotting Recommendation Banner */}
      {mode === "entry" && slottingSuggestions.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧠</span>
              <h4 className="text-sm font-bold text-blue-900">
                Smart Slotting: Ubicaciones Óptimas Recomendadas
              </h4>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-800 font-semibold">
                Clase ABC: {slottingSuggestions[0].abcClass}
              </span>
            </div>
            {loadingSlotting && <span className="text-xs text-blue-600 animate-pulse">Analizando...</span>}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {slottingSuggestions.slice(0, 3).map((sug, idx) => (
              <div
                key={sug.locationId}
                className="flex flex-col justify-between rounded-lg bg-white p-3 border border-blue-100 shadow-xs hover:border-blue-300 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-gray-900">{sug.locationCode}</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Score {sug.score}/100
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Zona {sug.zone} · Nivel {sug.level} · Pos {sug.position}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1 italic">
                    {sug.reasons[0] ?? "Ubicación disponible"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, locationId: sug.locationId })}
                  className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 py-1.5 rounded text-center"
                >
                  {form.locationId === sug.locationId ? "✓ Seleccionada" : "⚡ Asignar esta ubicación"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FIFO Recommendation Banner (Exit Mode) */}
      {mode === "exit" && fifoSuggestion && fifoSuggestion.suggestions?.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">⏳</span>
              <h4 className="text-sm font-bold text-amber-900">
                Trazabilidad FIFO: Prioridad de Despacho por Antigüedad
              </h4>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-semibold">
                Lote más antiguo primero
              </span>
            </div>
            {loadingFifo && <span className="text-xs text-amber-700 animate-pulse">Calculando...</span>}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {fifoSuggestion.suggestions.map((sug: any, idx: number) => (
              <div
                key={sug.locationId}
                className="flex flex-col justify-between rounded-lg bg-white p-3 border border-amber-100 shadow-xs hover:border-amber-300 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm text-gray-900">{sug.locationCode}</span>
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                      Tomar {sug.suggestedQuantity} u
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Stock en posición: {sug.availableQuantity} u
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1 italic">
                    Ingresado: {new Date(sug.entryDate).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...form, locationId: sug.locationId, quantity: sug.suggestedQuantity });
                  }}
                  className="mt-2 text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 py-1.5 rounded text-center border border-amber-200"
                >
                  {form.locationId === sug.locationId ? "✓ Ubicación seleccionada" : "⚡ Despachar desde aquí"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Stock Alert (Exit Mode) */}
      {mode === "exit" && fifoSuggestion && Array.isArray(fifoSuggestion.suggestions) && fifoSuggestion.suggestions.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm text-sm text-amber-900 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-bold">Sin existencias registradas para despachar</p>
            <p className="text-xs text-amber-800">
              Este producto no cuenta con existencias en ninguna posición del almacén. Realiza una entrada o ajuste previo para poder registrar una salida.
            </p>
          </div>
        </div>
      )}

      {/* Main Movement Form */}
      <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
        {/* Stepper Progress Bar (Only visible in Guided Mode) */}
        {isGuidedMode && (
          <div className="border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
                Operación Asistida Paso a Paso
              </span>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                Paso {guidedStep} de 3
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 max-w-md">
              <button
                type="button"
                onClick={() => {
                  setGuidedStep(1);
                  playClickSound();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition ${
                  guidedStep === 1
                    ? "bg-brand text-white shadow-xs"
                    : guidedStep > 1
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <span>{guidedStep > 1 ? "✓" : "1"}</span>
                <span>Artículo</span>
              </button>
              <span className="text-slate-300">→</span>
              <button
                type="button"
                onClick={() => {
                  setGuidedStep(2);
                  playClickSound();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition ${
                  guidedStep === 2
                    ? "bg-brand text-white shadow-xs"
                    : guidedStep > 2
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <span>{guidedStep > 2 ? "✓" : "2"}</span>
                <span>Ubicación</span>
              </button>
              <span className="text-slate-300">→</span>
              <button
                type="button"
                onClick={() => {
                  setGuidedStep(3);
                  playClickSound();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition ${
                  guidedStep === 3
                    ? "bg-brand text-white shadow-xs"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <span>3</span>
                <span>Confirmar</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {/* Product field + Scanner */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium">Producto</label>
              <button
                type="button"
                onClick={() => setScannerTarget("product")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                aria-label="Escanear código de barras"
              >
                📷 Escanear SKU/QR
              </button>
            </div>
            <select
              required
              className="w-full rounded-lg border p-3 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              aria-label="Seleccionar producto"
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} — {product.name}
                </option>
              ))}
            </select>
          </div>

          {/* Location field + Scanner */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium">
                {mode === "transfer" ? "Ubicación Origen" : "Ubicación"}
              </label>
              <button
                type="button"
                onClick={() => setScannerTarget("location")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                aria-label="Escanear código de barras"
              >
                📷 Escanear Ubicación
              </button>
            </div>
            <select
              required
              className="w-full rounded-lg border p-3 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              aria-label="Seleccionar ubicación"
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
            >
              {allLocations.map((location) => {
                const fifoMatch = mode === "exit" && fifoSuggestion?.suggestions?.find((s: any) => s.locationId === location.id);
                return (
                  <option key={location.id} value={location.id}>
                    {fifoMatch
                      ? `⭐ ${location.code} — CON STOCK (${fifoMatch.availableQuantity} u disponible)`
                      : `${location.code} — ${location.status}`}
                  </option>
                );
              })}
            </select>
          </div>

          {mode === "transfer" && (
            <label className="text-sm font-medium">
              Destino
              <select
                required
                className="mt-1 w-full rounded-lg border p-3 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                aria-label="Seleccionar ubicación de destino"
                value={form.destinationLocationId}
                onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })}
              >
                {allLocations
                  .filter((location) => location.id !== form.locationId)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.status}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {mode === "adjustment" ? (
            <label className="text-sm font-semibold text-slate-700">
              Delta (+/-)
              <input
                required
                type="number"
                inputMode="numeric"
                pattern="-?[0-9]*"
                className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 min-h-[48px] text-base font-semibold focus:border-blue-600 focus:outline-none dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                value={form.delta}
                onChange={(e) => setForm({ ...form, delta: Number(e.target.value) })}
              />
            </label>
          ) : (
            <label className="text-sm font-semibold text-slate-700">
              Cantidad
              <input
                required
                min="1"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 min-h-[48px] text-base font-semibold focus:border-blue-600 focus:outline-none dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
            </label>
          )}

          <label className="text-sm font-semibold text-slate-700">
            Referencia
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 min-h-[48px] text-sm sm:text-base focus:border-blue-600 focus:outline-none dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Ej. Guía de Despacho #4092"
            />
          </label>

          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Motivo
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 min-h-[48px] text-sm sm:text-base focus:border-blue-600 focus:outline-none dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Ej. Recepción de proveedor o preparación de pedido"
            />
          </label>
        </div>

        <p className="text-xs text-gray-500">
          {mode === "transfer"
            ? `Origen: ${locationLabel(form.locationId)} → Destino seleccionado`
            : mode === "adjustment"
            ? "El ajuste positivo suma stock; el negativo descuenta stock disponible."
            : "La operación se registra transaccionalmente con el usuario autenticado."}
        </p>

        {/* Feedback Banners */}
        {successMsg && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">✅</span>
              <div>
                <p className="font-bold text-sm">Operación completada con éxito</p>
                <p className="text-xs text-emerald-800 mt-0.5">{successMsg}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="text-xs text-emerald-700 hover:text-emerald-900 font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {localError && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-bold text-sm">No se pudo registrar la operación</p>
                <p className="text-xs text-red-800 mt-0.5">{localError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLocalError(null)}
              className="text-xs text-red-700 hover:text-red-900 font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {canOperate ? (
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-xl bg-brand px-8 py-3.5 min-h-[48px] font-bold text-white shadow-md hover:opacity-95 transition active:scale-98 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>
                  Confirmando{" "}
                  {(
                    {
                      entry: "entrada...",
                      exit: "salida...",
                      transfer: "transferencia...",
                      adjustment: "ajuste...",
                    } as Record<Mode, string>
                  )[mode]}
                </span>
              </>
            ) : (
              <span>
                Confirmar{" "}
                {(
                  {
                    entry: "entrada",
                    exit: "salida",
                    transfer: "transferencia",
                    adjustment: "ajuste",
                  } as Record<Mode, string>
                )[mode]}
              </span>
            )}
          </button>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Tu rol es de solo lectura.
          </p>
        )}
      </form>

      {/* Movements Table */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-bold text-gray-800 text-sm">Historial Reciente de Movimientos</h3>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setTableDensity("comfortable");
                playClickSound();
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1 cursor-pointer ${
                tableDensity === "comfortable"
                  ? "bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              title="Vista Cómoda"
            >
              <Icon name="sliders" size={12} />
              <span>Cómoda</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTableDensity("compact");
                playClickSound();
              }}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1 cursor-pointer ${
                tableDensity === "compact"
                  ? "bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-white font-bold"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              title="Vista Compacta"
            >
              <Icon name="filter" size={12} />
              <span>Compacta</span>
            </button>
          </div>
        </div>
        <Table
          density={tableDensity}
          headers={["Tipo", "Producto", "Cantidad", "Origen", "Destino", "Fecha"]}
          rows={(movements?.items ?? []).map((item) => [
            item.type,
            item.product?.sku ?? "-",
            item.quantity,
            item.sourceLocation?.code ?? "-",
            item.destinationLocation?.code ?? "-",
            new Date(item.createdAt).toLocaleString(),
          ])}
        />
      </div>

      {/* Barcode Scanner Modal */}
      {scannerTarget && (
        <BarcodeScanner
          label={scannerTarget === "product" ? "Escanear SKU o código de producto" : "Escanear etiqueta de ubicación"}
          onScan={handleScanCode}
          onClose={() => setScannerTarget(null)}
        />
      )}

      {/* Label Modal */}
      <LabelModal data={labelData} onClose={() => setLabelData(null)} />

      {/* Picking Modal */}
      <PickingModal
        token={token}
        isOpen={pickingOpen}
        onClose={() => setPickingOpen(false)}
        products={products}
      />
    </section>
  );
}

function Table({
  headers,
  rows,
  density = "comfortable",
}: {
  headers: string[];
  rows: (string | number)[][];
  density?: "comfortable" | "compact";
}) {
  const cellPadding =
    density === "compact" ? "px-3 py-1.5 text-xs font-mono" : "px-3 py-2.5 sm:py-3 text-sm";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b text-xs uppercase text-gray-500">
            {headers.map((header) => (
              <th
                key={header}
                className={`${density === "compact" ? "px-3 py-2 text-xs" : "px-3 py-2.5 sm:py-3 text-xs"} whitespace-nowrap font-bold`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-gray-500">
                Sin registros
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={`${cellPadding} font-medium whitespace-nowrap`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
