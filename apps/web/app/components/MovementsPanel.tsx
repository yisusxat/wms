"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, CurrentUser, Location, Movement, Page, Product } from "../../lib/api";
import BarcodeScanner from "./BarcodeScanner";
import { LabelModal, LabelModalData } from "./LabelModal";
import { PickingModal } from "./PickingModal";

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
}: {
  token: string;
  role?: CurrentUser["role"];
  onError: (value: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("entry");
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

  // Scanner modal state
  const [scannerTarget, setScannerTarget] = useState<"product" | "location" | null>(null);

  // Labels & Picking state
  const [labelData, setLabelData] = useState<LabelModalData | null>(null);
  const [pickingOpen, setPickingOpen] = useState(false);

  const loadMovements = () =>
    apiFetch<Page<Movement>>("/movements?pageSize=100", token)
      .then(setMovements)
      .catch((e: Error) => onError(e.message));

  useEffect(() => {
    void Promise.all([
      apiFetch<Page<Product>>("/products?pageSize=100", token),
      apiFetch<Page<Location>>("/locations?pageSize=100", token),
      loadMovements(),
    ])
      .then(([productPage, locationPage]) => {
        setProducts(productPage.items);
        setLocations(locationPage.items);
        setForm((current) => ({
          ...current,
          productId: current.productId || productPage.items[0]?.id || "",
          locationId: current.locationId || locationPage.items[0]?.id || "",
          destinationLocationId: current.destinationLocationId || locationPage.items[1]?.id || "",
        }));
      })
      .catch((e: Error) => onError(e.message));
  }, [token]);

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload =
      mode === "transfer"
        ? {
            productId: form.productId,
            sourceLocationId: form.locationId,
            destinationLocationId: form.destinationLocationId,
            quantity: form.quantity,
            reason: form.reason,
            reference: form.reference,
          }
        : mode === "adjustment"
        ? {
            productId: form.productId,
            locationId: form.locationId,
            delta: form.delta,
            reason: form.reason,
            reference: form.reference,
          }
        : {
            productId: form.productId,
            locationId: form.locationId,
            quantity: form.quantity,
            reason: form.reason,
            reference: form.reference,
          };
    try {
      await apiFetch(`/movements/${mode}`, token, { method: "POST", body: JSON.stringify(payload) });
      await loadMovements();
    } catch (e) {
      onError((e as Error).message);
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
        alert(`No se encontró producto con SKU/código: ${code}`);
      }
    } else if (scannerTarget === "location") {
      const match = locations.find((l) => l.code.toUpperCase() === code.toUpperCase());
      if (match) {
        setForm({ ...form, locationId: match.id });
        setScannerTarget(null);
      } else {
        alert(`No se encontró ubicación con código: ${code}`);
      }
    }
  };

  const showLocationLabel = async (locationId: string) => {
    try {
      const data = await apiFetch<LabelModalData>(`/operations/labels/location/${locationId}`, token);
      setLabelData(data);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const showProductLabel = async (productId: string) => {
    try {
      const data = await apiFetch<LabelModalData>(`/operations/labels/product/${productId}`, token);
      setLabelData(data);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const locationLabel = (id: string) =>
    locations.find((location) => location.id === id)?.code ?? "Seleccionar ubicación";
  const canOperate = role === "ADMIN" || role === "SUPERVISOR" || role === "OPERATOR";
  const canAdjust = role === "ADMIN" || role === "SUPERVISOR";
  const availableModes = ["entry", "exit", "transfer", ...(canAdjust ? ["adjustment"] : [])] as Mode[];

  return (
    <section className="space-y-5">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="flex flex-wrap gap-2">
          {availableModes.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setMode(item)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                mode === item ? "bg-brand text-white shadow-xs" : "border bg-white text-gray-700 hover:bg-slate-50"
              }`}
            >
              {(
                {
                  entry: "📥 Entrada",
                  exit: "📤 Salida",
                  transfer: "🔀 Transferencia",
                  adjustment: "⚖️ Ajuste",
                } as Record<Mode, string>
              )[item]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickingOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-900 hover:bg-purple-100 transition"
          >
            🚶 Ola de Picking (S-Shape)
          </button>
          <button
            type="button"
            onClick={() => showProductLabel(form.productId)}
            disabled={!form.productId}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            🏷️ Etiqueta Producto
          </button>
          <button
            type="button"
            onClick={() => showLocationLabel(form.locationId)}
            disabled={!form.locationId}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            📍 Etiqueta Posición
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

      {/* Main Movement Form */}
      <form onSubmit={submit} className="space-y-4 rounded-xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="grid gap-3 md:grid-cols-2">
          {/* Product field + Scanner */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium">Producto</label>
              <button
                type="button"
                onClick={() => setScannerTarget("product")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                📷 Escanear SKU/QR
              </button>
            </div>
            <select
              required
              className="w-full rounded-lg border p-3 text-sm"
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
              >
                📷 Escanear Ubicación
              </button>
            </div>
            <select
              required
              className="w-full rounded-lg border p-3 text-sm"
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.status}
                </option>
              ))}
            </select>
          </div>

          {mode === "transfer" && (
            <label className="text-sm font-medium">
              Destino
              <select
                required
                className="mt-1 w-full rounded-lg border p-3 text-sm"
                value={form.destinationLocationId}
                onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })}
              >
                {locations
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
            <label className="text-sm font-medium">
              Delta (+/-)
              <input
                required
                type="number"
                className="mt-1 w-full rounded-lg border p-3 text-sm"
                value={form.delta}
                onChange={(e) => setForm({ ...form, delta: Number(e.target.value) })}
              />
            </label>
          ) : (
            <label className="text-sm font-medium">
              Cantidad
              <input
                required
                min="1"
                type="number"
                className="mt-1 w-full rounded-lg border p-3 text-sm"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
            </label>
          )}

          <label className="text-sm font-medium">
            Referencia
            <input
              className="mt-1 w-full rounded-lg border p-3 text-sm"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="Ej. Guía de Despacho #4092"
            />
          </label>

          <label className="text-sm font-medium md:col-span-2">
            Motivo
            <input
              className="mt-1 w-full rounded-lg border p-3 text-sm"
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

        {canOperate ? (
          <button className="rounded-lg bg-brand px-5 py-3 font-semibold text-white shadow hover:opacity-95 transition">
            Confirmar{" "}
            {(
              {
                entry: "entrada",
                exit: "salida",
                transfer: "transferencia",
                adjustment: "ajuste",
              } as Record<Mode, string>
            )[mode]}
          </button>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Tu rol es de solo lectura.
          </p>
        )}
      </form>

      {/* Movements Table */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
        <h3 className="font-bold text-gray-800 mb-3 text-sm">Historial Reciente de Movimientos</h3>
        <Table
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

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-gray-500">
            {headers.map((header) => (
              <th key={header} className="px-3 py-3">
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
              <tr key={index} className="border-b last:border-0 hover:bg-slate-50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-3 font-medium">
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
