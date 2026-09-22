"use client";
import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../../lib/api";

interface KpiData {
  occupancy: {
    rate: number; occupied: number; total: number; alert: boolean;
    byZone: { zoneCode: string; zoneName: string; occupied: number; total: number; rate: number }[];
  };
  abcClassification: {
    classA: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
    classB: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
    classC: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
  };
  deadStock: { count: number; items: { sku: string; name: string; quantity: number; daysSinceMovement: number }[] };
  dsi: { value: number; totalStock: number; avgDailyIssues: number; alert: boolean };
  throughput: { trend: { date: string; receipts: number; issues: number }[]; totalReceipts7d: number; totalIssues7d: number; balance: number };
  ira: { percentage: number; totalAdjustments: number; totalStock: number; deviationRate: number; alert: boolean };
  breakRisk: { count: number; items: { sku: string; name: string; quantity: number; daysRemaining: number }[] };
}

type Period = "7d" | "30d";
type ActiveTab = "overview" | "abc" | "dead" | "throughput" | "breaks";

interface Props {
  token: string;
  organizationId?: string;
  refreshKey?: number;
}

function StatusBadge({ value, alert, unit = "%" }: { value: number | string; alert: boolean; unit?: string }) {
  const color = alert ? "bg-red-100 text-red-700 border-red-300" : "bg-green-100 text-green-700 border-green-300";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${color}`}>
      {alert ? "⚠️" : "✓"} {value}{unit}
    </span>
  );
}

function MetricCard({ title, value, unit, subtitle, alert, icon }: { title: string; value: string | number; unit?: string; subtitle?: string; alert?: boolean; icon: string }) {
  const border = alert ? "border-red-400 bg-red-50" : alert === false ? "border-green-400 bg-green-50" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border-2 p-4 flex flex-col gap-2 shadow-sm ${border}`}>
      <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
        <span className="text-lg">{icon}</span>
        {title}
      </div>
      <div className="text-3xl font-bold text-slate-800 leading-none">
        {value}<span className="text-base font-normal text-slate-400 ml-1">{unit}</span>
      </div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
    </div>
  );
}

