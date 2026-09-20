"use client";
import { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from "react";
import { apiFetch, Location, Product, InventoryItem, getWarehouseSeedLocations } from "../../lib/api";

// Error boundary to protect the UI
class ModalErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void; inline?: boolean },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode; onClose: () => void; inline?: boolean }) {
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
      if (this.props.inline) {
        return (
          <div className="w-full rounded-3xl bg-white p-8 shadow-xl border-2 border-red-300 text-center space-y-4">
            <span className="text-4xl">⚠️</span>
            <h3 className="font-bold text-base text-slate-800">Aviso en Sección de Mapeo de Almacén</h3>
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
                Cerrar Sección
              </button>
            </div>
          </div>
        );
      }
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
  inline?: boolean;
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
  locations,
  initialLocationCode,
  onSuccess,
  inline = false,
}: Props) {
  const [locationsList, setLocationsList] = useState<Location[]>(() => {
    if (Array.isArray(locations) && locations.length > 0) return locations;
    return getWarehouseSeedLocations();
  });
  const [items, setItems] = useState<AuditItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "WITH_STOCK" | "PENDING" | "DISCREPANCY" | "MATCHED">("ALL");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(initialLocationCode || null);

  // View switch: 2D Layout Plan vs Table List
  const [viewMode, setViewMode] = useState<"LAYOUT_2D" | "TABLE">("LAYOUT_2D");
  const [levelFilter, setLevelFilter] = useState<"all" | "1" | "2">("all");
  const [orderAsc, setOrderAsc] = useState(true);
  const [showProductDetails, setShowProductDetails] = useState(false);

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

  // State for manually adding position to audit
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
      setSelectedLocationCode(initialLocationCode);
    } else {
      setSearch("");
      setSelectedLocationCode(null);
    }

    const fetchLocationsPromise = (locations && locations.length > 0)
      ? Promise.resolve({ items: locations })
      : apiFetch<{ items?: Location[] }>("/locations?pageSize=500", token).catch(() => ({ items: [] }));

    Promise.all([
      apiFetch<{ items?: InventoryItem[] }>("/inventory?pageSize=500", token).catch(() => ({ items: [] })),
      apiFetch<{ items?: Product[] }>("/products?pageSize=200", token).catch(() => ({ items: [] })),
      fetchLocationsPromise,
    ])
      .then(([invRes, prodRes, locRes]) => {
        const prodList = (prodRes && Array.isArray(prodRes.items) ? prodRes.items : []) as Product[];
        setProducts(prodList);

        // Merge seed locations (all 148 standard warehouse positions) with live locations from API
        const seedLocs = getWarehouseSeedLocations();
        const liveLocs = (locRes && Array.isArray(locRes.items) ? locRes.items : (Array.isArray(locations) && locations.length > 0 ? locations : [])) as Location[];
        const locMap = new Map<string, Location>();
        for (const loc of seedLocs) {
          locMap.set(loc.code, loc);
        }
        for (const loc of liveLocs) {
          if (loc && loc.code) {
            locMap.set(loc.code, { ...(locMap.get(loc.code) || {}), ...loc });
          }
        }
        const allWarehouseLocs = Array.from(locMap.values());
        setLocationsList(allWarehouseLocs);

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

        // Build audit list based on all warehouse locations
        const auditList: AuditItem[] = allWarehouseLocs.map((loc) => {
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
        if (initialLocationCode) {
          setSelectedLocationCode(initialLocationCode);
        }
      })
      .catch((err) => console.warn("Error cargando inventario de mapeo:", err))
      .finally(() => setLoading(false));
  }, [isOpen, token, initialLocationCode, locations]);

  // Index items by locationCode for instant O(1) 2D square lookups
  const auditMap = useMemo(() => {
    const map = new Map<string, AuditItem>();
    for (const item of items) {
      map.set(item.locationCode, item);
    }
    return map;
  }, [items]);

  // Ordered list of all location codes for navigation
  const allLocationCodes = useMemo(() => {
    return items.map((i) => i.locationCode);
  }, [items]);

  // Wall and Central positions (order ascending or descending)
  const wallPositions = useMemo(() => {
    const arr = Array.from({ length: 22 }, (_, i) => 22 - i);
    return orderAsc ? arr : [...arr].reverse();
  }, [orderAsc]);

  const centralPositions = useMemo(() => {
    const arr = Array.from({ length: 15 }, (_, i) => 15 - i);
    return orderAsc ? arr : [...arr].reverse();
  }, [orderAsc]);

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

  // Filtered items for display in table view
  const filteredItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      if (!item) return false;
      if (filterTab === "WITH_STOCK" && item.systemQuantity === 0) return false;
      if (filterTab === "PENDING" && item.status !== "PENDING") return false;
      if (filterTab === "DISCREPANCY" && item.status !== "DISCREPANCY") return false;
      if (filterTab === "MATCHED" && item.status !== "MATCHED") return false;

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

  // The active item selected on the 2D layout map
  const activeSelectedItem = useMemo(() => {
    if (!selectedLocationCode) return null;
    const found = auditMap.get(selectedLocationCode) || items.find((i) => i.locationCode === selectedLocationCode);
    if (found) return found;

    // Fallback on-the-fly synthesis if ever clicked a code not currently in map
    return {
      locationId: selectedLocationCode,
      locationCode: selectedLocationCode,
      systemProductName: "Posición Disponible (Vacía)",
      systemProductSku: "VACÍO",
      systemProductUnit: "u",
      systemQuantity: 0,
      status: "PENDING" as const,
      physicalQuantity: 0,
      physicalProductUnit: "u",
      reason: COMMON_REASONS[0],
      notes: "",
    };
  }, [selectedLocationCode, auditMap, items]);

  // Safe collections
  const safeLocations = useMemo(() => {
    if (Array.isArray(locationsList) && locationsList.length > 0) return locationsList;
    return getWarehouseSeedLocations();
  }, [locationsList]);
  const safeProducts = Array.isArray(products) ? products : [];

  // Quick Action: Mark as Matched (Physical matches system)
  const handleMarkMatched = (locationCode: string, autoAdvance = true) => {
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

    // Auto advance to next position in layout
    if (autoAdvance) {
      const idx = allLocationCodes.indexOf(locationCode);
      if (idx >= 0 && idx < allLocationCodes.length - 1) {
        setSelectedLocationCode(allLocationCodes[idx + 1]);
      }
    }
  };

  // Open Edit Form for an item
  const handleOpenEdit = (item: AuditItem) => {
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

    const loc = safeLocations.find((l) => l.id === addEmptyLocationId);
    const prod = safeProducts.find((p) => p.id === addEmptyProductId);
    if (!loc || !prod) return;

    const existingIndex = items.findIndex((i) => i.locationCode === loc.code || i.locationId === loc.id);
    if (existingIndex >= 0) {
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
      setSelectedLocationCode(loc.code);
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
    setSelectedLocationCode(loc.code);
    setShowAddEmpty(false);
    setAddEmptyLocationId("");
  };

  // Navigate to Next / Previous position in physical order
  const handleNavigatePosition = (delta: number) => {
    if (!selectedLocationCode || allLocationCodes.length === 0) return;
    const currentIndex = allLocationCodes.indexOf(selectedLocationCode);
    if (currentIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(allLocationCodes.length - 1, currentIndex + delta));
    setSelectedLocationCode(allLocationCodes[nextIndex]);
    setEditingCode(null);
  };

  // Confirm and execute all modifications
  const handleConfirmModifications = async () => {
    const discrepancies = items.filter((i) => i.status === "DISCREPANCY");
    setSubmitting(true);

    try {
      const now = new Date();
      const folio = `MAP-${now.getFullYear()}-${now.getTime().toString().slice(-5)}`;
      const executedLogs = [];

      for (const disc of discrepancies) {
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
        } else if (disc.systemProductId && disc.physicalQuantity !== disc.systemQuantity) {
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
        } else if (disc.physicalProductId && (!disc.systemProductId || disc.physicalProductId !== disc.systemProductId)) {
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

  // Helper to render an individual interactive 2D position square on the map
  const renderSquare = (aisle: string, rack: string, level: number, position: number) => {
    const code = `${aisle}-${rack}-${String(level).padStart(2, "0")}-${String(position).padStart(2, "0")}`;
    const item = auditMap.get(code);
    const isSelected = selectedLocationCode === code;
    const isMatched = item?.status === "MATCHED";
    const isDiscrepancy = item?.status === "DISCREPANCY";
    const hasStock = (item?.systemQuantity || 0) > 0;

    let bg = "#64748B";
    let border = "#475569";
    let badge = "";

    if (isMatched) {
      bg = "#10B981"; // Emerald green
      border = "#047857";
      badge = "✓";
    } else if (isDiscrepancy) {
      bg = "#F59E0B"; // Amber orange
      border = "#B45309";
      badge = "!";
    } else {
      // Pending
      if (hasStock) {
        bg = "#3B82F6"; // Blue indicates has stock
        border = "#1D4ED8";
      } else {
        bg = "#94A3B8"; // Slate indicates empty
        border = "#64748B";
      }
    }

    if (showProductDetails) {
      return (
        <button
          key={code}
          type="button"
          onClick={() => {
            setSelectedLocationCode(code);
            setEditingCode(null);
          }}
          title={`${code} · ${item?.systemProductName || 'Vacío'} · Cantidad: ${item?.systemQuantity ?? 0} ${item?.systemProductUnit || 'u'} · ${
            isMatched ? "Verificado OK" : isDiscrepancy ? "Discrepancia" : "Pendiente"
          }`}
          style={{ backgroundColor: bg, borderColor: isSelected ? "#312E81" : border }}
          className={`relative flex flex-col justify-between w-28 sm:w-32 h-11 p-1 rounded-lg text-white shadow-xs transition-all duration-150 cursor-pointer focus:outline-none text-left border ${
            isSelected
              ? "z-30 scale-105 ring-4 ring-indigo-600 shadow-xl"
              : "hover:z-20 hover:scale-105 hover:shadow-md hover:ring-2 hover:ring-white"
          }`}
        >
          <div className="flex items-center justify-between w-full text-[10px] font-black leading-none">
            <span className="bg-black/25 px-1 py-0.5 rounded text-[9px] font-mono">
              #{String(position).padStart(2, "0")}
            </span>
            <span className="bg-white/20 px-1 py-0.5 rounded text-[9px] font-black">
              {hasStock ? `${item?.systemQuantity ?? 0} u` : "0 u"}
            </span>
          </div>
          <p className="truncate text-[9px] font-bold text-white/95 leading-tight mt-0.5" title={item?.systemProductName || "Vacío"}>
            {item?.systemProductName || "(Vacío)"}
          </p>
          {badge && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black text-slate-900 shadow">
              {badge}
            </span>
          )}
        </button>
      );
    }

    return (
      <button
        key={code}
        type="button"
        onClick={() => {
          setSelectedLocationCode(code);
          setEditingCode(null);
        }}
        title={`${code} · ${item?.systemProductName || 'Vacío'} · ${
          isMatched ? "Verificado OK" : isDiscrepancy ? "Discrepancia" : "Pendiente"
        }`}
        style={{ backgroundColor: bg, borderColor: isSelected ? "#312E81" : border }}
        className={`relative flex h-8 w-8 items-center justify-center rounded-md text-[11px] font-extrabold text-white shadow-sm transition-all duration-150 cursor-pointer focus:outline-none ${
          isSelected
            ? "z-30 scale-125 ring-4 ring-indigo-600 shadow-xl"
            : "hover:z-20 hover:scale-125 hover:shadow-lg hover:ring-2 hover:ring-white border"
        }`}
      >
        <span>{String(position).padStart(2, "0")}</span>
        {badge && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black text-slate-900 shadow">
            {badge}
          </span>
        )}
      </button>
    );
  };

  // Safe early exit placed AFTER all hooks
  if (!isOpen) return null;

  const containerClass = inline
    ? "w-full rounded-3xl bg-white shadow-2xl border-4 border-indigo-950/20 overflow-hidden flex flex-col animate-fadeIn"
    : "w-full max-w-6xl max-h-[96vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden";

  const renderContent = () => (
    <div className={containerClass}>
      {/* ================= HEADER ================= */}
      <div
        className={`flex items-center justify-between border-b px-6 py-4 ${
          inline
            ? "bg-gradient-to-r from-indigo-950 via-indigo-900 to-indigo-950 text-white"
            : "bg-indigo-50 text-indigo-950"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-2xl shadow-md text-xl ${
              inline ? "bg-white/10 text-white border border-white/20" : "bg-indigo-600 text-white"
            }`}
          >
            🔍
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-black text-base ${inline ? "text-white" : "text-slate-900"}`}>
                Mapeo y Conciliación Física de Almacén
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                  inline ? "bg-amber-400 text-slate-950" : "bg-indigo-200 text-indigo-800"
                }`}
              >
                {inline ? "Sección Oficial" : "Plano 2D Interactivo"}
              </span>
            </div>
            <p className={`text-xs ${inline ? "text-indigo-200 font-medium" : "text-indigo-700"}`}>
              {step === "AUDIT" && "Recorre los pasillos y casilleros en orden físico para verificar inventario en tiempo real"}
              {step === "PRE_REPORT" && "Pre-Reporte de modificaciones y ajustes detectados antes de sincronizar"}
              {step === "REPORT" && "Reporte oficial de auditoría y modificaciones de almacén generado"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className={`rounded-xl px-3 py-1.5 transition text-xs font-bold flex items-center gap-1.5 ${
            inline
              ? "bg-white/10 text-white hover:bg-white/20 border border-white/20"
              : "text-indigo-800 hover:bg-indigo-100 text-base"
          }`}
          title={inline ? "Ir a Vista 2D" : "Cerrar modal"}
        >
          <span>{inline ? "🗺️" : "✕"}</span>
          {inline && <span>Ir a Vista 2D</span>}
        </button>
      </div>

      {/* ================= KPI & PROGRESS BAR ================= */}
      {step === "AUDIT" && (
        <div className="border-b border-slate-100 bg-slate-50/90 px-6 py-2.5 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white p-2 text-center shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Posiciones</span>
                <p className="text-sm font-black text-slate-800">{stats.total}</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-2 text-center shadow-xs">
                <span className="text-[10px] uppercase font-bold text-blue-700">Con Stock</span>
                <p className="text-sm font-black text-blue-800">{stats.withStock}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2 text-center shadow-xs">
                <span className="text-[10px] uppercase font-bold text-emerald-700">✅ Coinciden (OK)</span>
                <p className="text-sm font-black text-emerald-800">{stats.matched}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2 text-center shadow-xs">
                <span className="text-[10px] uppercase font-bold text-amber-700">⚠️ Discrepancias</span>
                <p className="text-sm font-black text-amber-800">{stats.discrepancies}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-2 text-center shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400">⏳ Pendientes</span>
                <p className="text-sm font-black text-slate-600">{stats.pending}</p>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-xl border border-indigo-200 bg-indigo-50/80 p-2 text-center shadow-xs">
                <span className="text-[10px] uppercase font-bold text-indigo-700">Exactitud IRA</span>
                <p className="text-sm font-black text-indigo-900">{stats.ira}%</p>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 1: AUDIT (2D LAYOUT PLAN & DOCKED INSPECTOR) ================= */}
        {step === "AUDIT" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Top Toolbar: View Switch, Levels, Search, Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-white px-6 py-2.5 text-xs">
              {/* View Switcher */}
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 font-bold">
                <button
                  onClick={() => setViewMode("LAYOUT_2D")}
                  className={`px-3 py-1 rounded-lg transition flex items-center gap-1.5 ${
                    viewMode === "LAYOUT_2D" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>🗺️</span>
                  <span>Plano 2D Oficial</span>
                </button>
                <button
                  onClick={() => setViewMode("TABLE")}
                  className={`px-3 py-1 rounded-lg transition flex items-center gap-1.5 ${
                    viewMode === "TABLE" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>📋</span>
                  <span>Vista Lista ({items.length})</span>
                </button>
              </div>

              {/* Levels Filter (When in 2D view) */}
              {viewMode === "LAYOUT_2D" && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Niveles:</span>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <button
                      onClick={() => setLevelFilter("all")}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                        levelFilter === "all" ? "bg-slate-800 text-white" : "text-slate-600"
                      }`}
                    >
                      N1 + N2
                    </button>
                    <button
                      onClick={() => setLevelFilter("1")}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                        levelFilter === "1" ? "bg-slate-800 text-white" : "text-slate-600"
                      }`}
                    >
                      Nivel 1
                    </button>
                    <button
                      onClick={() => setLevelFilter("2")}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded ${
                        levelFilter === "2" ? "bg-slate-800 text-white" : "text-slate-600"
                      }`}
                    >
                      Nivel 2
                    </button>
                  </div>

                  <button
                    onClick={() => setOrderAsc(!orderAsc)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                  >
                    {orderAsc ? "Orden: Entrada (01) → Fondo" : "Orden: Fondo (01) → Entrada"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowProductDetails(!showProductDetails)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition flex items-center gap-1 border shadow-xs ${
                      showProductDetails
                        ? "bg-indigo-600 text-white border-indigo-700 shadow-sm"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                    title="Mostrar u ocultar los nombres de productos y cantidades en las posiciones"
                  >
                    <span>{showProductDetails ? "👁️ Ocultar Detalles" : "👁️ Mostrar Productos y Cantidades"}</span>
                  </button>
                </div>
              )}

              {/* 2D Plan Color Legend */}
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded bg-blue-500" /> Stock Sistema
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded bg-slate-400" /> Vacía Sistema
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded bg-emerald-500" /> Verificado OK
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded bg-amber-500" /> Discrepancia
                </span>
              </div>
            </div>

            {/* Content Area */}
            <div className={`flex flex-col ${inline ? "min-h-[750px]" : "flex-1 overflow-hidden"}`}>
              {/* ================= VIEW 1: OFFICIAL 2D LAYOUT PLAN (FULL WIDTH) ================= */}
              {viewMode === "LAYOUT_2D" && (
                <div className="w-full overflow-y-auto overflow-x-auto p-6 bg-slate-100/70">
                  <div className={`mx-auto space-y-4 ${showProductDetails ? "min-w-[1060px] max-w-[1320px]" : "min-w-[760px] max-w-[960px]"}`}>
                    {/* 2D Grid Header */}
                    <div className="flex items-center justify-between text-xs text-slate-500 border-b pb-2 font-bold">
                      <span>Bodega Principal · Haz clic en cualquier casillero para abrir la auditoría y modificar</span>
                      <span className="text-[11px] text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                        {showProductDetails ? "Mostrando SKUs y stock en casilleros" : "Vista compacta (Activa el botón para ver SKUs)"}
                      </span>
                    </div>

                    {/* 5-Column Grid */}
                    <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-3 items-start">
                      {/* ================= COLUMN 1: RACK PARED PASILLO A (22 POSICIONES) ================= */}
                      <div className="rounded-2xl border-2 border-slate-800 bg-white p-2.5 shadow-md">
                        <div className="mb-2 text-center border-b border-slate-100 pb-1.5">
                          <span className="rounded-full bg-blue-900 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                            Rack Pared
                          </span>
                          <p className="text-[11px] font-black text-slate-800 mt-0.5">Pasillo A (A-P)</p>
                        </div>
                        <div className="mb-1 flex justify-between px-1 text-[9px] font-black text-slate-600">
                          {(levelFilter === "all" || levelFilter === "2") && <span className={showProductDetails ? "w-28 sm:w-32 text-center text-blue-900" : "w-8 text-center text-blue-900"}>N2</span>}
                          <span className="flex-1 text-center text-[8px] text-slate-400">PARED ◀ | ▶ A</span>
                          {(levelFilter === "all" || levelFilter === "1") && <span className={showProductDetails ? "w-28 sm:w-32 text-center text-slate-700" : "w-8 text-center text-slate-700"}>N1</span>}
                        </div>
                        <div className="flex gap-1.5 items-stretch">
                          {(levelFilter === "all" || levelFilter === "2") && (
                            <div className="flex flex-col gap-1">
                              {wallPositions.map((pos) => renderSquare("A", "P", 2, pos))}
                            </div>
                          )}
                          <div className="flex w-5 flex-col items-center justify-center rounded bg-slate-100 py-2 border border-slate-200">
                            <span style={{ writingMode: "vertical-rl" }} className="rotate-180 select-none text-[9px] font-black text-slate-600 uppercase">
                              Nivel 2
                            </span>
                          </div>
                          {(levelFilter === "all" || levelFilter === "1") && (
                            <div className="flex flex-col gap-1">
                              {wallPositions.map((pos) => renderSquare("A", "P", 1, pos))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ================= COLUMN 2: PASILLO A ================= */}
                      <div className="flex h-full min-h-[700px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-amber-50/20 px-2">
                        <div className="flex flex-col items-center gap-6 select-none opacity-70">
                          <span className="text-xl text-slate-400 font-black">▲</span>
                          <div style={{ writingMode: "vertical-rl" }} className="rotate-180 text-2xl font-black tracking-widest text-slate-500 uppercase">
                            P a s i l l o &nbsp; A
                          </div>
                          <span className="text-xl text-slate-400 font-black">▼</span>
                        </div>
                      </div>

                      {/* ================= COLUMN 3: RACK CENTRAL ISLA (15 POSICIONES) ================= */}
                      <div className="flex flex-col items-center">
                        <div className="rounded-2xl border-2 border-slate-800 bg-white p-2.5 shadow-md">
                          <div className="mb-2 text-center border-b border-slate-100 pb-1.5">
                            <span className="rounded-full bg-emerald-800 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                              Rack Central Isla
                            </span>
                            <p className="text-[11px] font-black text-slate-800 mt-0.5">Frente A y B (15 Pos)</p>
                          </div>
                          <div className="flex gap-2 items-stretch">
                            {/* Frente Pasillo A */}
                            <div className="flex gap-1.5 items-stretch border-r-2 border-slate-300 pr-2">
                              {(levelFilter === "all" || levelFilter === "1") && (
                                <div className="flex flex-col gap-1">
                                  <div className="text-center text-[9px] font-black text-slate-600">N1</div>
                                  {centralPositions.map((pos) => renderSquare("A", "C", 1, pos))}
                                </div>
                              )}
                              <div className="flex w-5 flex-col items-center justify-center rounded bg-blue-50 py-2 border border-blue-200">
                                <span style={{ writingMode: "vertical-rl" }} className="rotate-180 select-none text-[9px] font-black text-blue-900 uppercase">
                                  N2-A
                                </span>
                              </div>
                              {(levelFilter === "all" || levelFilter === "2") && (
                                <div className="flex flex-col gap-1">
                                  <div className="text-center text-[9px] font-black text-slate-600">N2</div>
                                  {centralPositions.map((pos) => renderSquare("A", "C", 2, pos))}
                                </div>
                              )}
                            </div>

                            {/* Frente Pasillo B */}
                            <div className="flex gap-1.5 items-stretch pl-1">
                              {(levelFilter === "all" || levelFilter === "2") && (
                                <div className="flex flex-col gap-1">
                                  <div className="text-center text-[9px] font-black text-blue-900">N2</div>
                                  {centralPositions.map((pos) => renderSquare("B", "C", 2, pos))}
                                </div>
                              )}
                              <div className="flex w-5 flex-col items-center justify-center rounded bg-indigo-50 py-2 border border-indigo-200">
                                <span style={{ writingMode: "vertical-rl" }} className="rotate-180 select-none text-[9px] font-black text-indigo-900 uppercase">
                                  N2-B
                                </span>
                              </div>
                              {(levelFilter === "all" || levelFilter === "1") && (
                                <div className="flex flex-col gap-1">
                                  <div className="text-center text-[9px] font-black text-slate-700">N1</div>
                                  {centralPositions.map((pos) => renderSquare("B", "C", 1, pos))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-[10px] text-slate-400 font-bold">
                          Zona Libre / Traspaletas
                        </div>
                      </div>

                      {/* ================= COLUMN 4: PASILLO B ================= */}
                      <div className="flex h-full min-h-[700px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-amber-50/20 px-2">
                        <div className="flex flex-col items-center gap-6 select-none opacity-70">
                          <span className="text-xl text-slate-400 font-black">▲</span>
                          <div style={{ writingMode: "vertical-rl" }} className="rotate-180 text-2xl font-black tracking-widest text-slate-500 uppercase">
                            P a s i l l o &nbsp; B
                          </div>
                          <span className="text-xl text-slate-400 font-black">▼</span>
                        </div>
                      </div>

                      {/* ================= COLUMN 5: RACK PARED PASILLO B (22 POSICIONES) ================= */}
                      <div className="rounded-2xl border-2 border-slate-800 bg-white p-2.5 shadow-md">
                        <div className="mb-2 text-center border-b border-slate-100 pb-1.5">
                          <span className="rounded-full bg-indigo-900 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                            Rack Pared
                          </span>
                          <p className="text-[11px] font-black text-slate-800 mt-0.5">Pasillo B (B-P)</p>
                        </div>
                        <div className="mb-1 flex justify-between px-1 text-[9px] font-black text-slate-600">
                          {(levelFilter === "all" || levelFilter === "1") && <span className={showProductDetails ? "w-28 sm:w-32 text-center text-slate-700" : "w-8 text-center text-slate-700"}>N1</span>}
                          <span className="flex-1 text-center text-[8px] text-slate-400">B ◀ | ▶ PARED</span>
                          {(levelFilter === "all" || levelFilter === "2") && <span className={showProductDetails ? "w-28 sm:w-32 text-center text-blue-900" : "w-8 text-center text-blue-900"}>N2</span>}
                        </div>
                        <div className="flex gap-1.5 items-stretch">
                          {(levelFilter === "all" || levelFilter === "1") && (
                            <div className="flex flex-col gap-1">
                              {wallPositions.map((pos) => renderSquare("B", "P", 1, pos))}
                            </div>
                          )}
                          <div className="flex w-5 flex-col items-center justify-center rounded bg-slate-100 py-2 border border-slate-200">
                            <span style={{ writingMode: "vertical-rl" }} className="rotate-180 select-none text-[9px] font-black text-slate-600 uppercase">
                              Nivel 2
                            </span>
                          </div>
                          {(levelFilter === "all" || levelFilter === "2") && (
                            <div className="flex flex-col gap-1">
                              {wallPositions.map((pos) => renderSquare("B", "P", 2, pos))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Entrada / Salida Gate */}
                    <div className="pt-2 flex justify-center">
                      <div className="w-full max-w-sm rounded-xl border-2 border-slate-800 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 p-2 text-center shadow-md">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-900">
                          🚪 Entrada / Salida Principal
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= VIEW 2: TABLE LIST VIEW ================= */}
              {viewMode === "TABLE" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white border-r border-slate-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Buscar por código, SKU o producto..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
                    />
                    <button
                      onClick={() => setShowAddEmpty(!showAddEmpty)}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700"
                    >
                      {showAddEmpty ? "✕ Cancelar" : "➕ Registrar"}
                    </button>
                  </div>

                  {/* Add empty form */}
                  {showAddEmpty && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 text-xs space-y-2">
                      <div className="grid sm:grid-cols-3 gap-2">
                        <select
                          value={addEmptyLocationId}
                          onChange={(e) => setAddEmptyLocationId(e.target.value)}
                          className="rounded-lg border p-1.5 bg-white text-xs font-mono"
                        >
                          <option value="">-- Posición --</option>
                          {safeLocations.map((l) => (
                            <option key={l.id || l.code} value={l.id || l.code}>
                              {l.code}
                            </option>
                          ))}
                        </select>
                        <select
                          value={addEmptyProductId}
                          onChange={(e) => setAddEmptyProductId(e.target.value)}
                          className="rounded-lg border p-1.5 bg-white text-xs"
                        >
                          <option value="">-- Producto --</option>
                          {safeProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.sku}] {p.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={1}
                            value={addEmptyQuantity}
                            onChange={(e) => setAddEmptyQuantity(Math.max(1, Number(e.target.value)))}
                            className="w-16 rounded-lg border p-1.5 bg-white text-xs font-bold"
                          />
                          <button
                            onClick={handleAddEmptyLocation}
                            className="flex-1 rounded-lg bg-indigo-600 font-bold text-white text-xs"
                          >
                            Agregar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* List items */}
                  <div className="space-y-2">
                    {filteredItems.map((item) => (
                      <div
                        key={item.locationCode}
                        onClick={() => setSelectedLocationCode(item.locationCode)}
                        className={`rounded-xl border p-2.5 transition cursor-pointer flex items-center justify-between text-xs ${
                          selectedLocationCode === item.locationCode
                            ? "border-indigo-600 ring-2 ring-indigo-100 bg-indigo-50/30"
                            : item.status === "MATCHED"
                            ? "border-emerald-200 bg-emerald-50/20"
                            : item.status === "DISCREPANCY"
                            ? "border-amber-200 bg-amber-50/20"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded text-[11px]">
                            {item.locationCode}
                          </span>
                          <div>
                            <p className="font-bold text-slate-800">{item.systemProductName}</p>
                            <p className="text-[10px] text-slate-400">SKU: {item.systemProductSku}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-700">{item.systemQuantity} u</span>
                          {item.status === "MATCHED" && (
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black text-[10px]">
                              OK
                            </span>
                          )}
                          {item.status === "DISCREPANCY" && (
                            <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-black text-[10px]">
                              Modificado ({item.physicalQuantity} u)
                            </span>
                          )}
                          {item.status === "PENDING" && (
                            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[10px]">
                              Pendiente
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= MODIFICATION & AUDIT POPUP MODAL ================= */}
        {step === "AUDIT" && selectedLocationCode && activeSelectedItem && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedLocationCode(null);
                setEditingCode(null);
              }
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn"
          >
            <div className="w-full max-w-md sm:max-w-lg max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b px-6 py-4 bg-slate-50">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Auditoría y Modificación
                  </span>
                  <h4 className="text-xl font-black text-indigo-950 font-mono">
                    {activeSelectedItem.locationCode}
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  {/* Sequential navigation buttons */}
                  <div className="flex items-center gap-1 border border-slate-200 rounded-xl bg-white p-0.5">
                    <button
                      onClick={() => handleNavigatePosition(-1)}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      title="Casillero anterior"
                    >
                      ◀ Ant
                    </button>
                    <button
                      onClick={() => handleNavigatePosition(1)}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      title="Casillero siguiente"
                    >
                      Sig ▶
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedLocationCode(null);
                      setEditingCode(null);
                    }}
                    className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition font-bold text-base leading-none"
                    title="Cerrar ventana"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Estado de Mapeo:</span>
                  {activeSelectedItem.status === "MATCHED" && (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                      ✅ Coincide Físicamente (OK)
                    </span>
                  )}
                  {activeSelectedItem.status === "DISCREPANCY" && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
                      ⚠️ Discrepancia Registrada
                    </span>
                  )}
                  {activeSelectedItem.status === "PENDING" && (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                      ⏳ Pendiente de Auditoría
                    </span>
                  )}
                </div>

                {/* System Registered Info Box */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    Información Registrada en Sistema:
                  </span>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{activeSelectedItem.systemProductName}</p>
                    <p className="font-mono text-slate-500 text-[11px]">SKU: {activeSelectedItem.systemProductSku}</p>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                    <span className="text-slate-500 font-medium">Stock en Sistema:</span>
                    <span className="text-base font-black text-slate-900">
                      {activeSelectedItem.systemQuantity} {activeSelectedItem.systemProductUnit}
                    </span>
                  </div>
                </div>

                {/* Discrepancy details if modified */}
                {activeSelectedItem.status === "DISCREPANCY" && editingCode !== activeSelectedItem.locationCode && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50/50 p-3.5 space-y-2">
                    <div className="flex items-center justify-between font-bold text-amber-900">
                      <span>⚠️ Modificaciones a Aplicar:</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <p>
                        <span className="text-slate-500">Stock Real:</span>{" "}
                        <strong className="text-amber-950 font-black">
                          {activeSelectedItem.physicalQuantity} {activeSelectedItem.physicalProductUnit}
                        </strong>{" "}
                        ({activeSelectedItem.physicalQuantity - activeSelectedItem.systemQuantity > 0
                          ? `+${activeSelectedItem.physicalQuantity - activeSelectedItem.systemQuantity}`
                          : activeSelectedItem.physicalQuantity - activeSelectedItem.systemQuantity}{" "}
                        u)
                      </p>
                      {activeSelectedItem.physicalProductSku !== activeSelectedItem.systemProductSku && (
                        <p>
                          <span className="text-slate-500">Nuevo Producto:</span>{" "}
                          <strong>{activeSelectedItem.physicalProductName} [{activeSelectedItem.physicalProductSku}]</strong>
                        </p>
                      )}
                      {activeSelectedItem.reassignedLocationCode && (
                        <p>
                          <span className="text-slate-500">Reasignar a:</span>{" "}
                          <strong className="text-indigo-700 font-mono">➔ {activeSelectedItem.reassignedLocationCode}</strong>
                        </p>
                      )}
                      <p className="text-slate-600 italic">Causa: {activeSelectedItem.reason}</p>
                    </div>
                  </div>
                )}

                {/* Normal Actions (When not in edit mode) */}
                {editingCode !== activeSelectedItem.locationCode ? (
                  <div className="space-y-3 pt-2">
                    <button
                      onClick={() => handleMarkMatched(activeSelectedItem.locationCode, false)}
                      className="w-full rounded-2xl bg-emerald-600 py-3 text-xs font-black text-white shadow-md hover:bg-emerald-700 transition hover:scale-102 active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>✅</span>
                      <span>Coincide Físicamente (OK)</span>
                    </button>

                    <button
                      onClick={() => handleOpenEdit(activeSelectedItem)}
                      className="w-full rounded-2xl border-2 border-indigo-200 bg-indigo-50/80 py-2.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>✏️</span>
                      <span>
                        {activeSelectedItem.status === "DISCREPANCY"
                          ? "Editar Modificación Registrada"
                          : "Reportar Discrepancia / Modificar Posición"}
                      </span>
                    </button>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t">
                      <button
                        onClick={() => {
                          setSelectedLocationCode(null);
                          setEditingCode(null);
                        }}
                        className="text-slate-500 hover:text-slate-800 font-bold"
                      >
                        Cerrar Ventana
                      </button>
                      <button
                        onClick={() => handleNavigatePosition(1)}
                        className="font-bold text-indigo-600 hover:underline"
                      >
                        Siguiente Posición ➔
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Inline Discrepancy Edit Form */
                  <div className="rounded-2xl border-2 border-indigo-300 bg-white p-4 space-y-3 shadow-sm animate-fadeIn">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="font-black text-indigo-950 uppercase tracking-wider text-xs">
                        Modificar Posición {activeSelectedItem.locationCode}
                      </span>
                      <button
                        onClick={() => setEditingCode(null)}
                        className="text-slate-400 hover:text-slate-600 font-bold"
                      >
                        ✕
                      </button>
                    </div>

                    {/* 1. Cantidad Real */}
                    <div>
                      <label className="block font-bold text-slate-700 text-xs">
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
                          className="w-28 rounded-xl border border-slate-300 p-2 font-black text-sm focus:border-indigo-600 focus:outline-none"
                        />
                        <span className="font-bold text-slate-500">
                          {activeSelectedItem.systemProductUnit}
                        </span>
                        {editForm.physicalQuantity !== activeSelectedItem.systemQuantity && (
                          <span
                            className={`rounded px-2 py-0.5 font-bold text-xs ${
                              editForm.physicalQuantity - activeSelectedItem.systemQuantity > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {editForm.physicalQuantity - activeSelectedItem.systemQuantity > 0
                              ? `+${editForm.physicalQuantity - activeSelectedItem.systemQuantity}`
                              : editForm.physicalQuantity - activeSelectedItem.systemQuantity}{" "}
                            u
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 2. Cambiar Producto */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 text-xs">
                          2. ¿Es otro producto diferente?
                        </label>
                        <input
                          type="checkbox"
                          checked={editForm.differentProduct}
                          onChange={(e) =>
                            setEditForm({ ...editForm, differentProduct: e.target.checked })
                          }
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                      </div>
                      {editForm.differentProduct && (
                        <select
                          value={editForm.physicalProductId}
                          onChange={(e) =>
                            setEditForm({ ...editForm, physicalProductId: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-300 p-2 text-xs bg-white"
                        >
                          {safeProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.sku}] {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* 3. Reasignar Ubicación */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 text-xs">
                          3. ¿Está en otra posición física?
                        </label>
                        <input
                          type="checkbox"
                          checked={editForm.reassignLocation}
                          onChange={(e) =>
                            setEditForm({ ...editForm, reassignLocation: e.target.checked })
                          }
                          className="h-4 w-4 rounded text-indigo-600"
                        />
                      </div>
                      {editForm.reassignLocation && (
                        <select
                          value={editForm.reassignedLocationId}
                          onChange={(e) =>
                            setEditForm({ ...editForm, reassignedLocationId: e.target.value })
                          }
                          className="w-full rounded-xl border border-slate-300 p-2 text-xs font-mono bg-white"
                        >
                          {safeLocations.map((l) => (
                            <option key={l.id || l.code} value={l.id || l.code}>
                              {l.code} ({l.rack?.name ?? "Rack"} - N{l.level})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* 4. Causa */}
                    <div>
                      <label className="block font-bold text-slate-700 text-xs mb-1">
                        4. Motivo / Causa:
                      </label>
                      <select
                        value={editForm.reason}
                        onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 p-2 text-xs bg-white mb-2"
                      >
                        {COMMON_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Nota adicional (opcional)..."
                        value={editForm.notes}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
                      />
                    </div>

                    {/* Form Buttons */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => setEditingCode(null)}
                        className="flex-1 rounded-xl border border-slate-200 py-2.5 font-bold text-slate-600 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleSaveEdit(activeSelectedItem.locationCode)}
                        className="flex-1 rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-700 shadow-md"
                      >
                        Guardar Modificación
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
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
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95 cursor-pointer"
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
                ← Volver al Plano
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
                {inline ? "Finalizar y Cerrar Sección" : "Finalizar y Volver al Plano 2D"}
              </button>
            </>
          )}
        </div>
      </div>
    );

    if (inline) {
      return renderContent();
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2 sm:p-4 backdrop-blur-sm animate-fadeIn">
        {renderContent()}
      </div>
    );
  }

  export function MappingModal(props: Props) {
    return (
      <ModalErrorBoundary onClose={props.onClose} inline={props.inline}>
        <MappingModalInner {...props} />
      </ModalErrorBoundary>
    );
  }
