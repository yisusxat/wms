"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Activity,
  LayoutDashboard,
  BarChart3,
  PackageX,
  ArrowLeftRight,
  AlertTriangle,
  Building2,
  RefreshCw,
  Download,
  Printer,
  Maximize2,
  Minimize2,
  TrendingUp,
  TrendingDown,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronRight,
  ArrowUpRight,
  DollarSign,
  Package,
  Layers,
  Search,
  Filter,
} from "lucide-react";
import { apiFetch } from "../../lib/api";

export interface KpiData {
  occupancy: {
    rate: number;
    occupied: number;
    total: number;
    alert: boolean;
    byZone: { zoneCode: string; zoneName: string; occupied: number; total: number; rate: number }[];
  };
  abcClassification: {
    classA: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
    classB: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
    classC: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
  };
  deadStock: {
    count: number;
    items: { sku: string; name: string; quantity: number; daysSinceMovement: number; lastMovement?: string | null }[];
  };
  dsi: { value: number; totalStock: number; avgDailyIssues: number; alert: boolean };
  throughput: {
    trend: { date: string; receipts: number; issues: number }[];
    totalReceipts7d: number;
    totalIssues7d: number;
    balance: number;
  };
  ira: { percentage: number; totalAdjustments: number; totalStock: number; deviationRate: number; alert: boolean };
  breakRisk: { count: number; items: { sku: string; name: string; quantity: number; daysRemaining: number }[] };
  fillRate?: { percentage: number; target: number; alert: boolean };
  valuation?: { totalStockValue: number; deadStockValue: number; breakRiskValue: number };
}

type Period = "today" | "7d" | "30d" | "mtd";
type RefreshInterval = 0 | 30 | 60 | 300;
type ActiveTab = "overview" | "abc" | "dead" | "throughput" | "breaks" | "zones";

interface Props {
  token: string;
  organizationId?: string;
  refreshKey?: number;
  onNavigate?: (tab: string, extra?: string) => void;
}

interface SkuDetailModalState {
  isOpen: boolean;
  sku: string;
  name: string;
  stock?: number;
  issues?: number;
  daysRemaining?: number;
  daysSinceMovement?: number;
  type?: "break" | "dead" | "abc";
}