function ThroughputChart({ trend }: { trend: { date: string; receipts: number; issues: number }[] }) {
  const maxVal = Math.max(...trend.flatMap((d) => [d.receipts, d.issues]), 1);
  const barWidth = 100 / (trend.length * 3);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">⚡ Throughput — Últimos 7 días</h3>
      <div className="flex items-end gap-0.5 h-32 overflow-hidden">
        {trend.map((day, i) => {
          const rH = Math.round((day.receipts / maxVal) * 100);
          const iH = Math.round((day.issues / maxVal) * 100);
          const label = day.date.slice(5);
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
              <div className="flex items-end gap-0.5 w-full h-24">
                <div title={`Entradas: ${day.receipts}`} style={{ height: `${rH}%` }} className="flex-1 bg-blue-400 rounded-t min-h-[2px]" />
                <div title={`Salidas: ${day.issues}`} style={{ height: `${iH}%` }} className="flex-1 bg-orange-400 rounded-t min-h-[2px]" />
              </div>
              <span className="text-[9px] text-slate-400">{label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" /> Entradas</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block" /> Salidas</span>
      </div>
    </div>
  );
}

export default function KPIPanel({ token, organizationId, refreshKey }: Props) {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  const fetchKpis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (organizationId) params.set("organizationId", organizationId);
      const queryStr = params.toString() ? `?${params}` : "";
      const data = await apiFetch<KpiData>(`/dashboard/kpis${queryStr}`, token);
      setKpis(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, organizationId]);

  useEffect(() => { fetchKpis(); }, [fetchKpis, refreshKey]);

  const tabs: { id: ActiveTab; label: string; icon: string }[] = [
    { id: "overview", label: "Resumen", icon: "🏢" },
    { id: "abc", label: "Pareto ABC", icon: "📊" },
    { id: "dead", label: "Stock Muerto", icon: "💀" },
    { id: "throughput", label: "Throughput", icon: "⚡" },
    { id: "breaks", label: "Riesgo Quiebre", icon: "🚨" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-500">
      <div className="text-center">
        <div className="animate-spin text-4xl mb-3">⚙️</div>
        <p>Calculando KPIs...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-500">
      <div className="text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="font-medium">Error cargando KPIs</p>
        <p className="text-sm text-slate-400 mt-1">{error}</p>
        <button onClick={fetchKpis} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Reintentar
        </button>
      </div>
    </div>
  );

  if (!kpis) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">🎯 Centro de Mando — KPIs Logísticos</h2>
          <p className="text-sm text-slate-500">Inteligencia operativa en tiempo real para toma de decisiones</p>
        </div>
        <button onClick={fetchKpis} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors">
          🔄 Actualizar
        </button>
      </div>

      {/* Alert Banner */}
      {(kpis.occupancy.alert || kpis.dsi.alert || kpis.ira.alert || kpis.breakRisk.count > 0) && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex flex-wrap gap-3">
          <span className="font-semibold text-red-700 text-sm">🚨 Alertas activas:</span>
          {kpis.occupancy.alert && <span className="text-sm text-red-600">Ocupación crítica ({kpis.occupancy.rate}%)</span>}
          {kpis.dsi.alert && <span className="text-sm text-red-600">Stock bajo ({kpis.dsi.value}d cobertura)</span>}
          {kpis.ira.alert && <span className="text-sm text-red-600">IRA bajo objetivo ({kpis.ira.percentage}%)</span>}
          {kpis.breakRisk.count > 0 && <span className="text-sm text-red-600">{kpis.breakRisk.count} SKU(s) en riesgo de quiebre</span>}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === t.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            icon="🏢" title="Ocupación Global"
            value={kpis.occupancy.rate} unit="%"
            subtitle={`${kpis.occupancy.occupied} de ${kpis.occupancy.total} ubicaciones`}
            alert={kpis.occupancy.alert}
          />
          <MetricCard
            icon="📅" title="Días de Cobertura (DSI)"
            value={kpis.dsi.value === 9999 ? "∞" : kpis.dsi.value} unit={kpis.dsi.value !== 9999 ? "días" : ""}
            subtitle={`Salida diaria promedio: ${kpis.dsi.avgDailyIssues} u/d`}
            alert={kpis.dsi.alert}
          />
          <MetricCard
            icon="🎯" title="Exactitud Inventario (IRA)"
            value={kpis.ira.percentage} unit="%"
            subtitle={`${kpis.ira.totalAdjustments} ajuste(s) en 30d · Objetivo ≥98%`}
            alert={kpis.ira.alert}
          />
          <MetricCard
            icon="💀" title="Stock Muerto"
            value={kpis.deadStock.count} unit="SKUs"
            subtitle="Sin movimiento +60 días"
            alert={kpis.deadStock.count > 0}
          />
          <MetricCard
            icon="📦" title="Entradas 7d"
            value={kpis.throughput.totalReceipts7d} unit="u"
            subtitle="Total recepciones"
          />
          <MetricCard
            icon="🚀" title="Salidas 7d"
            value={kpis.throughput.totalIssues7d} unit="u"
            subtitle="Total despachos"
          />
          <MetricCard
            icon="⚖️" title="Balance Neto 7d"
            value={kpis.throughput.balance > 0 ? `+${kpis.throughput.balance}` : kpis.throughput.balance} unit="u"
            subtitle={kpis.throughput.balance > 0 ? "Acumulando stock" : "Desacumulando stock"}
            alert={kpis.throughput.balance < -100}
          />
          <MetricCard
            icon="🚨" title="Riesgo de Quiebre"
            value={kpis.breakRisk.count} unit="SKUs"
            subtitle="Cobertura ≤7 días"
            alert={kpis.breakRisk.count > 0}
          />
        </div>
      )}

      {/* ABC CLASSIFICATION TAB */}
      {activeTab === "abc" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Clasificación Pareto ABC basada en salidas de los últimos 30 días</p>
          {[
            { cls: kpis.abcClassification.classA, label: "Clase A — Alta Rotación (80% salidas)", color: "bg-green-100 border-green-300 text-green-800", dot: "bg-green-500" },
            { cls: kpis.abcClassification.classB, label: "Clase B — Media Rotación (hasta 95%)", color: "bg-yellow-100 border-yellow-300 text-yellow-800", dot: "bg-yellow-500" },
            { cls: kpis.abcClassification.classC, label: "Clase C — Baja Rotación (resto)", color: "bg-slate-100 border-slate-300 text-slate-700", dot: "bg-slate-400" },
          ].map(({ cls, label, color, dot }) => (
            <div key={label} className={`rounded-xl border p-4 ${color}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${dot}`} />
                  {label}
                </span>
                <span className="text-sm">{cls.skuCount} SKUs ({cls.percentage}%)</span>
              </div>
              {cls.items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="opacity-70">
                        <th className="text-left py-1 pr-4">SKU</th>
                        <th className="text-left py-1 pr-4">Nombre</th>
                        <th className="text-right py-1">Salidas 30d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cls.items.slice(0, 10).map((item) => (
                        <tr key={item.sku} className="border-t border-current border-opacity-10">
                          <td className="py-1 pr-4 font-mono font-semibold">{item.sku}</td>
                          <td className="py-1 pr-4 truncate max-w-[180px]">{item.name}</td>
                          <td className="py-1 text-right font-semibold">{item.issues} u</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {cls.items.length > 10 && <p className="text-xs opacity-60 mt-1">+{cls.items.length - 10} más...</p>}
                </div>
              )}
              {cls.items.length === 0 && <p className="text-xs opacity-60">Sin datos de movimientos en 30 días</p>}
            </div>
          ))}
        </div>
      )}

      {/* DEAD STOCK TAB */}
      {activeTab === "dead" && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
            <h3 className="font-semibold text-amber-800 mb-1">💀 Inventario Inactivo — {kpis.deadStock.count} SKUs</h3>
            <p className="text-sm text-amber-700">Productos sin salidas en más de 60 días. Considera liquidar, devolver al proveedor o reubicar.</p>
          </div>
          {kpis.deadStock.items.length > 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3">SKU</th>
                    <th className="text-left px-4 py-3">Nombre</th>
                    <th className="text-right px-4 py-3">Stock</th>
                    <th className="text-right px-4 py-3">Días sin movimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kpis.deadStock.items.map((item) => (
                    <tr key={item.sku} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{item.sku}</td>
                      <td className="px-4 py-2.5 text-slate-600">{item.name}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{item.quantity} u</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-semibold ${item.daysSinceMovement > 90 ? "text-red-600" : "text-amber-600"}`}>
                          {item.daysSinceMovement === 999 ? "Nunca" : `${item.daysSinceMovement}d`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-green-600">
              <div className="text-4xl mb-2">✅</div>
              <p className="font-medium">Sin stock muerto detectado</p>
              <p className="text-sm text-slate-400">Todos los productos tienen movimientos recientes</p>
            </div>
          )}
        </div>
      )}

      {/* THROUGHPUT TAB */}
      {activeTab === "throughput" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard icon="📦" title="Total Entradas 7d" value={kpis.throughput.totalReceipts7d} unit="u" />
            <MetricCard icon="🚀" title="Total Salidas 7d" value={kpis.throughput.totalIssues7d} unit="u" />
            <MetricCard
              icon="⚖️" title="Balance Neto"
              value={kpis.throughput.balance > 0 ? `+${kpis.throughput.balance}` : kpis.throughput.balance} unit="u"
              alert={kpis.throughput.balance < -100}
            />
          </div>
          <ThroughputChart trend={kpis.throughput.trend} />
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3">Fecha</th>
                  <th className="text-right px-4 py-3">Entradas</th>
                  <th className="text-right px-4 py-3">Salidas</th>
                  <th className="text-right px-4 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kpis.throughput.trend.map((day) => (
                  <tr key={day.date} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{day.date}</td>
                    <td className="px-4 py-2.5 text-right text-blue-600 font-medium">{day.receipts}</td>
                    <td className="px-4 py-2.5 text-right text-orange-600 font-medium">{day.issues}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${day.receipts - day.issues >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {day.receipts - day.issues > 0 ? "+" : ""}{day.receipts - day.issues}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BREAK RISK TAB */}
      {activeTab === "breaks" && (
        <div className="space-y-3">
          <div className={`rounded-xl border p-4 ${kpis.breakRisk.count > 0 ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"}`}>
            <h3 className={`font-semibold mb-1 ${kpis.breakRisk.count > 0 ? "text-red-800" : "text-green-800"}`}>
              {kpis.breakRisk.count > 0 ? `🚨 ${kpis.breakRisk.count} SKUs en riesgo de quiebre` : "✅ Sin riesgo de quiebre inmediato"}
            </h3>
            <p className={`text-sm ${kpis.breakRisk.count > 0 ? "text-red-700" : "text-green-700"}`}>
              {kpis.breakRisk.count > 0 ? "Estos productos tienen cobertura ≤7 días según rotación histórica." : "Todos los SKUs tienen cobertura superior a 7 días."}
            </p>
          </div>
          {kpis.breakRisk.items.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3">SKU</th>
                    <th className="text-left px-4 py-3">Nombre</th>
                    <th className="text-right px-4 py-3">Stock</th>
                    <th className="text-right px-4 py-3">Días restantes</th>
                    <th className="text-center px-4 py-3">Alerta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kpis.breakRisk.items.map((item) => (
                    <tr key={item.sku} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{item.sku}</td>
                      <td className="px-4 py-2.5 text-slate-600">{item.name}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{item.quantity} u</td>
                      <td className="px-4 py-2.5 text-right font-bold text-red-600">{item.daysRemaining}d</td>
                      <td className="px-4 py-2.5 text-center">
                        {item.daysRemaining <= 2 ? "🔴 CRÍTICO" : item.daysRemaining <= 5 ? "🟡 BAJO" : "🟠 ATENCIÓN"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
