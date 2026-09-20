"use client";
import { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { apiFetch, Location, Product, InventoryItem } from "../../lib/api";

// Simple Component Error Boundary to prevent any Next.js page crash
class ModalErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || "Error inesperado en el componente" };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("MappingModal ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-red-200 text-center space-y-4">
            <span className="text-4xl">⚠️</span>
            <h3 className="font-bold text-base text-slate-800">Aviso en Mapeo de Almacén</h3>
            <p className="text-xs text-slate-500">
              Ocurrió un detalle al procesar las posiciones: {this.state.error}
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => this.setState({ hasError: false, error: "" })}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Reintentar
              </button>
              <button
                onClick={this.props.onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface AuditItem {
  locationId: string;
  locationCode: string;
  systemProductId?: string;
  systemProductName: string;
  systemProductSku: string;
  systemProductUnit: string;
  systemQuantity: number;

  status: "PENDING" | "MATCHED" | "DISCREPANCY";

  physicalQuantity: number;
  physicalProductId?: string;
  physicalProductName?: string;
  physicalProductSku?: string;
  physicalProductUnit: string;

  reassignedLocationId?: string;
  reassignedLocationCode?: string;

  reason: string;
  notes: string;
  isCustomAdded?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  locations?: Location[];
  initialLocationCode?: string | null;
  onSuccess: () => void;
}

const COMMON_REASONS = [
  "Diferencia de conteo físico",
  "Producto mal ubicado en rack",
  "Merma o rotura no informada",
  "Sobrante de recepción",
  "Reubicación de pasillo",
  "Conteo cíclico programado",
];

function MappingModalInner({
  isOpen,
  onClose,
  token,
  locations = [],
  initialLocationCode,
  onSuccess,
}: Props) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "WITH_STOCK" | "PENDING" | "DISCREPANCY" | "MATCHED">("ALL");
  const [editingCode, setEditingCode] = useState<string | null>(null);

  // Modal Step: AUDIT -> PRE_REPORT -> REPORT
  const [step, setStep] = useState<"AUDIT" | "PRE_REPORT" | "REPORT">("AUDIT");
  const [submitting, setSubmitting] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  // State for the item currently being edited
  const [editForm, setEditForm] = useState<{
    physicalQuantity: number;
    differentProduct: boolean;
    physicalProductId: string;
    reassignLocation: boolean;
    reassignedLocationId: string;
    reason: string;
    notes: string;
  }>({
    physicalQuantity: 0,
    differentProduct: false,
    physicalProductId: "",
    reassignLocation: false,
    reassignedLocationId: "",
    reason: COMMON_REASONS[0],
    notes: "",
  });

  // State for manually adding empty location to audit
  const [showAddEmpty, setShowAddEmpty] = useState(false);
  const [addEmptyLocationId, setAddEmptyLocationId] = useState("");
  const [addEmptyProductId, setAddEmptyProductId] = useState("");
  const [addEmptyQuantity, setAddEmptyQuantity] = useState(1);

  // Initialize data on open
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setStep("AUDIT");
    setEditingCode(null);
    setShowAddEmpty(false);
    if (initialLocationCode) {
      setSearch(initialLocationCode);
    } else {
      setSearch("");
    }

    Promise.all([
      apiFetch<{ items?: InventoryItem[] }>("/inventory?pageSize=500", token).catch(() => ({ items: [] })),
      apiFetch<{ items?: Product[] }>("/products?pageSize=200", token).catch(() => ({ items: [] })),
    ])
      .then(([invRes, prodRes]) => {
        const prodList = (prodRes && Array.isArray(prodRes.items) ? prodRes.items : []) as Product[];
        setProducts(prodList);

        // Map existing inventory by location code and ID
        const invMap = new Map<string, InventoryItem>();
        const invList = (invRes && Array.isArray(invRes.items) ? invRes.items : []) as InventoryItem[];
        for (const item of invList) {
          if (!item) continue;
          if (typeof item.location === "object" && item.location) {
            if (item.location.code) invMap.set(item.location.code, item);
            if (item.location.id) invMap.set(item.location.id, item);
          } else if (typeof item.location === "string") {
            invMap.set(item.location, item);
          }
        }

        // Build audit list based on all known warehouse locations
        const safeLocations = Array.isArray(locations) && locations.length > 0 ? locations : [];
        const auditList: AuditItem[] = safeLocations.map((loc) => {
          const inv = invMap.get(loc.code) || invMap.get(loc.id);
          const hasInv = Boolean(inv && (inv.quantity || 0) > 0);
          const prod = inv && typeof inv.product === "object" ? inv.product : undefined;

          return {
            locationId: loc.id || loc.code,
            locationCode: loc.code || "POS-DESCONOCIDA",
            systemProductId: hasInv ? prod?.id : undefined,
            systemProductName: hasInv ? prod?.name || "Producto Asignado" : "Posición Disponible (Vacía)",
            systemProductSku: hasInv ? prod?.sku || "SKU" : "VACÍO",
            systemProductUnit: prod?.unit || "u",
            systemQuantity: hasInv ? inv?.quantity || 0 : 0,
            status: "PENDING",
            physicalQuantity: hasInv ? inv?.quantity || 0 : 0,
            physicalProductId: hasInv ? prod?.id : undefined,
            physicalProductName: hasInv ? prod?.name : undefined,
            physicalProductSku: hasInv ? prod?.sku : undefined,
            physicalProductUnit: prod?.unit || "u",
            reason: COMMON_REASONS[0],
            notes: "",
          };
        });

        setItems(auditList);
      })
      .catch((err) => console.warn("Error cargando inventario de mapeo:", err))
      .finally(() => setLoading(false));
  }, [isOpen, token, initialLocationCode, locations]);

  // Stats calculation
  const stats = useMemo(() => {
    if (!Array.isArray(items)) {
      return { total: 0, withStock: 0, matched: 0, discrepancies: 0, pending: 0, audited: 0, ira: 100 };
    }
    const total = items.length;
    const withStock = items.filter((i) => i.systemQuantity > 0).length;
    const matched = items.filter((i) => i.status === "MATCHED").length;
    const discrepancies = items.filter((i) => i.status === "DISCREPANCY").length;
    const pending = items.filter((i) => i.status === "PENDING").length;
    const audited = matched + discrepancies;
    const ira = audited > 0 ? Math.round((matched / audited) * 100) : 100;

    return { total, withStock, matched, discrepancies, pending, audited, ira };
  }, [items]);

  // Filtered items for display
  const filteredItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      if (!item) return false;
      // Filter tab
      if (filterTab === "WITH_STOCK" && item.systemQuantity === 0) return false;
      if (filterTab === "PENDING" && item.status !== "PENDING") return false;
      if (filterTab === "DISCREPANCY" && item.status !== "DISCREPANCY") return false;
      if (filterTab === "MATCHED" && item.status !== "MATCHED") return false;

      // Text search
      if (!search || !search.trim()) return true;
      const q = search.toLowerCase().trim();
      const loc = (item.locationCode || "").toLowerCase();
      const sSku = (item.systemProductSku || "").toLowerCase();
      const sName = (item.systemProductName || "").toLowerCase();
      const pSku = (item.physicalProductSku || "").toLowerCase();
      const pName = (item.physicalProductName || "").toLowerCase();

      return loc.includes(q) || sSku.includes(q) || sName.includes(q) || pSku.includes(q) || pName.includes(q);
    });
  }, [items, filterTab, search]);

  // Quick Action: Mark as Matched (Physical matches system)
  const handleMarkMatched = (locationCode: string) => {
    setItems((curr) =>
      curr.map((item) =>
        item.locationCode === locationCode
          ? {
              ...item,
              status: "MATCHED",
              physicalQuantity: item.systemQuantity,
              physicalProductId: item.systemProductId,
              physicalProductName: item.systemProductName,
              physicalProductSku: item.systemProductSku,
              physicalProductUnit: item.systemProductUnit,
              reassignedLocationId: undefined,
              reassignedLocationCode: undefined,
            }
          : item
      )
    );
    if (editingCode === locationCode) setEditingCode(null);
  };

  // Open Edit Form for an item
  const handleOpenEdit = (item: AuditItem) => {
    const safeProducts = Array.isArray(products) ? products : [];
    const safeLocations = Array.isArray(locations) ? locations : [];

    setEditingCode(item.locationCode);
    setEditForm({
      physicalQuantity: item.physicalQuantity,
      differentProduct: Boolean(item.physicalProductId && item.physicalProductId !== item.systemProductId),
      physicalProductId: item.physicalProductId || (safeProducts[0]?.id ?? ""),
      reassignLocation: Boolean(item.reassignedLocationId),
      reassignedLocationId: item.reassignedLocationId || (safeLocations[0]?.id ?? ""),
      reason: item.reason || COMMON_REASONS[0],
      notes: item.notes || "",
    });
  };

  // Save Edit Form
  const handleSaveEdit = (locationCode: string) => {
    const safeProducts = Array.isArray(products) ? products : [];
    const safeLocations = Array.isArray(locations) ? locations : [];
    const selectedProd = safeProducts.find((p) => p.id === editForm.physicalProductId);
    const selectedLoc = safeLocations.find((l) => l.id === editForm.reassignedLocationId);

    setItems((curr) =>
      curr.map((item) => {
        if (item.locationCode !== locationCode) return item;

        const isDiscrepancy =
          editForm.physicalQuantity !== item.systemQuantity ||
          (editForm.differentProduct && editForm.physicalProductId !== item.systemProductId) ||
          editForm.reassignLocation;

        return {
          ...item,
          status: isDiscrepancy ? "DISCREPANCY" : "MATCHED",
          physicalQuantity: Number(editForm.physicalQuantity),
          physicalProductId: editForm.differentProduct ? editForm.physicalProductId : item.systemProductId,
          physicalProductName: editForm.differentProduct ? selectedProd?.name || "Nuevo Producto" : item.systemProductName,
          physicalProductSku: editForm.differentProduct ? selectedProd?.sku || "SKU" : item.systemProductSku,
          physicalProductUnit: editForm.differentProduct ? selectedProd?.unit || "u" : item.systemProductUnit,
          reassignedLocationId: editForm.reassignLocation ? editForm.reassignedLocationId : undefined,
          reassignedLocationCode: editForm.reassignLocation ? selectedLoc?.code : undefined,
          reason: editForm.reason,
          notes: editForm.notes,
        };
      })
    );

    setEditingCode(null);
  };

  // Add empty location to audit
  const handleAddEmptyLocation = () => {
    if (!addEmptyLocationId) {
      alert("Selecciona la ubicación en rack.");
      return;
    }
    if (!addEmptyProductId) {
      alert("Selecciona el producto encontrado físicamente.");
      return;
    }

    const safeLocations = Array.isArray(locations) ? locations : [];
    const safeProducts = Array.isArray(products) ? products : [];
    const loc = safeLocations.find((l) => l.id === addEmptyLocationId);
    const prod = safeProducts.find((p) => p.id === addEmptyProductId);
    if (!loc || !prod) return;

    // Check if already in items
    const existingIndex = items.findIndex((i) => i.locationCode === loc.code || i.locationId === loc.id);
    if (existingIndex >= 0) {
      // Update existing item
      setItems((curr) =>
        curr.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                status: "DISCREPANCY",
                physicalQuantity: addEmptyQuantity,
                physicalProductId: prod.id,
                physicalProductName: prod.name,
                physicalProductSku: prod.sku,
                physicalProductUnit: prod.unit || "u",
                reason: "Producto encontrado físicamente en ubicación no registrada",
                notes: "Actualización directa por mapeo",
              }
            : item
        )
      );
      setEditingCode(loc.code);
      setShowAddEmpty(false);
      return;
    }

    const newItem: AuditItem = {
      locationId: loc.id || loc.code,
      locationCode: loc.code || "N/A",
      systemProductId: undefined,
      systemProductName: "Posición Vacía en Sistema",
      systemProductSku: "VACÍO",
      systemProductUnit: prod.unit || "u",
      systemQuantity: 0,
      status: "DISCREPANCY",
      physicalQuantity: addEmptyQuantity,
      physicalProductId: prod.id,
      physicalProductName: prod.name,
      physicalProductSku: prod.sku,
      physicalProductUnit: prod.unit || "u",
      reason: "Producto encontrado físicamente en ubicación no registrada",
      notes: "Alta directa por mapeo de almacén",
      isCustomAdded: true,
    };

    setItems((curr) => [newItem, ...curr]);
    setShowAddEmpty(false);
    setAddEmptyLocationId("");
  };

  // Step 2: Confirm and execute all modifications
  const handleConfirmModifications = async () => {
    const discrepancies = items.filter((i) => i.status === "DISCREPANCY");
    setSubmitting(true);

    try {
      const now = new Date();
      const folio = `MAP-${now.getFullYear()}-${now.getTime().toString().slice(-5)}`;
      const executedLogs = [];

      for (const disc of discrepancies) {
        // 1. Reassignment to another location
        if (disc.reassignedLocationId && disc.systemProductId) {
          await apiFetch("/movements/transfer", token, {
            method: "POST",
            body: JSON.stringify({
              productId: disc.systemProductId,
              sourceLocationId: disc.locationId,
              destinationLocationId: disc.reassignedLocationId,
              quantity: disc.physicalQuantity > 0 ? disc.physicalQuantity : disc.systemQuantity,
              reference: folio,
              reason: `Mapeo: Reasignación de ${disc.locationCode} a ${disc.reassignedLocationCode}`,
            }),
          }).catch((err) => console.warn("Transfer err:", err));

          executedLogs.push({
            type: "REASIGNACION",
            location: disc.locationCode,
            detail: `Reasignado a ${disc.reassignedLocationCode} (${disc.physicalQuantity} u)`,
            reason: disc.reason,
          });
        }
        // 2. Quantity adjustment (Shrinkage or Surplus)
        else if (disc.systemProductId && disc.physicalQuantity !== disc.systemQuantity) {
          const delta = disc.physicalQuantity - disc.systemQuantity;
          await apiFetch("/movements/adjustment", token, {
            method: "POST",
            body: JSON.stringify({
              productId: disc.systemProductId,
              locationId: disc.locationId,
              delta: delta,
              reference: folio,
              reason: `Mapeo: ${disc.reason}. ${disc.notes}`,
            }),
          }).catch((err) => console.warn("Adjust err:", err));

          executedLogs.push({
            type: delta > 0 ? "AJUSTE_POSITIVO" : "AJUSTE_NEGATIVO",
            location: disc.locationCode,
            detail: `Stock ajustado: ${disc.systemQuantity} ➔ ${disc.physicalQuantity} (Delta: ${delta > 0 ? `+${delta}` : delta} u)`,
            reason: disc.reason,
          });
        }
        // 3. Product found in empty location or product mismatch
        else if (disc.physicalProductId && (!disc.systemProductId || disc.physicalProductId !== disc.systemProductId)) {
          await apiFetch("/movements/entry", token, {
            method: "POST",
            body: JSON.stringify({
              productId: disc.physicalProductId,
              locationId: disc.locationId,
              quantity: disc.physicalQuantity,
              reference: folio,
              reason: `Mapeo: Regularización de producto en ${disc.locationCode}`,
            }),
          }).catch((err) => console.warn("Entry err:", err));

          executedLogs.push({
            type: "REGULARIZACION_SKU",
            location: disc.locationCode,
            detail: `Asignado nuevo SKU: ${disc.physicalProductSku} (${disc.physicalQuantity} u)`,
            reason: disc.reason,
          });
        }
      }

      // Record in audit log
      await apiFetch("/audit-logs", token, {
        method: "POST",
        body: JSON.stringify({
          action: "WAREHOUSE_MAPPING_AUDIT",
          entity: "WAREHOUSE_2D",
          details: {
            folio,
            totalAudited: stats.audited,
            totalMatched: stats.matched,
            totalDiscrepancies: discrepancies.length,
            ira: stats.ira,
            changes: executedLogs,
          },
        }),
      }).catch(() => {});

      // Build official report
      setGeneratedReport({
        folio,
        timestamp: now.toLocaleString(),
        auditor: "Operador de Bodega / WMS",
        totalAudited: stats.audited,
        matched: stats.matched,
        discrepanciesCount: discrepancies.length,
        ira: stats.ira,
        discrepancies,
        executedLogs,
      });

      setStep("REPORT");
      onSuccess();
    } catch (err) {
      alert(`Error al procesar el mapeo: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const safeLocations = Array.isArray(locations) ? locations : [];
  const safeProducts = Array.isArray(products) ? products : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* ================= HEADER ================= */}
        <div className="flex items-center justify-between border-b px-6 py-4 bg-indigo-50 text-indigo-950">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md text-xl">
              🔍
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900">Mapeo y Auditoría de Almacén</h3>
                <span className="rounded-full bg-indigo-200 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-800">
                  Conteo Cíclico & Conciliación
                </span>
              </div>
              <p className="text-xs text-indigo-700">
                {step === "AUDIT" && "Verifica y compara la posición y cantidad física real contra el sistema"}
                {step === "PRE_REPORT" && "Pre-Reporte de modificaciones y ajustes detectados antes de sincronizar"}
                {step === "REPORT" && "Reporte oficial de auditoría y modificaciones de almacén generado"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-indigo-800 hover:bg-indigo-100 transition"
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* ================= KPI STATS BAR ================= */}
        {step === "AUDIT" && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 border-b border-slate-100 bg-slate-50/80 px-6 py-3 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Posiciones</span>
              <p className="text-base font-black text-slate-800">{stats.total}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-blue-700">Con Stock</span>
              <p className="text-base font-black text-blue-800">{stats.withStock}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-emerald-700">✅ Coinciden (OK)</span>
              <p className="text-base font-black text-emerald-800">{stats.matched}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-amber-700">⚠️ Discrepancias</span>
              <p className="text-base font-black text-amber-800">{stats.discrepancies}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400">⏳ Pendientes</span>
              <p className="text-base font-black text-slate-600">{stats.pending}</p>
            </div>
            <div className="col-span-2 sm:col-span-1 rounded-xl border border-indigo-200 bg-indigo-50/80 p-2 text-center">
              <span className="text-[10px] uppercase font-bold text-indigo-700">Exactitud IRA</span>
              <p className="text-base font-black text-indigo-900">{stats.ira}%</p>
            </div>
          </div>
        )}

        {/* ================= STEP 1: AUDIT & COMPARISON ================= */}
        {step === "AUDIT" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Search & Filter Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <input
                  type="text"
                  placeholder="Buscar por posición (ej: A-C-01-05), SKU o producto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 py-2 text-xs font-medium focus:bg-white focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-2 text-xs font-bold text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Status Tabs */}
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs overflow-x-auto max-w-full">
                <button
                  onClick={() => setFilterTab("ALL")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${
                    filterTab === "ALL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Todas ({stats.total})
                </button>
                <button
                  onClick={() => setFilterTab("WITH_STOCK")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${
                    filterTab === "WITH_STOCK" ? "bg-white text-blue-900 shadow-sm" : "text-blue-700 hover:text-blue-900"
                  }`}
                >
                  Con Stock ({stats.withStock})
                </button>
                <button
                  onClick={() => setFilterTab("PENDING")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${
                    filterTab === "PENDING"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Pendientes ({stats.pending})
                </button>
                <button
                  onClick={() => setFilterTab("DISCREPANCY")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${
                    filterTab === "DISCREPANCY"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-amber-700 hover:text-amber-900"
                  }`}
                >
                  Discrepancias ({stats.discrepancies})
                </button>
                <button
                  onClick={() => setFilterTab("MATCHED")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${
                    filterTab === "MATCHED"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-700 hover:text-emerald-900"
                  }`}
                >
                  OK ({stats.matched})
                </button>
              </div>

              {/* Add unassigned location button */}
              <button
                onClick={() => setShowAddEmpty(!showAddEmpty)}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
              >
                {showAddEmpty ? "✕ Cancelar Registro" : "➕ Auditar Posición"}
              </button>
            </div>

            {/* Sub-panel: Add Stock to Empty Rack Position */}
            {showAddEmpty && (
              <div className="rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-4 space-y-3 animate-fadeIn">
                <div className="flex items-center gap-2">
                  <span className="text-base">📦</span>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                    Registrar Hallazgo Físico en Rack
                  </h4>
                </div>
                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700">Ubicación en rack:</label>
                    <select
                      value={addEmptyLocationId}
                      onChange={(e) => setAddEmptyLocationId(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 font-mono font-medium focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="">-- Selecciona Posición --</option>
                      {safeLocations.map((l) => (
                        <option key={l.id || l.code} value={l.id || l.code}>
                          {l.code} ({l.rack?.name ?? "Rack"} - N{l.level})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700">Producto Físico Encontrado:</label>
                    <select
                      value={addEmptyProductId}
                      onChange={(e) => setAddEmptyProductId(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 font-medium focus:border-indigo-600 focus:outline-none"
                    >
                      <option value="">-- Selecciona Producto --</option>
                      {safeProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.sku}] {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700">Cantidad Encontrada:</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={addEmptyQuantity}
                        onChange={(e) => setAddEmptyQuantity(Math.max(1, Number(e.target.value)))}
                        className="w-full rounded-xl border border-slate-300 bg-white p-2 font-bold focus:border-indigo-600 focus:outline-none"
                      />
                      <button
                        onClick={handleAddEmptyLocation}
                        className="whitespace-nowrap rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 transition"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Audit List of Positions */}
            {loading ? (
              <p className="py-12 text-center text-xs text-slate-400">Cargando posiciones del almacén...</p>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-sm font-bold text-slate-600">No se encontraron posiciones con ese criterio.</p>
                <p className="text-xs text-slate-400 mt-1">Prueba cambiando los filtros o el término de búsqueda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => {
                  const isEditing = editingCode === item.locationCode;

                  return (
                    <div
                      key={item.locationCode}
                      className={`rounded-2xl border-2 transition-all p-4 ${
                        item.status === "MATCHED"
                          ? "border-emerald-200 bg-emerald-50/20"
                          : item.status === "DISCREPANCY"
                          ? "border-amber-300 bg-amber-50/30"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      {/* Row Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="rounded-xl bg-slate-900 px-3 py-1 font-mono text-xs font-black text-white shadow-sm">
                            {item.locationCode}
                          </span>
                          <div>
                            <span className="text-xs font-bold text-slate-800">
                              {item.systemProductName}
                            </span>
                            {item.systemProductSku && (
                              <span className="ml-2 font-mono text-[11px] text-slate-400">
                                SKU: {item.systemProductSku}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2">
                          {item.status === "MATCHED" && (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-black text-emerald-800">
                              ✅ Coincide Físicamente (OK)
                            </span>
                          )}
                          {item.status === "DISCREPANCY" && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-black text-amber-800">
                              ⚠️ Modificación Registrada
                            </span>
                          )}
                          {item.status === "PENDING" && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">
                              ⏳ Pendiente
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content / System vs Physical display */}
                      {!isEditing && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-xs">
                          {/* Left: Comparison figures */}
                          <div className="flex items-center gap-6">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400">Sistema:</span>
                              <p className="font-bold text-slate-700">
                                {item.systemQuantity} {item.systemProductUnit}
                              </p>
                            </div>

                            {item.status === "DISCREPANCY" ? (
                              <>
                                <span className="text-amber-500 font-black">➔</span>
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-amber-700">
                                    Físico Encontrado:
                                  </span>
                                  <p className="font-black text-amber-900">
                                    {item.physicalQuantity} {item.physicalProductUnit}
                                    <span className="ml-1 text-[11px] font-bold">
                                      ({item.physicalQuantity - item.systemQuantity > 0
                                        ? `+${item.physicalQuantity - item.systemQuantity}`
                                        : item.physicalQuantity - item.systemQuantity}{" "}
                                      u)
                                    </span>
                                  </p>
                                </div>
                                {item.reassignedLocationCode && (
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-indigo-600">
                                      Nueva Asignación:
                                    </span>
                                    <p className="font-mono font-bold text-indigo-900">
                                      {item.reassignedLocationCode}
                                    </p>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400">Físico:</span>
                                <p className="font-bold text-slate-700">
                                  {item.status === "MATCHED"
                                    ? `${item.physicalQuantity} ${item.systemProductUnit} (Verificado)`
                                    : "Sin auditar"}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Right: Action Buttons */}
                          <div className="flex items-center gap-2">
                            {item.status === "PENDING" && (
                              <button
                                onClick={() => handleMarkMatched(item.locationCode)}
                                className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition hover:scale-105 active:scale-95"
                              >
                                ✅ Coincide Físicamente
                              </button>
                            )}

                            <button
                              onClick={() => handleOpenEdit(item)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                                item.status === "DISCREPANCY"
                                  ? "border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200"
                                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {item.status === "DISCREPANCY"
                                ? "✏️ Editar Discrepancia"
                                : item.status === "MATCHED"
                                ? "Reabrir / Modificar"
                                : "✏️ Reportar Discrepancia"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inline Discrepancy Editor Form */}
                      {isEditing && (
                        <div className="mt-4 rounded-2xl border-2 border-indigo-200 bg-white p-4 space-y-4 shadow-sm animate-fadeIn text-xs">
                          <div className="flex items-center justify-between border-b pb-2">
                            <span className="font-black text-indigo-950 uppercase tracking-wide">
                              Modificación y Corrección de Mapeo: {item.locationCode}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Sistema indica: <strong>{item.systemQuantity} u</strong> de{" "}
                              <strong>{item.systemProductSku}</strong>
                            </span>
                          </div>

                          {/* Form Grid */}
                          <div className="grid sm:grid-cols-2 gap-4">
                            {/* 1. Cantidad Física Real */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                              <label className="block font-bold text-slate-800">
                                1. Cantidad Física Real Encontrada:
                              </label>
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={editForm.physicalQuantity}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      physicalQuantity: Math.max(0, Number(e.target.value)),
                                    })
                                  }
                                  className="w-28 rounded-xl border border-slate-300 bg-white p-2 font-bold text-sm focus:border-indigo-600 focus:outline-none"
                                />
                                <span className="text-xs font-bold text-slate-500">
                                  {item.systemProductUnit}
                                </span>
                                {editForm.physicalQuantity !== item.systemQuantity && (
                                  <span
                                    className={`rounded-lg px-2 py-1 font-bold text-[11px] ${
                                      editForm.physicalQuantity - item.systemQuantity > 0
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-red-100 text-red-800"
                                    }`}
                                  >
                                    Diferencia:{" "}
                                    {editForm.physicalQuantity - item.systemQuantity > 0
                                      ? `+${editForm.physicalQuantity - item.systemQuantity}`
                                      : editForm.physicalQuantity - item.systemQuantity}{" "}
                                    u
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 2. Causa / Motivo */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                              <label className="block font-bold text-slate-800">
                                2. Motivo de la Discrepancia:
                              </label>
                              <select
                                value={editForm.reason}
                                onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 font-medium focus:border-indigo-600 focus:outline-none"
                              >
                                {COMMON_REASONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* 3. Cambio de Producto (Producto Físico Diferente) */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                              <div className="flex items-center justify-between mb-1">
                                <label className="font-bold text-slate-800">
                                  3. ¿El producto físico es diferente al del sistema?
                                </label>
                                <input
                                  type="checkbox"
                                  checked={editForm.differentProduct}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, differentProduct: e.target.checked })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </div>
                              {editForm.differentProduct && (
                                <select
                                  value={editForm.physicalProductId}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, physicalProductId: e.target.value })
                                  }
                                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 font-medium focus:border-indigo-600 focus:outline-none"
                                >
                                  {safeProducts.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      [{p.sku}] {p.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            {/* 4. Reasignar a otra Posición */}
                            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                              <div className="flex items-center justify-between mb-1">
                                <label className="font-bold text-slate-800">
                                  4. ¿Está ubicado físicamente en otra posición?
                                </label>
                                <input
                                  type="checkbox"
                                  checked={editForm.reassignLocation}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, reassignLocation: e.target.checked })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </div>
                              {editForm.reassignLocation && (
                                <select
                                  value={editForm.reassignedLocationId}
                                  onChange={(e) =>
                                    setEditForm({ ...editForm, reassignedLocationId: e.target.value })
                                  }
                                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 font-mono font-medium focus:border-indigo-600 focus:outline-none"
                                >
                                  {safeLocations.map((l) => (
                                    <option key={l.id || l.code} value={l.id || l.code}>
                                      {l.code} ({l.rack?.name ?? "Rack"} - N{l.level})
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>

                          {/* Notes */}
                          <div>
                            <input
                              type="text"
                              placeholder="Observación o nota adicional del auditor (opcional)..."
                              value={editForm.notes}
                              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs focus:bg-white focus:border-indigo-600 focus:outline-none"
                            />
                          </div>

                          {/* Form Footer */}
                          <div className="flex justify-end gap-2 pt-1 border-t">
                            <button
                              onClick={() => setEditingCode(null)}
                              className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600 hover:bg-slate-100"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleSaveEdit(item.locationCode)}
                              className="rounded-xl bg-indigo-600 px-5 py-2 font-bold text-white hover:bg-indigo-700 shadow-sm"
                            >
                              Guardar Modificación
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 2: PRE-REPORT ================= */}
        {step === "PRE_REPORT" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <span>⚠️</span>
                <h4>Pre-Reporte de Conciliación de Mapeo</h4>
              </div>
              <p className="mt-1 text-amber-700 text-xs">
                Se detectaron{" "}
                <strong>{items.filter((i) => i.status === "DISCREPANCY").length} discrepancias</strong> en la
                auditoría física. Revisa el resumen a continuación antes de sincronizar los cambios con la base
                de datos.
              </p>
            </div>

            {items.filter((i) => i.status === "DISCREPANCY").length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                <span className="text-3xl">🎉</span>
                <h4 className="mt-2 text-base font-black text-emerald-900">
                  ¡100% Coincidencia Física!
                </h4>
                <p className="mt-1 text-xs text-emerald-700">
                  Todas las posiciones revisadas coinciden exactamente con los registros del sistema. Se registrará
                  la auditoría con una exactitud de inventario (IRA) del 100%.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-600">
                    <tr>
                      <th className="p-3">Posición</th>
                      <th className="p-3">Producto Físico</th>
                      <th className="p-3 text-center">Cant. Sistema</th>
                      <th className="p-3 text-center">Cant. Real</th>
                      <th className="p-3 text-center">Diferencia</th>
                      <th className="p-3">Reasignación / Destino</th>
                      <th className="p-3">Causa / Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {items
                      .filter((i) => i.status === "DISCREPANCY")
                      .map((disc) => {
                        const delta = disc.physicalQuantity - disc.systemQuantity;

                        return (
                          <tr key={disc.locationCode} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-bold text-slate-900">{disc.locationCode}</td>
                            <td className="p-3">
                              <span className="font-bold text-slate-800">{disc.physicalProductName}</span>
                              <span className="ml-1 text-[10px] text-slate-400">[{disc.physicalProductSku}]</span>
                            </td>
                            <td className="p-3 text-center">{disc.systemQuantity} u</td>
                            <td className="p-3 text-center font-bold text-slate-900">
                              {disc.physicalQuantity} u
                            </td>
                            <td className="p-3 text-center font-black">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[11px] ${
                                  delta > 0
                                    ? "bg-emerald-100 text-emerald-800"
                                    : delta < 0
                                    ? "bg-red-100 text-red-800"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {delta > 0 ? `+${delta}` : delta} u
                              </span>
                            </td>
                            <td className="p-3 font-mono">
                              {disc.reassignedLocationCode ? (
                                <span className="font-bold text-indigo-700">
                                  ➔ {disc.reassignedLocationCode}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-3 text-slate-600">{disc.reason}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= STEP 3: OFFICIAL REPORT (SUCCESS) ================= */}
        {step === "REPORT" && generatedReport && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {/* Printable Area */}
            <div id="mapping-report-print" className="rounded-3xl border-2 border-slate-800 bg-white p-6 space-y-5 shadow-lg">
              {/* Report Header */}
              <div className="flex flex-wrap items-center justify-between border-b-2 border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📋</span>
                    <h2 className="text-base font-black uppercase tracking-wider text-slate-900">
                      WMS · Reporte Oficial de Auditoría y Mapeo de Almacén
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Comprobante de Verificación y Conciliación Física de Ubicaciones
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl">
                    FOLIO: {generatedReport.folio}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1">{generatedReport.timestamp}</p>
                </div>
              </div>

              {/* Auditor & Metrics Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Auditadas</span>
                  <p className="text-lg font-black text-slate-800">{generatedReport.totalAudited}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-600">Coincidentes (OK)</span>
                  <p className="text-lg font-black text-emerald-700">{generatedReport.matched}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-600">Modificaciones</span>
                  <p className="text-lg font-black text-amber-700">{generatedReport.discrepanciesCount}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-indigo-600">Exactitud IRA</span>
                  <p className="text-lg font-black text-indigo-700">{generatedReport.ira}%</p>
                </div>
              </div>

              {/* Audit Details Table */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2 uppercase text-[11px]">
                  Detalle de Modificaciones Aplicadas al Sistema:
                </h4>
                {(generatedReport?.discrepancies || []).length === 0 ? (
                  <p className="text-slate-500 italic">No hubo discrepancias; inventario 100% conciliado.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-600">
                        <tr>
                          <th className="p-2.5">Posición</th>
                          <th className="p-2.5">Producto</th>
                          <th className="p-2.5 text-center">Cant. Sistema</th>
                          <th className="p-2.5 text-center">Cant. Física</th>
                          <th className="p-2.5 text-center">Ajuste</th>
                          <th className="p-2.5">Reasignación</th>
                          <th className="p-2.5">Motivo / Causa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {(generatedReport?.discrepancies || []).map((d: AuditItem) => {
                          const delta = d.physicalQuantity - d.systemQuantity;
                          return (
                            <tr key={d.locationCode} className="hover:bg-slate-50">
                              <td className="p-2.5 font-mono font-bold text-slate-900">{d.locationCode}</td>
                              <td className="p-2.5">
                                {d.physicalProductName}{" "}
                                <span className="font-mono text-slate-400">[{d.physicalProductSku}]</span>
                              </td>
                              <td className="p-2.5 text-center">{d.systemQuantity} u</td>
                              <td className="p-2.5 text-center font-bold">{d.physicalQuantity} u</td>
                              <td className="p-2.5 text-center font-bold">
                                {delta > 0 ? `+${delta}` : delta} u
                              </td>
                              <td className="p-2.5 font-mono">
                                {d.reassignedLocationCode ? `➔ ${d.reassignedLocationCode}` : "—"}
                              </td>
                              <td className="p-2.5 text-slate-600">{d.reason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Signatures Block */}
              <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
                <div className="border-t border-slate-300 pt-2">
                  <p className="font-bold text-slate-700">{generatedReport.auditor}</p>
                  <p className="text-[10px]">Auditor de Inventario / Operador</p>
                </div>
                <div className="border-t border-slate-300 pt-2">
                  <p className="font-bold text-slate-700">Jefe de Bodega / Logística</p>
                  <p className="text-[10px]">Aprobación y Cierre de Mapeo</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= FOOTER BUTTONS ================= */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          {step === "AUDIT" && (
            <>
              <button
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cerrar sin guardar
              </button>

              <button
                onClick={() => setStep("PRE_REPORT")}
                disabled={stats.audited === 0}
                className={`rounded-xl px-5 py-2.5 font-bold shadow-md transition ${
                  stats.audited > 0
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                Cerrar Mapeo y Revisar Pre-Reporte ({stats.discrepancies} modificaciones) ➔
              </button>
            </>
          )}

          {step === "PRE_REPORT" && (
            <>
              <button
                onClick={() => setStep("AUDIT")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                ← Volver a Auditar
              </button>

              <button
                onClick={handleConfirmModifications}
                disabled={submitting}
                className="rounded-xl bg-indigo-600 px-6 py-2.5 font-bold text-white shadow-lg hover:bg-indigo-700 transition hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                {submitting ? "Aplicando modificaciones..." : "🚀 Confirmar y Aplicar Modificaciones"}
              </button>
            </>
          )}

          {step === "REPORT" && (
            <>
              <button
                onClick={() => {
                  if (typeof window !== "undefined") window.print();
                }}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 font-bold text-indigo-700 hover:bg-indigo-100 transition flex items-center gap-1.5 shadow-sm"
              >
                <span>🖨️</span>
                <span>Imprimir / Guardar PDF</span>
              </button>

              <button
                onClick={onClose}
                className="rounded-xl bg-slate-900 px-6 py-2.5 font-bold text-white shadow-md hover:bg-slate-800 transition"
              >
                Finalizar y Volver al Plano 2D
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function MappingModal(props: Props) {
  return (
    <ModalErrorBoundary onClose={props.onClose}>
      <MappingModalInner {...props} />
    </ModalErrorBoundary>
  );
}