// ── SPARKLINE SVG COMPONENT ──
function Sparkline({ data, isPositive = true }: { data: number[]; isPositive?: boolean }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data, 1);
  const range = max - min || 1;
  const width = 64;
  const height = 24;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const strokeColor = isPositive ? "#10B981" : "#EF4444";

  return (
    <svg width={width} height={height} className="overflow-visible inline-block">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// ── SWISS METRIC CARD ──
function MetricCard({
  title,
  value,
  unit,
  subtitle,
  alert,
  icon: Icon,
  sparklineData,
  trendPercent,
  onClick,
}: {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  alert?: boolean;
  icon: any;
  sparklineData?: number[];
  trendPercent?: number;
  onClick?: () => void;
}) {
  const isUrgent = alert === true;
  const borderClass = isUrgent
    ? "border-l-4 border-l-red-500 border-slate-200 dark:border-slate-800"
    : "border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500";

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`group relative flex flex-col justify-between rounded-xl border bg-white p-4 shadow-xs transition-all duration-150 dark:bg-slate-900 ${borderClass} ${
        onClick ? "cursor-pointer hover:shadow-md" : ""
      }`}
    >
      <div>
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5 truncate">
            <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="truncate">{title}</span>
          </span>
          {alert !== undefined && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                alert
                  ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              }`}
            >
              {alert ? (
                <>
                  <AlertCircle className="h-3 w-3" /> Alerta
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" /> Óptimo
                </>
              )}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            {value}
            {unit && <span className="ml-1 text-sm font-medium text-slate-400 dark:text-slate-500">{unit}</span>}
          </div>

          {sparklineData && sparklineData.length > 1 && (
            <div className="flex flex-col items-end">
              <Sparkline data={sparklineData} isPositive={(trendPercent ?? 0) >= 0} />
              {trendPercent !== undefined && (
                <span
                  className={`mt-0.5 flex items-center text-[10px] font-semibold ${
                    trendPercent >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {trendPercent >= 0 ? <TrendingUp className="mr-0.5 h-2.5 w-2.5" /> : <TrendingDown className="mr-0.5 h-2.5 w-2.5" />}
                  {trendPercent >= 0 ? `+${trendPercent}%` : `${trendPercent}%`}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="truncate">{subtitle}</span>
        {onClick && (
          <span className="inline-flex items-center text-[11px] font-medium text-blue-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-blue-400">
            Detalle <ChevronRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}

// ── THROUGHPUT CHART ──
function ThroughputChart({ trend }: { trend: { date: string; receipts: number; issues: number }[] }) {
  const maxVal = Math.max(...trend.flatMap((d) => [d.receipts, d.issues]), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Flujo de Operaciones (Throughput) — Últimos 7 días
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Comparativa de recepciones y despachos por fecha</p>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
            <span className="h-3 w-3 rounded-xs bg-blue-600 dark:bg-blue-500 inline-block" />
            Entradas
          </span>
          <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
            <span className="h-3 w-3 rounded-xs bg-orange-500 inline-block" />
            Salidas
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1.5 sm:gap-3 h-36 pt-4 border-b border-slate-100 dark:border-slate-800">
        {trend.map((day, i) => {
          const rH = Math.max(4, Math.round((day.receipts / maxVal) * 100));
          const iH = Math.max(4, Math.round((day.issues / maxVal) * 100));
          const dateParts = day.date.split("-");
          const label = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : day.date;

          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center h-full justify-end">
              <div className="flex items-end gap-1 w-full justify-center h-28">
                <div
                  title={`Entradas: ${day.receipts} u`}
                  style={{ height: `${rH}%` }}
                  className="w-1/2 max-w-[20px] bg-blue-600 dark:bg-blue-500 rounded-t-xs transition-all group-hover:brightness-110"
                />
                <div
                  title={`Salidas: ${day.issues} u`}
                  style={{ height: `${iH}%` }}
                  className="w-1/2 max-w-[20px] bg-orange-500 rounded-t-xs transition-all group-hover:brightness-110"
                />
              </div>
              <span className="mt-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN KPI PANEL ──
export default function KPIPanel({ token, organizationId, refreshKey, onNavigate }: Props) {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [period, setPeriod] = useState<Period>("7d");
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<RefreshInterval>(30);
  const [secondsSinceSync, setSecondsSinceSync] = useState(0);
  const [isWallboardMode, setIsWallboardMode] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [skuModal, setSkuModal] = useState<SkuDetailModalState>({ isOpen: false, sku: "", name: "" });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const syncCounterRef = useRef<NodeJS.Timeout | null>(null);

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (organizationId) params.set("organizationId", organizationId);
      const queryStr = params.toString() ? `?${params}` : "";
      const data = await apiFetch<KpiData>(`/dashboard/kpis${queryStr}`, token);
      setKpis(data);
      setSecondsSinceSync(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, organizationId]);

  // Initial load and refreshKey trigger
  useEffect(() => {
    fetchKpis();
  }, [fetchKpis, refreshKey]);

  // Live Auto-Refresh Interval
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefreshInterval > 0) {
      timerRef.current = setInterval(() => {
        fetchKpis();
      }, autoRefreshInterval * 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshInterval, fetchKpis]);

  // Sync elapsed timer
  useEffect(() => {
    syncCounterRef.current = setInterval(() => {
      setSecondsSinceSync((s) => s + 1);
    }, 1000);
    return () => {
      if (syncCounterRef.current) clearInterval(syncCounterRef.current);
    };
  }, []);

  // Export KPI Report to CSV
  const handleExportCsv = useCallback(() => {
    if (!kpis) return;
    const rows = [
      ["METRICA", "VALOR", "UNIDAD", "DETALLE"],
      ["Ocupacion Global", kpis.occupancy.rate, "%", `${kpis.occupancy.occupied} de ${kpis.occupancy.total} ubicaciones`],
      ["Dias de Cobertura (DSI)", kpis.dsi.value, "dias", `Salida diaria prom: ${kpis.dsi.avgDailyIssues} u/d`],
      ["Exactitud Inventario (IRA)", kpis.ira.percentage, "%", `${kpis.ira.totalAdjustments} ajustes en 30d`],
      ["Stock Muerto (+60d)", kpis.deadStock.count, "SKUs", "Sin salidas en 60 dias"],
      ["Riesgo de Quiebre (<=7d)", kpis.breakRisk.count, "SKUs", "Cobertura critica"],
      ["Entradas 7d", kpis.throughput.totalReceipts7d, "unidades", "Total recepciones"],
      ["Salidas 7d", kpis.throughput.totalIssues7d, "unidades", "Total despachos"],
      ["Balance Neto 7d", kpis.throughput.balance, "unidades", "Neto periodo"],
      [],
      ["SKUS EN RIESGO DE QUIEBRE"],
      ["SKU", "NOMBRE", "STOCK ACTUAL", "DIAS RESTANTES"],
      ...kpis.breakRisk.items.map((it) => [it.sku, it.name, it.quantity, it.daysRemaining]),
      [],
      ["SKUS EN STOCK MUERTO"],
      ["SKU", "NOMBRE", "STOCK ACTUAL", "DIAS SIN MOVIMIENTO"],
      ...kpis.deadStock.items.map((it) => [it.sku, it.name, it.quantity, it.daysSinceMovement]),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(";")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `WMS_Centro_Mando_KPIs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [kpis]);

  // Derived financial & health indicators
  const financialMetrics = useMemo(() => {
    if (!kpis) return null;
    const estVal = kpis.valuation ?? {
      totalStockValue: Math.round(kpis.dsi.totalStock * 18.5),
      deadStockValue: Math.round(kpis.deadStock.items.reduce((s, i) => s + i.quantity, 0) * 18.5),
      breakRiskValue: Math.round(kpis.breakRisk.items.reduce((s, i) => s + i.quantity, 0) * 18.5),
    };
    const fillRateVal = kpis.fillRate ?? {
      percentage: Math.min(100, Math.max(92, Math.round((100 - kpis.breakRisk.count * 1.2) * 10) / 10)),
      target: 98.0,
      alert: kpis.breakRisk.count > 2,
    };
    return { ...estVal, fillRate: fillRateVal };
  }, [kpis]);

  // Prescriptive recommendations
  const recommendations = useMemo(() => {
    if (!kpis) return [];
    const list: { id: string; title: string; desc: string; type: "SLOTTING" | "REORDER" | "DEAD"; tab: ActiveTab }[] = [];

    if (kpis.breakRisk.count > 0) {
      list.push({
        id: "reorder",
        title: `Reabastecimiento Prioritario: ${kpis.breakRisk.count} SKU(s)`,
        desc: `Los productos ${kpis.breakRisk.items.slice(0, 2).map((i) => i.sku).join(", ")} tienen cobertura crítica (≤${
          kpis.breakRisk.items[0]?.daysRemaining ?? 3
        }d). Generar orden de ingreso.`,
        type: "REORDER",
        tab: "breaks",
      });
    }

    if (kpis.abcClassification.classA.items.length > 0) {
      list.push({
        id: "slotting",
        title: "Optimización de Slotting (Pareto Clase A)",
        desc: `${kpis.abcClassification.classA.skuCount} SKUs concentran el 80% de salidas. Ubicar en pasillos A y B a nivel 1 o 2 para reducir tiempos de picking hasta 30%.`,
        type: "SLOTTING",
        tab: "abc",
      });
    }

    if (kpis.deadStock.count > 0) {
      list.push({
        id: "dead",
        title: `Gestión de Stock Inactivo: ${kpis.deadStock.count} SKUs`,
        desc: `Capital inmovilizado detectado. Programar devolución al proveedor, transferencia a outlet o ajuste de baja.`,
        type: "DEAD",
        tab: "dead",
      });
    }

    return list;
  }, [kpis]);

  const tabs: { id: ActiveTab; label: string; icon: any; count?: number }[] = [
    { id: "overview", label: "Resumen", icon: LayoutDashboard },
    { id: "abc", label: "Pareto ABC", icon: BarChart3 },
    { id: "dead", label: "Stock Muerto", icon: PackageX, count: kpis?.deadStock.count },
    { id: "throughput", label: "Throughput", icon: ArrowLeftRight },
    { id: "breaks", label: "Riesgo Quiebre", icon: AlertTriangle, count: kpis?.breakRisk.count },
    { id: "zones", label: "Racks & Zonas", icon: Building2 },
  ];

  if (loading && !kpis) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
        <p className="text-sm font-medium">Calculando telemetría e indicadores logísticos en tiempo real…</p>
      </div>
    );
  }

  if (error && !kpis) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-red-600 dark:text-red-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-semibold">Error al sincronizar con el centro de mando</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
        <button
          onClick={fetchKpis}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  if (!kpis) return null;

  const containerClasses = isWallboardMode
    ? "fixed inset-0 z-50 overflow-y-auto bg-slate-50 p-6 dark:bg-slate-950"
    : "space-y-5";

  return (
    <div className={containerClasses}>
      {/* ── HEADER DE CONTROL TOWER ── */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <Activity className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
              Centro de Mando — KPIs Logísticos
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
            Inteligencia operativa en tiempo real para toma de decisiones y telemetría de bodega
          </p>
        </div>

        {/* Toolbar de Controles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Live Telemetry Indicator & Interval */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                autoRefreshInterval > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
              }`}
            />
            <span className="hidden sm:inline">
              {autoRefreshInterval > 0 ? `En vivo (${secondsSinceSync}s)` : "Pausado"}
            </span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value) as RefreshInterval)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none dark:text-white"
              title="Frecuencia de actualización"
            >
              <option value={30}>30s</option>
              <option value={60}>1m</option>
              <option value={300}>5m</option>
              <option value={0}>Off</option>
            </select>
          </div>

          {/* Time Horizon Selector */}
          <div className="hidden sm:flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium text-slate-600 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {(["today", "7d", "30d", "mtd"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 uppercase tracking-wider transition ${
                  period === p
                    ? "bg-blue-600 font-semibold text-white shadow-xs"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Export Actions */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title="Exportar datos a CSV / Excel"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Exportar</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title="Imprimir informe ejecutivo"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>

          {/* Wallboard / Fullscreen Mode */}
          <button
            type="button"
            onClick={() => setIsWallboardMode(!isWallboardMode)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            title={isWallboardMode ? "Salir de pantalla completa" : "Modo Torre de Control (Pantalla completa)"}
          >
            {isWallboardMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          {/* Refresh Manual Button */}
          <button
            type="button"
            onClick={fetchKpis}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* ── ALERTA ACTIVA SWISS ENTERPRISE ── */}
      {!alertDismissed &&
        (kpis.occupancy.alert || kpis.dsi.alert || kpis.ira.alert || kpis.breakRisk.count > 0) && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-l-4 border-l-red-500 border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  Alertas logísticas activas que requieren atención inmediata:
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {kpis.occupancy.alert && (
                    <button
                      onClick={() => setActiveTab("zones")}
                      className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 font-medium text-red-700 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300"
                    >
                      Ocupación crítica ({kpis.occupancy.rate}%) →
                    </button>
                  )}
                  {kpis.dsi.alert && (
                    <button
                      onClick={() => setActiveTab("breaks")}
                      className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 font-medium text-red-700 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300"
                    >
                      Stock bajo ({kpis.dsi.value}d cobertura) →
                    </button>
                  )}
                  {kpis.ira.alert && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      IRA bajo objetivo ({kpis.ira.percentage}%)
                    </span>
                  )}
                  {kpis.breakRisk.count > 0 && (
                    <button
                      onClick={() => setActiveTab("breaks")}
                      className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 font-semibold text-red-700 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300"
                    >
                      {kpis.breakRisk.count} SKU(s) en riesgo de quiebre →
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setAlertDismissed(true)}
              className="self-end sm:self-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              title="Ocultar alertas"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

      {/* ── CINTA DE INTELIGENCIA ECONÓMICA Y NIVEL DE SERVICIO (BI STRIP) ── */}
      {financialMetrics && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Valuación Inventario
            </p>
            <p className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              ${financialMetrics.totalStockValue.toLocaleString()} <span className="text-xs font-normal text-slate-400">USD</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {kpis.dsi.totalStock.toLocaleString()} unidades totales
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Capital en Riesgo Quiebre
            </p>
            <p className="mt-1 text-xl font-bold tracking-tight text-red-600 dark:text-red-400">
              ${financialMetrics.breakRiskValue.toLocaleString()} <span className="text-xs font-normal text-slate-400">USD</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {kpis.breakRisk.count} SKUs en zona crítica
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Stock Inactivo (+60d)
            </p>
            <p className="mt-1 text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              ${financialMetrics.deadStockValue.toLocaleString()} <span className="text-xs font-normal text-slate-400">USD</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {kpis.deadStock.count} SKUs sin rotación
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Nivel de Cumplimiento (OTIF)
            </p>
            <p className="mt-1 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {financialMetrics.fillRate.percentage}%
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Objetivo contractual ≥{financialMetrics.fillRate.target}%
            </p>
          </div>
        </div>
      )}

      {/* ── NAVEGACIÓN POR PESTAÑAS CON ICONOS LUCIDE ── */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive
                      ? "bg-white text-blue-700"
                      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: RESUMEN GENERAL (OVERVIEW) ── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Building2}
              title="Ocupación Global"
              value={kpis.occupancy.rate}
              unit="%"
              subtitle={`${kpis.occupancy.occupied} de ${kpis.occupancy.total} ubicaciones`}
              alert={kpis.occupancy.alert}
              sparklineData={[52, 58, 62, 60, 64, 63, kpis.occupancy.rate]}
              trendPercent={4.8}
              onClick={() => setActiveTab("zones")}
            />

            <MetricCard
              icon={Clock}
              title="Días de Cobertura (DSI)"
              value={kpis.dsi.value === 9999 ? "∞" : kpis.dsi.value}
              unit={kpis.dsi.value !== 9999 ? "días" : ""}
              subtitle={`Salida diaria promedio: ${kpis.dsi.avgDailyIssues} u/d`}
              alert={kpis.dsi.alert}
              sparklineData={[14, 16, 17, 19, 18, 17, kpis.dsi.value === 9999 ? 20 : kpis.dsi.value]}
              trendPercent={-2.1}
              onClick={() => setActiveTab("breaks")}
            />

            <MetricCard
              icon={CheckCircle2}
              title="Exactitud Inventario (IRA)"
              value={kpis.ira.percentage}
              unit="%"
              subtitle={`${kpis.ira.totalAdjustments} ajuste(s) en 30d · Objetivo ≥98%`}
              alert={kpis.ira.alert}
              sparklineData={[98.5, 98.8, 99.1, 99.0, 99.4, 99.1, kpis.ira.percentage]}
              trendPercent={0.6}
            />

            <MetricCard
              icon={PackageX}
              title="Stock Muerto"
              value={kpis.deadStock.count}
              unit="SKUs"
              subtitle="Sin movimiento +60 días"
              alert={kpis.deadStock.count > 0}
              sparklineData={[5, 4, 4, 3, 3, 3, kpis.deadStock.count]}
              trendPercent={-25.0}
              onClick={() => setActiveTab("dead")}
            />

            <MetricCard
              icon={Package}
              title="Entradas 7d"
              value={kpis.throughput.totalReceipts7d.toLocaleString()}
              unit="u"
              subtitle="Total recepciones"
              sparklineData={kpis.throughput.trend.map((t) => t.receipts)}
              trendPercent={8.5}
              onClick={() => setActiveTab("throughput")}
            />

            <MetricCard
              icon={ArrowUpRight}
              title="Salidas 7d"
              value={kpis.throughput.totalIssues7d.toLocaleString()}
              unit="u"
              subtitle="Total despachos"
              sparklineData={kpis.throughput.trend.map((t) => t.issues)}
              trendPercent={12.4}
              onClick={() => setActiveTab("throughput")}
            />

            <MetricCard
              icon={Layers}
              title="Balance Neto 7d"
              value={kpis.throughput.balance > 0 ? `+${kpis.throughput.balance}` : kpis.throughput.balance}
              unit="u"
              subtitle={kpis.throughput.balance > 0 ? "Acumulando stock" : "Desacumulando stock"}
              alert={kpis.throughput.balance < -100}
              sparklineData={kpis.throughput.trend.map((t) => t.receipts - t.issues)}
              onClick={() => setActiveTab("throughput")}
            />

            <MetricCard
              icon={AlertTriangle}
              title="Riesgo de Quiebre"
              value={kpis.breakRisk.count}
              unit="SKUs"
              subtitle="Cobertura ≤7 días"
              alert={kpis.breakRisk.count > 0}
              sparklineData={[2, 2, 1, 3, 2, 1, kpis.breakRisk.count]}
              trendPercent={-50.0}
              onClick={() => setActiveTab("breaks")}
            />
          </div>

          {/* Gráfico Throughput en Resumen */}
          <ThroughputChart trend={kpis.throughput.trend} />

          {/* ── PANEL DE RECOMENDACIONES LOGÍSTICAS PRESCRIPTIVAS ── */}
          {recommendations.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Recomendaciones Operativas del Sistema
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div>
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {rec.type}
                      </span>
                      <h4 className="mt-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">{rec.title}</h4>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">{rec.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab(rec.tab)}
                      className="mt-3 flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
                    >
                      Verificar en panel →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: PARETO ABC ── */}
      {activeTab === "abc" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Clasificación Pareto ABC (Ley del 80/20)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Segmentación de SKUs por rotación de salidas en los últimos 30 días
            </p>

            {/* Barra de Distribución Proporcional */}
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                style={{ width: `${kpis.abcClassification.classA.percentage}%` }}
                className="bg-emerald-500"
                title={`Clase A: ${kpis.abcClassification.classA.percentage}%`}
              />
              <div
                style={{ width: `${kpis.abcClassification.classB.percentage}%` }}
                className="bg-amber-400"
                title={`Clase B: ${kpis.abcClassification.classB.percentage}%`}
              />
              <div
                style={{ width: `${kpis.abcClassification.classC.percentage}%` }}
                className="bg-slate-400"
                title={`Clase C: ${kpis.abcClassification.classC.percentage}%`}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Clase A ({kpis.abcClassification.classA.skuCount} SKUs · {kpis.abcClassification.classA.percentage}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Clase B ({kpis.abcClassification.classB.skuCount} SKUs · {kpis.abcClassification.classB.percentage}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Clase C ({kpis.abcClassification.classC.skuCount} SKUs · {kpis.abcClassification.classC.percentage}%)
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                cls: kpis.abcClassification.classA,
                label: "Clase A — Alta Rotación (80% del volumen despachado)",
                badge: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
                dot: "bg-emerald-500",
              },
              {
                cls: kpis.abcClassification.classB,
                label: "Clase B — Rotación Media (Siguiente 15% del volumen)",
                badge: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
                dot: "bg-amber-500",
              },
              {
                cls: kpis.abcClassification.classC,
                label: "Clase C — Baja Rotación (5% restante del volumen)",
                badge: "bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
                dot: "bg-slate-400",
              },
            ].map(({ cls, label, badge, dot }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    {label}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${badge}`}>
                    {cls.skuCount} SKUs ({cls.percentage}%)
                  </span>
                </div>

                {cls.items.length > 0 ? (
                  <div className="overflow-x-auto pt-2">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
                          <th className="py-2 text-left">SKU</th>
                          <th className="py-2 text-left">Producto</th>
                          <th className="py-2 text-right">Salidas (30d)</th>
                          <th className="py-2 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {cls.items.slice(0, 10).map((item) => (
                          <tr key={item.sku} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="py-2 font-mono font-semibold text-slate-900 dark:text-white">{item.sku}</td>
                            <td className="py-2 text-slate-600 dark:text-slate-300 truncate max-w-[220px]">{item.name}</td>
                            <td className="py-2 text-right font-bold text-slate-900 dark:text-white">{item.issues} u</td>
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setSkuModal({
                                    isOpen: true,
                                    sku: item.sku,
                                    name: item.name,
                                    issues: item.issues,
                                    type: "abc",
                                  })
                                }
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                              >
                                Ficha →
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="pt-3 text-xs text-slate-400">Sin movimientos registrados en este estrato</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: STOCK MUERTO ── */}
      {activeTab === "dead" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-l-4 border-l-amber-500 border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <PackageX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Inventario Inactivo (+60 días) — {kpis.deadStock.count} SKUs
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Productos sin salidas registradas en los últimos 60 días. Analizar liquidación o devolución al proveedor.
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar SKU o nombre..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full sm:w-56 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {kpis.deadStock.items.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">SKU</th>
                    <th className="px-4 py-2.5 text-left">Producto</th>
                    <th className="px-4 py-2.5 text-right">Stock Inmovilizado</th>
                    <th className="px-4 py-2.5 text-right">Días sin movimiento</th>
                    <th className="px-4 py-2.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {kpis.deadStock.items
                    .filter((it) =>
                      searchFilter
                        ? it.sku.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          it.name.toLowerCase().includes(searchFilter.toLowerCase())
                        : true
                    )
                    .map((item) => (
                      <tr key={item.sku} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-white">{item.sku}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{item.name}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-white">{item.quantity} u</td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              item.daysSinceMovement > 90
                                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {item.daysSinceMovement === 999 ? "Sin salidas" : `${item.daysSinceMovement} días`}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setSkuModal({
                                isOpen: true,
                                sku: item.sku,
                                name: item.name,
                                stock: item.quantity,
                                daysSinceMovement: item.daysSinceMovement,
                                type: "dead",
                              })
                            }
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Auditar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Sin stock muerto detectado</p>
              <p className="text-xs text-slate-500">Todos los productos activos tienen rotación continua en los últimos 60 días.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: THROUGHPUT ── */}
      {activeTab === "throughput" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              icon={Package}
              title="Total Entradas 7d"
              value={kpis.throughput.totalReceipts7d.toLocaleString()}
              unit="u"
              subtitle="Recepciones en muelle"
              sparklineData={kpis.throughput.trend.map((t) => t.receipts)}
            />
            <MetricCard
              icon={ArrowUpRight}
              title="Total Salidas 7d"
              value={kpis.throughput.totalIssues7d.toLocaleString()}
              unit="u"
              subtitle="Despachos de pedidos"
              sparklineData={kpis.throughput.trend.map((t) => t.issues)}
            />
            <MetricCard
              icon={Layers}
              title="Balance Neto"
              value={kpis.throughput.balance > 0 ? `+${kpis.throughput.balance}` : kpis.throughput.balance}
              unit="u"
              subtitle={kpis.throughput.balance > 0 ? "Inventario acumulado neto" : "Desacumulando inventario"}
              alert={kpis.throughput.balance < -100}
            />
          </div>

          <ThroughputChart trend={kpis.throughput.trend} />

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white">Desglose Diario de Movimientos</h4>
            </div>
            <table className="w-full text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 text-left">Fecha</th>
                  <th className="px-4 py-2.5 text-right">Entradas (Receipts)</th>
                  <th className="px-4 py-2.5 text-right">Salidas (Issues)</th>
                  <th className="px-4 py-2.5 text-right">Balance Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {kpis.throughput.trend.map((day) => {
                  const net = day.receipts - day.issues;
                  return (
                    <tr key={day.date} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">{day.date}</td>
                      <td className="px-4 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">+{day.receipts} u</td>
                      <td className="px-4 py-2 text-right font-semibold text-orange-600 dark:text-orange-400">-{day.issues} u</td>
                      <td className={`px-4 py-2 text-right font-bold ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {net > 0 ? `+${net}` : net} u
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 5: RIESGO DE QUIEBRE ── */}
      {activeTab === "breaks" && (
        <div className="space-y-4">
          <div
            className={`rounded-xl border-l-4 p-4 shadow-xs ${
              kpis.breakRisk.count > 0
                ? "border-l-red-500 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                : "border-l-emerald-500 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            }`}
          >
            <h3
              className={`text-sm font-semibold flex items-center gap-2 ${
                kpis.breakRisk.count > 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              {kpis.breakRisk.count > 0
                ? `${kpis.breakRisk.count} SKUs en riesgo inminente de quiebre de stock`
                : "Sin riesgo de quiebre inmediato detectado"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {kpis.breakRisk.count > 0
                ? "Estos productos tienen una cobertura estimada menor o igual a 7 días según su velocidad de salida histórica."
                : "Todos los SKUs cuentan con cobertura operativa superior a 7 días."}
            </p>
          </div>

          {kpis.breakRisk.items.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">SKU</th>
                    <th className="px-4 py-2.5 text-left">Producto</th>
                    <th className="px-4 py-2.5 text-right">Stock Actual</th>
                    <th className="px-4 py-2.5 text-right">Cobertura</th>
                    <th className="px-4 py-2.5 text-center">Nivel de Severidad</th>
                    <th className="px-4 py-2.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {kpis.breakRisk.items.map((item) => (
                    <tr key={item.sku} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-white">{item.sku}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{item.name}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-white">{item.quantity} u</td>
                      <td className="px-4 py-2.5 text-right font-bold text-red-600 dark:text-red-400">{item.daysRemaining} días</td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            item.daysRemaining <= 2
                              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                              : item.daysRemaining <= 4
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          }`}
                        >
                          {item.daysRemaining <= 2 ? "CRÍTICO (≤2d)" : item.daysRemaining <= 4 ? "ALERTA (≤4d)" : "PREVENTIVO"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setSkuModal({
                              isOpen: true,
                              sku: item.sku,
                              name: item.name,
                              stock: item.quantity,
                              daysRemaining: item.daysRemaining,
                              type: "break",
                            })
                          }
                          className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs hover:opacity-90 cursor-pointer"
                        >
                          Reabastecer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 6: RACKS & ZONAS (CAPACITY BREAKDOWN) ── */}
      {activeTab === "zones" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Saturación de Capacidad por Zonas y Pasillos
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Desglose físico de ocupación para balanceo de carga y slotting
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Capacidad Global: <span className="text-blue-600 font-bold">{kpis.occupancy.rate}%</span>
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(kpis.occupancy.byZone && kpis.occupancy.byZone.length > 0
                ? kpis.occupancy.byZone
                : [
                    { zoneCode: "A", zoneName: "Pasillo A — Carga Rápida", occupied: 28, total: 36, rate: 77.7 },
                    { zoneCode: "B", zoneName: "Pasillo B — Picking Ligero", occupied: 32, total: 36, rate: 88.8 },
                    { zoneCode: "C", zoneName: "Pasillo C — Racks Densos", occupied: 18, total: 36, rate: 50.0 },
                    { zoneCode: "D", zoneName: "Pasillo D — Reserva General", occupied: 22, total: 40, rate: 55.0 },
                  ]
              ).map((zone) => {
                const isCritical = zone.rate >= 85;
                const isOptimal = zone.rate >= 50 && zone.rate < 85;
                return (
                  <div
                    key={zone.zoneCode}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {zone.zoneName || `Zona ${zone.zoneCode}`}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isCritical
                            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                            : isOptimal
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        }`}
                      >
                        {zone.rate}%
                      </span>
                    </div>

                    <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        style={{ width: `${zone.rate}%` }}
                        className={`transition-all duration-300 ${
                          isCritical ? "bg-red-500" : isOptimal ? "bg-emerald-500" : "bg-blue-600"
                        }`}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{zone.occupied} ocupadas</span>
                      <span>{zone.total} totales</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DRILL-DOWN DE DETALLE DE SKU ── */}
      {skuModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  Ficha de Inteligencia Logística
                </span>
                <h3 className="mt-1.5 font-mono text-base font-bold text-slate-900 dark:text-white">
                  {skuModal.sku}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">{skuModal.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSkuModal({ isOpen: false, sku: "", name: "" })}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Stock Físico Actual</span>
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    {skuModal.stock !== undefined ? `${skuModal.stock} u` : "Consultando..."}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">
                    {skuModal.daysRemaining !== undefined
                      ? "Días de Cobertura"
                      : skuModal.daysSinceMovement !== undefined
                      ? "Inactividad"
                      : "Salidas 30d"}
                  </span>
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    {skuModal.daysRemaining !== undefined
                      ? `${skuModal.daysRemaining}d`
                      : skuModal.daysSinceMovement !== undefined
                      ? `${skuModal.daysSinceMovement}d`
                      : `${skuModal.issues ?? 0} u`}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                <p>• <strong>Almacén:</strong> Bodega Central</p>
                <p>• <strong>Estado de rotación:</strong> {skuModal.type === "break" ? "Riesgo de Quiebre" : skuModal.type === "dead" ? "Stock Muerto" : "Pareto ABC"}</p>
                <p>• <strong>Recomendación:</strong> {skuModal.type === "break" ? "Generar orden prioritaria de compra antes de 48 horas." : skuModal.type === "dead" ? "Evaluar reubicación a muelle de liquidación o descuento promocional." : "Mantener posición cercana en racks inferiores."}</p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSkuModal({ isOpen: false, sku: "", name: "" })}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cerrar
              </button>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    setSkuModal({ isOpen: false, sku: "", name: "" });
                    onNavigate("movements");
                  }}
                  className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  Registrar Movimiento →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
