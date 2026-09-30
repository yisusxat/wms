"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Package,
  MapPin,
  Boxes,
  Warehouse,
  Archive,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ScanBarcode,
  Grid3x3,
  Gauge,
  Activity,
  RefreshCw,
  X,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Clock,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { CurrentUser, Summary } from "../../lib/api";
import { DashboardSkeleton } from "./Skeleton";

interface DashboardProps {
  summary: Summary | null;
  onNavigate: (tab: string) => void;
  role?: CurrentUser["role"];
  token?: string;
  onOpenScanner?: () => void;
  onRefresh?: () => void;
}

export function Dashboard({
  summary,
  onNavigate,
  role,
  onOpenScanner,
  onRefresh,
}: DashboardProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("wms_dashboard_guide_dismissed") === "true";
    }
    return false;
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Listen to cross-system mutation events for automatic live updates
  useEffect(() => {
    function handleDataChange() {
      onRefresh?.();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("wms-data-changed", handleDataChange);
      window.addEventListener("storage", handleDataChange);
      return () => {
        window.removeEventListener("wms-data-changed", handleDataChange);
        window.removeEventListener("storage", handleDataChange);
      };
    }
  }, [onRefresh]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleDismissGuide = () => {
    setDismissed(true);
    try {
      localStorage.setItem("wms_dashboard_guide_dismissed", "true");
    } catch {}
  };

  const handleRestoreGuide = () => {
    setDismissed(false);
    try {
      localStorage.removeItem("wms_dashboard_guide_dismissed");
    } catch {}
  };

  const occupancyRate = useMemo(() => {
    if (!summary || !summary.locations || summary.locations === 0) return 0;
    return Math.round((summary.occupiedLocations / summary.locations) * 1000) / 10;
  }, [summary]);

  const aisleA = useMemo(() => {
    if (summary?.aisles?.aisleA) return summary.aisles.aisleA;
    return {
      code: "A",
      name: "Pasillo A (Norte)",
      total: 74,
      occupied: Math.min(summary?.occupiedLocations ?? 0, 74),
      rate: summary?.locations ? Math.min(100, Math.round(((summary?.occupiedLocations ?? 0) / 74) * 100)) : 0,
    };
  }, [summary]);

  const aisleB = useMemo(() => {
    if (summary?.aisles?.aisleB) return summary.aisles.aisleB;
    const remainingOccupied = Math.max(0, (summary?.occupiedLocations ?? 0) - (summary?.aisles?.aisleA?.occupied ?? 0));
    return {
      code: "B",
      name: "Pasillo B (Sur)",
      total: 74,
      occupied: remainingOccupied,
      rate: summary?.locations ? Math.min(100, Math.round((remainingOccupied / 74) * 100)) : 0,
    };
  }, [summary]);

  if (!summary) {
    return <DashboardSkeleton />;
  }

  // Symmetric 8 cards configuration (4x2 on large screens)
  const metricCards = [
    {
      id: "products",
      label: "Productos",
      value: summary.products,
      subtext: "SKUs activos en catálogo",
      icon: Package,
      color: "text-blue-600 dark:text-blue-400",
      bgIcon: "bg-blue-50 dark:bg-blue-950/40",
      action: () => onNavigate("products"),
    },
    {
      id: "locations",
      label: "Ubicaciones",
      value: summary.locations,
      subtext: "148 casilleros en 2 pasillos",
      icon: MapPin,
      color: "text-indigo-600 dark:text-indigo-400",
      bgIcon: "bg-indigo-50 dark:bg-indigo-950/40",
      action: () => onNavigate("warehouse2d"),
    },
    {
      id: "totalStock",
      label: "Stock total",
      value: summary.totalUnits.toLocaleString(),
      subtext: "Unidades en custodia",
      icon: Boxes,
      color: "text-emerald-600 dark:text-emerald-400",
      bgIcon: "bg-emerald-50 dark:bg-emerald-950/40",
      action: () => onNavigate("inventory"),
    },
    {
      id: "occupancy",
      label: "Ocupación global",
      value: `${occupancyRate}%`,
      subtext: `${summary.occupiedLocations} de ${summary.locations} ocupadas`,
      icon: Warehouse,
      color: occupancyRate > 85 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
      bgIcon: occupancyRate > 85 ? "bg-red-50 dark:bg-red-950/40" : "bg-amber-50 dark:bg-amber-950/40",
      isRate: true,
      rateValue: occupancyRate,
      action: () => onNavigate("kpis"),
    },
    {
      id: "occupied",
      label: "Ocupadas",
      value: summary.occupiedLocations,
      subtext: "Casilleros con stock asignado",
      icon: Archive,
      color: "text-purple-600 dark:text-purple-400",
      bgIcon: "bg-purple-50 dark:bg-purple-950/40",
      action: () => onNavigate("inventory"),
    },
    {
      id: "available",
      label: "Disponibles",
      value: summary.availableLocations,
      subtext: "Casilleros libres para estiba",
      icon: CheckCircle2,
      color: "text-teal-600 dark:text-teal-400",
      bgIcon: "bg-teal-50 dark:bg-teal-950/40",
      action: () => onNavigate("warehouse2d"),
    },
    {
      id: "entries",
      label: "Entradas hoy",
      value: summary.entriesToday,
      subtext: "Recepciones del turno",
      icon: ArrowDownLeft,
      color: "text-emerald-600 dark:text-emerald-400",
      bgIcon: "bg-emerald-50 dark:bg-emerald-950/40",
      action: () => onNavigate("movements"),
    },
    {
      id: "issues",
      label: "Salidas hoy",
      value: summary.issuesToday,
      subtext: "Despachos y picking",
      icon: ArrowUpRight,
      color: "text-orange-600 dark:text-orange-400",
      bgIcon: "bg-orange-50 dark:bg-orange-950/40",
      action: () => onNavigate("movements"),
    },
  ];

  const quickActions = [
    {
      label: "Recepción de Mercancía",
      description: "Ingresar nueva carga a bodega",
      icon: ArrowDownLeft,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800/40",
      action: () => onNavigate("movements"),
    },
    {
      label: "Despacho / Salida",
      description: "Registrar orden de salida o picking",
      icon: ArrowUpRight,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-950/30",
      border: "border-orange-200 dark:border-orange-800/40",
      action: () => onNavigate("movements"),
    },
    {
      label: "Reubicación Interna",
      description: "Transferir entre casilleros",
      icon: ArrowLeftRight,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800/40",
      action: () => onNavigate("movements"),
    },
    {
      label: "Escanear con Visión / OCR",
      description: "Lector por cámara y digitalización",
      icon: ScanBarcode,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/30",
      border: "border-purple-200 dark:border-purple-800/40",
      action: () => onOpenScanner ? onOpenScanner() : onNavigate("products"),
    },
    {
      label: "Inspección en Plano 2D",
      description: "Mapa térmico de estantes y racks",
      icon: Grid3x3,
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-950/30",
      border: "border-indigo-200 dark:border-indigo-800/40",
      action: () => onNavigate("warehouse2d"),
    },
    {
      label: "Centro de Mando & KPIs",
      description: "Análisis IRA, ABC y rotación",
      icon: Gauge,
      color: "text-slate-700 dark:text-slate-200",
      bg: "bg-slate-100 dark:bg-slate-800/50",
      border: "border-slate-200 dark:border-slate-700",
      action: () => onNavigate("kpis"),
    },
  ];

  const recentMovements = summary.recentMovements ?? [];

  return (
    <div className="space-y-6">
      {/* Top Bar: Operational Status & Sync telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 animate-pulse" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Operación Activa
            </span>
          </div>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            Bodega Central (148 ubicaciones)
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Sincronización en vivo vía PostgreSQL / InsForge
          </span>
        </div>

        <div className="flex items-center gap-2">
          {dismissed && (
            <button
              onClick={handleRestoreGuide}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Ver guía de inicio
            </button>
          )}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Refrescar indicadores en tiempo real"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-blue-600" : "text-slate-500"}`} />
            <span>Sincronizar</span>
          </button>
        </div>
      </div>

      {/* Onboarding Guide (Dismissable & Persisted in localStorage) */}
      {!dismissed && (
        <div className="relative overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/40 via-white to-indigo-50/20 p-5 shadow-xs dark:border-blue-900/40 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/20">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                Guía de puesta en marcha
              </span>
              <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                Bienvenido al Sistema WMS
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Sigue estos pasos esenciales para operar la bodega de forma eficiente y segura:
              </p>
            </div>
            <button
              onClick={handleDismissGuide}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Ocultar guía"
            >
              <X className="h-3.5 w-3.5" /> Ocultar
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col justify-between rounded-xl border border-blue-100/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
              <div>
                <div className="flex items-center gap-2 font-medium text-slate-800 text-sm dark:text-slate-200">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                  Explorar Layout 2D/3D
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {summary ? summary.locations : 148} ubicaciones modeladas en Pasillos A y B (Racks Central y Pared, 5 niveles).
                </p>
              </div>
              <button
                onClick={() => onNavigate("warehouse2d")}
                className="mt-3 flex items-center gap-1 text-left text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Abrir Vista 2D →
              </button>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-blue-100/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
              <div>
                <div className="flex items-center gap-2 font-medium text-slate-800 text-sm dark:text-slate-200">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">2</span>
                  Catálogo de Productos
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {summary?.products ? `${summary.products} SKUs registrados.` : "Registra tus primeros artículos con SKU y unidad de medida."}
                </p>
              </div>
              <button
                onClick={() => onNavigate("products")}
                className="mt-3 flex items-center gap-1 text-left text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Gestionar SKUs →
              </button>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-blue-100/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
              <div>
                <div className="flex items-center gap-2 font-medium text-slate-800 text-sm dark:text-slate-200">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">3</span>
                  {role === "ADMIN" ? "Gestión de Equipo" : "Niveles de Acceso"}
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {role === "ADMIN"
                    ? "Invita a supervisores y operarios asignando roles RBAC."
                    : `Tu rol actual es ${role || "OPERATOR"}. Operaciones auditadas.`}
                </p>
              </div>
              {role === "ADMIN" ? (
                <button
                  onClick={() => onNavigate("team")}
                  className="mt-3 flex items-center gap-1 text-left text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Panel de Equipo →
                </button>
              ) : (
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Rol verificado
                </span>
              )}
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-blue-100/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/90">
              <div>
                <div className="flex items-center gap-2 font-medium text-slate-800 text-sm dark:text-slate-200">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">4</span>
                  Movimientos de Stock
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Registra entradas, salidas y transferencias guiadas entre ubicaciones.
                </p>
              </div>
              <button
                onClick={() => onNavigate("movements")}
                className="mt-3 flex items-center gap-1 text-left text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Registrar Movimiento →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8 Symmetrical Operational Metric Cards (4x2 Grid) */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              onClick={card.action}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  card.action();
                }
              }}
              className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition duration-150 hover:scale-[1.01] active:scale-[0.99] hover:border-blue-400 hover:shadow-md cursor-pointer dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-600"
            >
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500 sm:text-sm dark:text-slate-400">
                    {card.label}
                  </p>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.bgIcon} ${card.color} transition-transform group-hover:scale-110`}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                  {card.value}
                </p>
              </div>

              <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800/80">
                {card.isRate ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>Nivel de ocupación</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{card.value}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        style={{ width: `${Math.min(100, Math.max(0, card.rateValue ?? 0))}%` }}
                        className={`h-full transition-all duration-500 ${
                          (card.rateValue ?? 0) > 85 ? "bg-red-500" : (card.rateValue ?? 0) > 70 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate">{card.subtext}</span>
                    <ChevronRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Quick Workstation Actions Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Estación de Acciones Rápidas
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Flujos operativos frecuentes del turno
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                onClick={action.action}
                className={`flex flex-col items-start rounded-lg border p-3 text-left transition hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] ${action.border} ${action.bg}`}
              >
                <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-2xs dark:bg-slate-800 ${action.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                  {action.label}
                </span>
                <span className="mt-1 line-clamp-2 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  {action.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Operational Two-Column Section: Live Activity Feed + Physical Aisle Saturation */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Live Movements Feed (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Últimos Movimientos del Día
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  En vivo
                </span>
                <button
                  onClick={() => onNavigate("movements")}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                >
                  Ver todos →
                </button>
              </div>
            </div>

            {recentMovements.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentMovements.slice(0, 6).map((movement: any) => {
                  const isEntry = movement.type === "RECEIPT";
                  const isExit = movement.type === "ISSUE";
                  const isTransfer = movement.type === "TRANSFER";

                  const badgeClass = isEntry
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40"
                    : isExit
                    ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/40"
                    : isTransfer
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40"
                    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

                  const labelType = isEntry
                    ? "Entrada"
                    : isExit
                    ? "Salida"
                    : isTransfer
                    ? "Transferencia"
                    : "Ajuste";

                  const locDisplay = isEntry
                    ? movement.destinationLocation?.code ?? "Bodega"
                    : isExit
                    ? movement.sourceLocation?.code ?? "Despacho"
                    : `${movement.sourceLocation?.code ?? "—"} → ${movement.destinationLocation?.code ?? "—"}`;

                  const dateFormatted = movement.createdAt
                    ? new Date(movement.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "Reciente";

                  return (
                    <div key={movement.id} className="flex items-center justify-between py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 px-1 rounded-md transition">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                          {labelType}
                        </span>
                        <div>
                          <p className="text-xs font-medium text-slate-900 dark:text-white">
                            {movement.product?.name ?? "Producto"}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            SKU: {movement.product?.sku ?? "N/A"} · Casillero: <span className="font-semibold text-slate-700 dark:text-slate-300">{locDisplay}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {isExit ? `-${movement.quantity}` : `+${movement.quantity}`} u.
                        </span>
                        <p className="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                          <Clock className="h-3 w-3" />
                          {dateFormatted}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
                <Building2 className="h-8 w-8 mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Sin movimientos registrados en este turno
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Las órdenes de recepción y despacho aparecerán aquí en tiempo real.
                </p>
                <button
                  onClick={() => onNavigate("movements")}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
                >
                  Registrar primer movimiento
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Physical Aisle Saturation & Warehouse Health (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          {/* Physical Aisle Saturation */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Saturación por Pasillo Físico
                </h3>
              </div>
              <button
                onClick={() => onNavigate("warehouse2d")}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
              >
                Ver plano 2D →
              </button>
            </div>

            <div className="space-y-3">
              {/* Pasillo A */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-800 dark:text-slate-200">{aisleA.name}</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{aisleA.rate}%</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Rack Central (A-C: 30) y Pared (A-P: 44)
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    style={{ width: `${aisleA.rate}%` }}
                    className={`h-full transition-all duration-300 ${
                      aisleA.rate > 85 ? "bg-red-500" : aisleA.rate > 70 ? "bg-amber-500" : "bg-blue-600"
                    }`}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>{aisleA.occupied} ocupadas</span>
                  <span>{aisleA.total} posiciones</span>
                </div>
              </div>

              {/* Pasillo B */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-800 dark:text-slate-200">{aisleB.name}</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{aisleB.rate}%</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Rack Central (B-C: 30) y Pared (B-P: 44)
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    style={{ width: `${aisleB.rate}%` }}
                    className={`h-full transition-all duration-300 ${
                      aisleB.rate > 85 ? "bg-red-500" : aisleB.rate > 70 ? "bg-amber-500" : "bg-blue-600"
                    }`}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span>{aisleB.occupied} ocupadas</span>
                  <span>{aisleB.total} posiciones</span>
                </div>
              </div>
            </div>
          </div>

          {/* Warehouse Health & Status Panel */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
              Salud Operativa de Bodega
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Nivel de Capacidad:</span>
                <span className={`font-semibold ${occupancyRate > 85 ? "text-red-600" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {occupancyRate > 85 ? "Saturación Alta (>85%)" : "Saludable (<85%)"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Disponibilidad Inmediata:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {summary.availableLocations} casilleros libres
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-600 dark:text-slate-400">Integridad de Infraestructura:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  148 casilleros auditados
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
